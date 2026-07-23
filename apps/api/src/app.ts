import { randomUUID } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import {
  answerSchema,
  completeInterviewSchema,
  createJobSchema,
  decisionSchema,
  followUpAnswerSchema,
  loginSchema,
  practiceEvaluationSchema,
  practiceFollowUpSchema,
  registrationSchema,
  startInterviewSchema,
} from '@cybervett/contracts'
import type { AppConfig } from './config/env.js'
import type { SessionRecord, Store, UserRecord } from './domain/types.js'
import { AppError, forbidden, notFound, unauthorized } from './http/errors.js'
import type { Evaluator } from './services/evaluator.js'
import type { InterviewConductor } from './services/interview-conductor.js'
import { createOpaqueToken, digestToken } from './utils/security.js'

type AuthClaims = {
  sub: string
  organizationId: string
  role: UserRecord['role']
  mode: UserRecord['mode']
  csrf: string
  scope: 'user'
}

type CandidateClaims = {
  sub: string
  scope: 'candidate'
}

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const RESUME_LIFETIME_MS = 24 * 60 * 60 * 1000
const uuidSchema = z.string().uuid()
const capabilityTokenSchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9_-]+$/)
const resumeInterviewSchema = z.object({
  resumeToken: capabilityTokenSchema,
})

export type AppDependencies = {
  config: AppConfig
  store: Store
  evaluator: Evaluator
  practiceEvaluator?: Evaluator
  conductor: InterviewConductor
}

export async function buildApp({
  config,
  store,
  evaluator,
  practiceEvaluator = evaluator,
  conductor,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : {
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'request.headers.authorization',
          'request.headers.cookie',
        ],
        censor: '[REDACTED]',
      },
    },
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: (request) => canonicalRequestId(request.headers['x-request-id']),
    bodyLimit: 1_000_000,
    trustProxy: config.NODE_ENV === 'production' ? 1 : false,
  })

  await app.register(helmet, { global: true })
  await app.register(cors, {
    origin: config.APP_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'authorization', 'x-request-id'],
  })
  await app.register(cookie)
  await app.register(jwt, {
    secret: config.AUTH_SECRET,
    cookie: { cookieName: 'cybervett_session', signed: false },
  })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  app.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      route: request.routeOptions.url ?? '<unmatched>',
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(reply.elapsedTime),
    }, 'request completed')
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId: request.id, details: error.details },
      })
    }
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Please check the information you entered.', requestId: request.id },
      })
    }
    request.log.error({
      err: error,
      route: request.routeOptions.url ?? '<unmatched>',
    }, 'request failed')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId: request.id },
    })
  })

  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async (_request, reply) => {
    const ready = await store.ready()
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready' })
  })

  app.register(async (api) => {
    api.post('/auth/register', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
      const input = registrationSchema.parse(request.body)
      const passwordHash = await hash(input.password, 12)
      const user = await store.registerOrganization(input, passwordHash)
      if (!user) throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email address.')
      await store.logAudit({ organizationId: user.organizationId, actorId: user.id, action: 'account.registered', entityType: 'user', entityId: user.id, requestId: request.id })
      return issueUserSession(reply, user, config.NODE_ENV === 'production')
    })

    api.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const input = loginSchema.parse(request.body)
      const user = await store.findUserByEmail(input.email)
      if (!user || !(await compare(input.password, user.passwordHash))) throw unauthorized('Email or password is incorrect.')
      return issueUserSession(reply, user, config.NODE_ENV === 'production')
    })

    api.get('/auth/session', async (request) => {
      const claims = await requireUser(request, app, store)
      const user = await store.findUserById(claims.sub)
      if (!user) throw unauthorized()
      return { user: publicUser(user), csrfToken: claims.csrf }
    })

    api.post('/auth/logout', async (request, reply) => {
      const claims = await requireUser(request, app, store)
      requireCsrf(request, claims)
      reply.clearCookie('cybervett_session', { path: '/' })
      return reply.status(204).send()
    })

    api.get('/dashboard', async (request) => {
      const claims = await requireTrainer(request, app, store)
      return store.getDashboard(claims.organizationId)
    })

    api.get('/jobs', async (request) => {
      const claims = await requireTrainer(request, app, store)
      return store.listJobs(claims.organizationId)
    })

    api.post('/jobs', async (request, reply) => {
      const claims = await requireTrainer(request, app, store)
      requireCsrf(request, claims)
      if (!['admin', 'recruiter'].includes(claims.role)) throw forbidden()
      const job = await store.createJob(claims.organizationId, createJobSchema.parse(request.body))
      await store.logAudit({ organizationId: claims.organizationId, actorId: claims.sub, action: 'job.created', entityType: 'job', entityId: job.id, requestId: request.id })
      return reply.status(201).send(job)
    })

    api.post('/jobs/:jobId/invitations', async (request, reply) => {
      const claims = await requireTrainer(request, app, store)
      requireCsrf(request, claims)
      if (!['admin', 'recruiter'].includes(claims.role)) throw forbidden()
      const jobId = uuidSchema.parse((request.params as { jobId: string }).jobId)
      const token = createOpaqueToken()
      const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS).toISOString()
      const created = await store.createInvitation(claims.organizationId, jobId, digestToken(token), expiresAt)
      if (!created) throw notFound('Active role not found.')
      await store.logAudit({ organizationId: claims.organizationId, actorId: claims.sub, action: 'invitation.created', entityType: 'interview_session', entityId: created.sessionId, requestId: request.id })
      return reply.status(201).send({
        inviteUrl: `${config.APP_ORIGIN.split(',')[0]}/invite/${token}`,
        expiresAt: created.expiresAt,
      })
    })

    api.delete('/invitations/:sessionId', async (request, reply) => {
      const claims = await requireTrainer(request, app, store)
      requireCsrf(request, claims)
      if (!['admin', 'recruiter'].includes(claims.role)) throw forbidden()
      const sessionId = uuidSchema.parse((request.params as { sessionId: string }).sessionId)
      const result = await store.revokeInvitation(claims.organizationId, sessionId, {
        organizationId: claims.organizationId,
        actorId: claims.sub,
        action: 'invitation.revoked',
        entityType: 'interview_session',
        entityId: sessionId,
        requestId: request.id,
      })
      if (result.kind === 'not_found') throw notFound('Invitation not found.')
      if (result.kind === 'conflict') {
        throw new AppError(409, 'INVITATION_NOT_REVOCABLE', 'Only active invitations can be revoked.')
      }
      return reply.status(204).send()
    })

    api.get('/reports/:reportId', async (request) => {
      const claims = await requireTrainer(request, app, store)
      const reportId = uuidSchema.parse((request.params as { reportId: string }).reportId)
      const report = await store.getReport(claims.organizationId, reportId)
      if (!report) throw notFound('Report not found.')
      return report
    })

    api.patch('/reports/:reportId/decision', async (request) => {
      const claims = await requireTrainer(request, app, store)
      requireCsrf(request, claims)
      const reportId = uuidSchema.parse((request.params as { reportId: string }).reportId)
      const input = decisionSchema.parse(request.body)
      const result = await store.updateDecision(
        claims.organizationId,
        reportId,
        input.decision,
        input.note,
        {
          organizationId: claims.organizationId,
          actorId: claims.sub,
          action: `candidate.${input.decision}`,
          entityType: 'report',
          entityId: reportId,
          requestId: request.id,
        },
      )
      if (result.kind === 'not_found') throw notFound('Report not found.')
      if (result.kind === 'conflict') {
        throw new AppError(
          409,
          'DECISION_TRANSITION_CONFLICT',
          'Reopen this candidate for review before changing one final outcome to another.',
        )
      }
      return result.report
    })

    api.get('/public/invitations/:token', async (request) => {
      const token = capabilityTokenSchema.parse((request.params as { token: string }).token)
      const result = await store.getInvitationByDigest(digestToken(token))
      if (!result) throw notFound('This interview link is invalid or has expired.')
      assertInvitationAvailable(result.session)
      return {
        sessionId: result.session.id,
        organizationName: result.organizationName,
        job: {
          title: result.job.title,
          department: result.job.department,
          location: result.job.location,
          durationMinutes: result.job.durationMinutes,
          questionCount: result.job.questions.length,
        },
        status: result.session.status,
        expiresAt: result.session.inviteExpiresAt,
        privacy: {
          cameraRequired: false,
          emotionAnalysis: false,
          notice: 'A conversational interviewer asks one job-related follow-up per question. AI may assist with the report, but a person makes the hiring decision.',
        },
      }
    })

    api.post('/public/invitations/:token/start', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
      const token = capabilityTokenSchema.parse((request.params as { token: string }).token)
      const input = startInterviewSchema.parse(request.body)
      const resumeExpiresAt = new Date(Date.now() + RESUME_LIFETIME_MS).toISOString()
      const session = await store.startInvitation(
        digestToken(token),
        input.name,
        input.email,
        digestToken(input.resumeToken),
        resumeExpiresAt,
      )
      if (!session) {
        const current = await store.getInvitationByDigest(digestToken(token))
        if (!current) throw notFound('This interview link is invalid or has expired.')
        assertInvitationAvailable(current.session)
        throw new AppError(
          409,
          'INVITATION_ALREADY_STARTED',
          'This invitation has already been started. Resume it from the original browser tab or contact the hiring team.',
        )
      }
      return candidateSessionPayload(
        session,
        app.jwt.sign({ sub: session.id, scope: 'candidate' } satisfies CandidateClaims, { expiresIn: '3h' }),
        input.resumeToken,
      )
    })

    api.post('/public/interviews/:sessionId/resume', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
      const sessionId = uuidSchema.parse((request.params as { sessionId: string }).sessionId)
      const { resumeToken } = resumeInterviewSchema.parse(request.body)
      const session = await store.resumeInvitation(
        sessionId,
        digestToken(resumeToken),
      )
      if (!session) {
        throw unauthorized('Interview resume access has expired or was revoked. Reopen the original interview tab or contact the hiring team.')
      }
      return candidateSessionPayload(
        session,
        app.jwt.sign({ sub: session.id, scope: 'candidate' } satisfies CandidateClaims, { expiresIn: '3h' }),
        resumeToken,
      )
    })

    api.put('/public/interviews/:sessionId/answers', async (request) => {
      const sessionId = uuidSchema.parse((request.params as { sessionId: string }).sessionId)
      requireCandidate(request, app, sessionId)
      const input = answerSchema.parse(request.body)
      const saved = await store.saveAnswer(sessionId, input.questionId, input.answer)
      if (!saved) throw new AppError(409, 'ANSWER_NOT_SAVED', 'This interview answer can no longer be updated.')
      const { session, answerRevision } = saved
      const question = session.questions.find((item) => item.id === input.questionId)
      if (!question) throw notFound('Interview question not found.')
      const followUpPrompt = await conductor.createFollowUp({
        roleTitle: session.jobTitle,
        competency: question.competency,
        question: question.prompt,
        answer: input.answer,
        locale: input.locale,
      })
      const updated = await store.saveFollowUpPrompt(sessionId, input.questionId, followUpPrompt, answerRevision)
      if (!updated) {
        throw new AppError(
          409,
          'ANSWER_SUPERSEDED',
          'A newer answer was saved before this follow-up was ready. Continue with the latest response.',
        )
      }
      return { saved: true, followUpPrompt, answeredCount: session.answers.length, totalCount: session.questions.length }
    })

    api.put('/public/interviews/:sessionId/follow-up', async (request) => {
      const sessionId = uuidSchema.parse((request.params as { sessionId: string }).sessionId)
      requireCandidate(request, app, sessionId)
      const input = followUpAnswerSchema.parse(request.body)
      const session = await store.saveFollowUpAnswer(sessionId, input.questionId, input.answer)
      if (!session) throw new AppError(409, 'FOLLOW_UP_NOT_READY', 'This follow-up question is no longer active.')
      return { saved: true, answeredCount: session.answers.length, totalCount: session.questions.length }
    })

    api.post('/public/interviews/:sessionId/complete', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
      const sessionId = uuidSchema.parse((request.params as { sessionId: string }).sessionId)
      requireCandidate(request, app, sessionId)
      const { locale } = completeInterviewSchema.parse(request.body ?? {})
      const claim = await store.claimSessionForCompletion(sessionId)
      if (claim.kind === 'not_found') throw notFound('Interview not found.')
      if (claim.kind === 'existing') {
        return {
          completed: true,
          assessmentStatus: claim.report.assessmentStatus,
          message: 'Your interview was already submitted for human review.',
        }
      }
      if (claim.kind === 'pending') {
        reply.header('retry-after', '5')
        return reply.status(202).send({
          completed: false,
          processing: true,
          message: 'Your answers are locked for submission, but the report is not ready yet. Please retry shortly.',
        })
      }
      if (claim.kind === 'inactive') {
        throw new AppError(409, 'INTERVIEW_NOT_ACTIVE', 'This interview is not active.')
      }
      if (claim.kind === 'incomplete') {
        throw new AppError(
          409,
          'INTERVIEW_INCOMPLETE',
          'Please answer every question and active follow-up before submitting.',
        )
      }
      const evaluation = await evaluator.evaluate(claim.session, locale)
      const report = await store.completeSession(sessionId, evaluation)
      if (!report) throw new AppError(409, 'INTERVIEW_NOT_COMPLETED', 'The interview could not be completed.')
      return {
        completed: true,
        assessmentStatus: report.assessmentStatus,
        message: report.assessmentStatus === 'unavailable'
          ? 'Your interview was submitted. The automated assessment was unavailable, so the hiring team must review your answers directly.'
          : 'Your interview was submitted for human review.',
      }
    })

    api.post('/practice/follow-up', async (request) => {
      const claims = await requireUser(request, app, store)
      requireCsrf(request, claims)
      if (claims.mode !== 'trainee') throw forbidden('Practice interviews are available in Trainee mode.')
      const input = practiceFollowUpSchema.parse(request.body)
      const followUpPrompt = await conductor.createFollowUp(input)
      return { followUpPrompt }
    })

    api.post('/practice/evaluate', async (request) => {
      const claims = await requireUser(request, app, store)
      requireCsrf(request, claims)
      if (claims.mode !== 'trainee') throw forbidden('Practice interviews are available in Trainee mode.')
      const input = practiceEvaluationSchema.parse(request.body)
      const now = new Date().toISOString()
      const evaluation = await practiceEvaluator.evaluate({
        id: randomUUID(),
        reportId: null,
        name: 'Practice candidate',
        email: 'practice@invalid.local',
        jobId: randomUUID(),
        jobTitle: input.roleTitle,
        status: 'completed',
        score: null,
        completedAt: now,
        organizationId: claims.organizationId,
        inviteTokenDigest: '',
        questions: input.turns.map((turn) => ({ id: turn.questionId, competency: turn.competency, prompt: turn.question })),
        answers: input.turns.map((turn) => ({
          questionId: turn.questionId,
          answer: turn.answer,
          followUpPrompt: turn.followUpPrompt,
          followUpAnswer: turn.followUpAnswer,
          followUpPending: false,
          revision: 1,
          submittedAt: now,
        })),
        consentedAt: now,
        startedAt: now,
        reviewerNote: null,
        inviteExpiresAt: now,
        inviteRevokedAt: null,
        inviteConsumedAt: now,
        resumeTokenDigest: null,
        resumeExpiresAt: null,
        evaluationStartedAt: null,
      }, input.locale)
      return evaluation
    })
  }, { prefix: '/api/v1' })

  app.addHook('onClose', async () => store.close())
  return app
}

async function requireUser(
  request: FastifyRequest,
  app: FastifyInstance,
  store: Store,
): Promise<AuthClaims> {
  const token = request.cookies.cybervett_session
  if (!token) throw unauthorized()
  let claims: AuthClaims
  try {
    claims = app.jwt.verify<AuthClaims>(token)
  } catch {
    throw unauthorized()
  }
  if (claims.scope !== 'user') throw unauthorized()
  const current = await store.findUserById(claims.sub)
  if (
    !current
    || current.organizationId !== claims.organizationId
    || current.role !== claims.role
    || current.mode !== claims.mode
  ) throw unauthorized()
  return claims
}

async function requireTrainer(
  request: FastifyRequest,
  app: FastifyInstance,
  store: Store,
): Promise<AuthClaims> {
  const claims = await requireUser(request, app, store)
  if (claims.mode !== 'trainer') throw forbidden('This action is available in Trainer mode.')
  return claims
}

function requireCandidate(request: FastifyRequest, app: FastifyInstance, sessionId: string): CandidateClaims {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) throw unauthorized('Interview access has expired. Please reopen your invitation link.')
  try {
    const claims = app.jwt.verify<CandidateClaims>(authorization.slice(7))
    if (claims.scope !== 'candidate' || claims.sub !== sessionId) throw unauthorized()
    return claims
  } catch {
    throw unauthorized('Interview access has expired. Please reopen your invitation link.')
  }
}

function requireCsrf(request: FastifyRequest, claims: AuthClaims): void {
  if (request.headers['x-csrf-token'] !== claims.csrf) throw forbidden('Security token is missing or expired. Refresh the page and try again.')
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mode: user.mode,
    organizationName: user.organizationName,
  }
}

function canonicalRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && /^[A-Za-z0-9._:-]{1,100}$/.test(candidate) ? candidate : randomUUID()
}

function assertInvitationAvailable(session: SessionRecord): void {
  if (session.inviteRevokedAt || session.status === 'revoked') {
    throw new AppError(410, 'INVITATION_REVOKED', 'This invitation was revoked by the hiring team.')
  }
  if (new Date(session.inviteExpiresAt).getTime() <= Date.now() && session.status === 'invited') {
    throw new AppError(410, 'INVITATION_EXPIRED', 'This invitation has expired. Ask the hiring team for a new link.')
  }
  if (
    ['review', 'shortlisted', 'declined'].includes(session.status)
    || (session.status === 'completed' && session.reportId)
  ) {
    throw new AppError(409, 'INVITATION_COMPLETED', 'This interview was already submitted.')
  }
}

function candidateSessionPayload(
  session: SessionRecord,
  accessToken: string,
  resumeToken: string,
) {
  return {
    sessionId: session.id,
    accessToken,
    resumeToken,
    candidateName: session.name,
    questions: session.questions,
    answers: session.answers.map(({ questionId, answer, followUpPrompt, followUpAnswer, followUpPending }) => ({
      questionId,
      answer,
      followUpPrompt,
      followUpAnswer,
      followUpPending,
    })),
  }
}

async function issueUserSession(reply: FastifyReply, user: UserRecord, secureCookie: boolean) {
  const csrf = createOpaqueToken()
  const token = await reply.jwtSign({
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
    mode: user.mode,
    csrf,
    scope: 'user',
  } satisfies AuthClaims, { expiresIn: '8h' })
  reply.setCookie('cybervett_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    maxAge: 8 * 60 * 60,
  })
  return { user: publicUser(user), csrfToken: csrf }
}
