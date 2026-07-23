import { randomUUID } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
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
import type { Store, UserRecord } from './domain/types.js'
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

export type AppDependencies = {
  config: AppConfig
  store: Store
  evaluator: Evaluator
  conductor: InterviewConductor
}

export async function buildApp({ config, store, evaluator, conductor }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
    genReqId: (request) => request.headers['x-request-id']?.toString() ?? randomUUID(),
    bodyLimit: 1_000_000,
    trustProxy: config.NODE_ENV === 'production',
  })

  await app.register(helmet, { global: true })
  await app.register(cors, {
    origin: config.APP_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: ['content-type', 'x-csrf-token', 'authorization', 'x-request-id'],
  })
  await app.register(cookie)
  await app.register(jwt, {
    secret: config.AUTH_SECRET,
    cookie: { cookieName: 'cybervett_session', signed: false },
  })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

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
    request.log.error(error)
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
      const claims = requireUser(request, app)
      const user = await store.findUserById(claims.sub)
      if (!user) throw unauthorized()
      return { user: publicUser(user), csrfToken: claims.csrf }
    })

    api.post('/auth/logout', async (request, reply) => {
      const claims = requireUser(request, app)
      requireCsrf(request, claims)
      reply.clearCookie('cybervett_session', { path: '/' })
      return reply.status(204).send()
    })

    api.get('/dashboard', async (request) => {
      const claims = requireTrainer(request, app)
      return store.getDashboard(claims.organizationId)
    })

    api.get('/jobs', async (request) => {
      const claims = requireTrainer(request, app)
      return store.listJobs(claims.organizationId)
    })

    api.post('/jobs', async (request, reply) => {
      const claims = requireTrainer(request, app)
      requireCsrf(request, claims)
      if (!['admin', 'recruiter'].includes(claims.role)) throw forbidden()
      const job = await store.createJob(claims.organizationId, createJobSchema.parse(request.body))
      await store.logAudit({ organizationId: claims.organizationId, actorId: claims.sub, action: 'job.created', entityType: 'job', entityId: job.id, requestId: request.id })
      return reply.status(201).send(job)
    })

    api.post('/jobs/:jobId/invitations', async (request, reply) => {
      const claims = requireTrainer(request, app)
      requireCsrf(request, claims)
      if (!['admin', 'recruiter'].includes(claims.role)) throw forbidden()
      const { jobId } = request.params as { jobId: string }
      const token = createOpaqueToken()
      const created = await store.createInvitation(claims.organizationId, jobId, digestToken(token))
      await store.logAudit({ organizationId: claims.organizationId, actorId: claims.sub, action: 'invitation.created', entityType: 'interview_session', entityId: created.sessionId, requestId: request.id })
      return reply.status(201).send({ inviteUrl: `${config.APP_ORIGIN.split(',')[0]}/invite/${token}` })
    })

    api.get('/reports/:reportId', async (request) => {
      const claims = requireTrainer(request, app)
      const { reportId } = request.params as { reportId: string }
      const report = await store.getReport(claims.organizationId, reportId)
      if (!report) throw notFound('Report not found.')
      return report
    })

    api.patch('/reports/:reportId/decision', async (request) => {
      const claims = requireTrainer(request, app)
      requireCsrf(request, claims)
      const { reportId } = request.params as { reportId: string }
      const input = decisionSchema.parse(request.body)
      const report = await store.updateDecision(claims.organizationId, reportId, input.decision, input.note)
      if (!report) throw notFound('Report not found.')
      await store.logAudit({ organizationId: claims.organizationId, actorId: claims.sub, action: `candidate.${input.decision}`, entityType: 'report', entityId: reportId, requestId: request.id })
      return report
    })

    api.get('/public/invitations/:token', async (request) => {
      const { token } = request.params as { token: string }
      const result = await store.getInvitationByDigest(digestToken(token))
      if (!result) throw notFound('This interview link is invalid or has expired.')
      return {
        organizationName: result.organizationName,
        job: {
          title: result.job.title,
          department: result.job.department,
          location: result.job.location,
          durationMinutes: result.job.durationMinutes,
          questionCount: result.job.questions.length,
        },
        status: result.session.status,
        privacy: {
          cameraRequired: false,
          emotionAnalysis: false,
          notice: 'A conversational interviewer asks one job-related follow-up per question. AI may assist with the report, but a person makes the hiring decision.',
        },
      }
    })

    api.post('/public/invitations/:token/start', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
      const { token } = request.params as { token: string }
      const input = startInterviewSchema.parse(request.body)
      const session = await store.startInvitation(digestToken(token), input.name, input.email)
      if (!session) throw notFound('This interview cannot be started.')
      const accessToken = app.jwt.sign({ sub: session.id, scope: 'candidate' } satisfies CandidateClaims, { expiresIn: '3h' })
      return {
        sessionId: session.id,
        accessToken,
        questions: session.questions,
        answers: session.answers.map(({ questionId, answer, followUpPrompt, followUpAnswer }) => ({ questionId, answer, followUpPrompt, followUpAnswer })),
      }
    })

    api.put('/public/interviews/:sessionId/answers', async (request) => {
      const { sessionId } = request.params as { sessionId: string }
      requireCandidate(request, app, sessionId)
      const input = answerSchema.parse(request.body)
      const session = await store.saveAnswer(sessionId, input.questionId, input.answer)
      if (!session) throw notFound('The interview question could not be updated.')
      const question = session.questions.find((item) => item.id === input.questionId)
      if (!question) throw notFound('Interview question not found.')
      const followUpPrompt = await conductor.createFollowUp({
        roleTitle: session.jobTitle,
        competency: question.competency,
        question: question.prompt,
        answer: input.answer,
        locale: input.locale,
      })
      await store.saveFollowUpPrompt(sessionId, input.questionId, followUpPrompt)
      return { saved: true, followUpPrompt, answeredCount: session.answers.length, totalCount: session.questions.length }
    })

    api.put('/public/interviews/:sessionId/follow-up', async (request) => {
      const { sessionId } = request.params as { sessionId: string }
      requireCandidate(request, app, sessionId)
      const input = followUpAnswerSchema.parse(request.body)
      const session = await store.saveFollowUpAnswer(sessionId, input.questionId, input.answer)
      if (!session) throw new AppError(409, 'FOLLOW_UP_NOT_READY', 'This follow-up question is no longer active.')
      return { saved: true, answeredCount: session.answers.length, totalCount: session.questions.length }
    })

    api.post('/public/interviews/:sessionId/complete', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request) => {
      const { sessionId } = request.params as { sessionId: string }
      requireCandidate(request, app, sessionId)
      const session = await store.getSession(sessionId)
      if (!session) throw notFound('Interview not found.')
      if (['review', 'shortlisted', 'declined'].includes(session.status)) {
        return { completed: true, message: 'Your interview was already submitted for human review.' }
      }
      if (session.status !== 'in_progress') {
        throw new AppError(409, 'INTERVIEW_NOT_ACTIVE', 'This interview is not active.')
      }
      if (session.answers.length < session.questions.length) {
        throw new AppError(409, 'INTERVIEW_INCOMPLETE', 'Please answer every question before submitting.')
      }
      if (session.answers.some((answer) => answer.followUpPrompt && !answer.followUpAnswer)) {
        throw new AppError(409, 'FOLLOW_UP_INCOMPLETE', 'Please answer the active follow-up question before submitting.')
      }
      const { locale } = completeInterviewSchema.parse(request.body ?? {})
      const evaluation = await evaluator.evaluate(session, locale)
      const report = await store.completeSession(sessionId, evaluation)
      if (!report) throw new AppError(409, 'INTERVIEW_NOT_COMPLETED', 'The interview could not be completed.')
      return { completed: true, message: 'Your interview was submitted for human review.' }
    })

    api.post('/practice/follow-up', async (request) => {
      const claims = requireUser(request, app)
      requireCsrf(request, claims)
      if (claims.mode !== 'trainee') throw forbidden('Practice interviews are available in Trainee mode.')
      const input = practiceFollowUpSchema.parse(request.body)
      const followUpPrompt = await conductor.createFollowUp(input)
      return { followUpPrompt }
    })

    api.post('/practice/evaluate', async (request) => {
      const claims = requireUser(request, app)
      requireCsrf(request, claims)
      if (claims.mode !== 'trainee') throw forbidden('Practice interviews are available in Trainee mode.')
      const input = practiceEvaluationSchema.parse(request.body)
      const now = new Date().toISOString()
      const evaluation = await evaluator.evaluate({
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
          submittedAt: now,
        })),
        consentedAt: now,
        startedAt: now,
        reviewerNote: null,
      }, input.locale)
      return evaluation
    })
  }, { prefix: '/api/v1' })

  app.addHook('onClose', async () => store.close())
  return app
}

function requireUser(request: FastifyRequest, app: FastifyInstance): AuthClaims {
  const token = request.cookies.cybervett_session
  if (!token) throw unauthorized()
  try {
    const claims = app.jwt.verify<AuthClaims>(token)
    if (claims.scope !== 'user') throw unauthorized()
    return claims
  } catch {
    throw unauthorized()
  }
}

function requireTrainer(request: FastifyRequest, app: FastifyInstance): AuthClaims {
  const claims = requireUser(request, app)
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
