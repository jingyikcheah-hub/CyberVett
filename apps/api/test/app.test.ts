import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import type { AppConfig } from '../src/config/env.js'
import { StructuredEvaluator } from '../src/services/evaluator.js'
import { StructuredInterviewConductor } from '../src/services/interview-conductor.js'
import { MemoryStore } from '../src/store/memory-store.js'

const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 4000,
  HOST: '127.0.0.1',
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  DATABASE_SSL_MODE: 'disable',
  DEMO_MODE: true,
  AI_PROVIDER: 'demo',
  AI_MODEL: 'test-model',
}

describe('CyberVett API', () => {
  let app: FastifyInstance
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.initialize()
    app = await buildApp({ config, store, evaluator: new StructuredEvaluator(), conductor: new StructuredInterviewConductor() })
  })

  afterEach(async () => { await app.close() })

  it('authenticates a Trainer and returns scoped dashboard data', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'maya@northstarlabs.test', password: 'Demo123!' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((item) => item.name === 'cybervett_session')
    expect(cookie?.httpOnly).toBe(true)

    const dashboard = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      cookies: { cybervett_session: cookie!.value },
    })
    expect(dashboard.statusCode).toBe(200)
    expect(dashboard.json().jobs[0].title).toBe('Frontend Engineer')
  })

  it('requires a CSRF token for Trainer mutations', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'maya@northstarlabs.test', password: 'Demo123!' } })
    const cookie = login.cookies.find((item) => item.name === 'cybervett_session')!
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      cookies: { cybervett_session: cookie.value },
      payload: {
        title: 'API Engineer', department: 'Engineering', location: 'Remote', durationMinutes: 30,
        questions: [
          { id: '1', competency: 'APIs', prompt: 'How would you design an idempotent write API safely?' },
          { id: '2', competency: 'Reliability', prompt: 'How would you investigate an intermittent service failure?' },
          { id: '3', competency: 'Collaboration', prompt: 'How do you document an important technical decision?' },
        ],
      },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects duplicate question identifiers at the API boundary', async () => {
    const login = await trainerLogin(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      cookies: { cybervett_session: login.cookie },
      headers: { 'x-csrf-token': login.csrfToken },
      payload: {
        title: 'API Engineer',
        department: 'Engineering',
        location: 'Remote',
        durationMinutes: 30,
        questions: [
          { id: 'duplicate', competency: 'APIs', prompt: 'How would you design a safe idempotent write API?' },
          { id: 'duplicate', competency: 'Reliability', prompt: 'How would you investigate an intermittent failure?' },
          { id: 'third', competency: 'Collaboration', prompt: 'How do you document an important technical decision?' },
        ],
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('supports only the configured origin and preflights PUT and PATCH', async () => {
    for (const method of ['PUT', 'PATCH']) {
      const allowed = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/jobs',
        headers: {
          origin: config.APP_ORIGIN,
          'access-control-request-method': method,
        },
      })
      expect(allowed.headers['access-control-allow-origin']).toBe(config.APP_ORIGIN)
      expect(allowed.headers['access-control-allow-methods']).toContain(method)
    }

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/jobs',
      headers: {
        origin: 'https://attacker.invalid',
        'access-control-request-method': 'PUT',
      },
    })
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('revalidates active user authorization instead of trusting stale JWT claims', async () => {
    const login = await trainerLogin(app)
    vi.spyOn(store, 'findUserById').mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      cookies: { cybervett_session: login.cookie },
      headers: { 'x-csrf-token': login.csrfToken },
      payload: {
        title: 'API Engineer',
        department: 'Engineering',
        location: 'Remote',
        durationMinutes: 30,
        questions: [
          { id: 'one', competency: 'APIs', prompt: 'How would you design a safe idempotent write API?' },
          { id: 'two', competency: 'Reliability', prompt: 'How would you investigate an intermittent failure?' },
          { id: 'three', competency: 'Collaboration', prompt: 'How do you document an important technical decision?' },
        ],
      },
    })
    expect(response.statusCode).toBe(401)
  })

  it('keeps invalid JWTs unauthorized but surfaces user lookup failures as server errors', async () => {
    const invalidJwt = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      cookies: { cybervett_session: 'not-a-valid-jwt' },
    })
    expect(invalidJwt.statusCode).toBe(401)

    const login = await trainerLogin(app)
    vi.spyOn(store, 'findUserById').mockRejectedValueOnce(new Error('database unavailable'))
    const unavailableStore = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      cookies: { cybervett_session: login.cookie },
    })
    expect(unavailableStore.statusCode).toBe(500)
    expect(unavailableStore.json().error.code).toBe('INTERNAL_ERROR')
  })

  it('binds candidate identity once and makes the client resume credential idempotent', async () => {
    const resumeToken = 'alice-resume-capability-token-0000000000000001'
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/public/invitations/demo-invite/start',
      payload: { name: 'Alice Tan', email: 'alice@example.com', consent: true, resumeToken },
    })
    expect(first.statusCode).toBe(200)
    const started = first.json()

    const retriedStart = await app.inject({
      method: 'POST',
      url: '/api/v1/public/invitations/demo-invite/start',
      payload: { name: 'Alice Tan', email: 'alice@example.com', consent: true, resumeToken },
    })
    expect(retriedStart.statusCode).toBe(200)
    expect(retriedStart.json().sessionId).toBe(started.sessionId)

    const takeover = await app.inject({
      method: 'POST',
      url: '/api/v1/public/invitations/demo-invite/start',
      payload: {
        name: 'Mallory Lim',
        email: 'mallory@example.com',
        consent: true,
        resumeToken: 'mallory-resume-capability-token-00000000000001',
      },
    })
    expect(takeover.statusCode).toBe(409)
    expect(takeover.json().error.code).toBe('INVITATION_ALREADY_STARTED')
    expect((await store.getSession(started.sessionId))?.name).toBe('Alice Tan')

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/v1/public/interviews/${started.sessionId}/resume`,
      payload: { resumeToken: started.resumeToken },
    })
    expect(resumed.statusCode).toBe(200)
    expect(resumed.json().candidateName).toBe('Alice Tan')
    expect(resumed.json().resumeToken).toBe(resumeToken)

    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/public/interviews/${started.sessionId}/resume`,
      payload: { resumeToken: started.resumeToken },
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().resumeToken).toBe(resumeToken)
  })

  it('returns pending follow-up state on resume so an interrupted generation can be retried', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/public/invitations/demo-invite/start',
      payload: {
        name: 'Alice Tan',
        email: 'alice@example.com',
        consent: true,
        resumeToken: 'alice-resume-capability-token-0000000000000002',
      },
    })
    const interview = started.json()
    await store.saveAnswer(
      interview.sessionId,
      interview.questions[0].id,
      'This detailed answer remains recoverable if follow-up generation is interrupted after it is saved.',
    )

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/v1/public/interviews/${interview.sessionId}/resume`,
      payload: { resumeToken: interview.resumeToken },
    })

    expect(resumed.statusCode).toBe(200)
    expect(resumed.json().answers[0]).toMatchObject({
      questionId: interview.questions[0].id,
      followUpPending: true,
    })
  })

  it('keeps completion retryable until a report is durable', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/public/invitations/demo-invite/start',
      payload: {
        name: 'Alice Tan',
        email: 'alice@example.com',
        consent: true,
        resumeToken: 'alice-resume-capability-token-0000000000000003',
      },
    })
    const interview = started.json()
    vi.spyOn(store, 'claimSessionForCompletion').mockResolvedValue({ kind: 'pending' })

    const pending = await app.inject({
      method: 'POST',
      url: `/api/v1/public/interviews/${interview.sessionId}/complete`,
      headers: { authorization: `Bearer ${interview.accessToken}` },
      payload: { locale: 'en' },
    })

    expect(pending.statusCode).toBe(202)
    expect(pending.headers['retry-after']).toBe('5')
    expect(pending.json()).toMatchObject({ completed: false, processing: true })
  })

  it('can resume a completion claim that has not produced a durable report', async () => {
    const resumeToken = 'alice-resume-capability-token-0000000000000004'
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/public/invitations/demo-invite/start',
      payload: { name: 'Alice Tan', email: 'alice@example.com', consent: true, resumeToken },
    })
    const interview = started.json()
    for (const question of interview.questions) {
      const saved = await store.saveAnswer(interview.sessionId, question.id, sufficientlyDetailedAnswer(question.id))
      await store.saveFollowUpPrompt(
        interview.sessionId,
        question.id,
        `What measurable outcome followed from your ${question.id} approach?`,
        saved!.answerRevision,
      )
      await store.saveFollowUpAnswer(
        interview.sessionId,
        question.id,
        sufficientlyDetailedAnswer(`follow-up-${question.id}`),
      )
    }
    expect((await store.claimSessionForCompletion(interview.sessionId)).kind).toBe('claimed')

    const invitation = await app.inject({
      method: 'GET',
      url: '/api/v1/public/invitations/demo-invite',
    })
    expect(invitation.statusCode).toBe(200)
    expect(invitation.json()).toMatchObject({
      sessionId: interview.sessionId,
      status: 'completed',
    })

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/v1/public/interviews/${interview.sessionId}/resume`,
      payload: { resumeToken },
    })

    expect(resumed.statusCode).toBe(200)
    expect(resumed.json()).toMatchObject({
      sessionId: interview.sessionId,
      resumeToken,
    })
    expect(resumed.json().answers).toHaveLength(interview.questions.length)
  })

  it('bounds untrusted request identifiers before returning or auditing them', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'x'.repeat(500) },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('registers real Trainer and Trainee accounts and routes their permissions', async () => {
    const trainer = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { mode: 'trainer', name: 'Amina Tan', organizationName: 'People First', email: 'amina@example.com', password: 'SecureTrainer123', acceptTerms: true },
    })
    expect(trainer.statusCode).toBe(200)
    expect(trainer.json().user).toMatchObject({ mode: 'trainer', organizationName: 'People First', role: 'admin' })

    const duplicate = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { mode: 'trainer', name: 'Another User', organizationName: 'Other Org', email: 'AMINA@example.com', password: 'SecureTrainer123', acceptTerms: true },
    })
    expect(duplicate.statusCode).toBe(409)

    const trainee = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { mode: 'trainee', name: 'Dev Kumar', organizationName: '', email: 'dev@example.com', password: 'SecureTrainee123', acceptTerms: true },
    })
    expect(trainee.statusCode).toBe(200)
    expect(trainee.json().user).toMatchObject({ mode: 'trainee', role: 'trainee' })
    const cookie = trainee.cookies.find((item) => item.name === 'cybervett_session')!
    const dashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', cookies: { cybervett_session: cookie.value } })
    expect(dashboard.statusCode).toBe(403)

    const csrfToken = trainee.json().csrfToken as string
    const practice = await app.inject({
      method: 'POST', url: '/api/v1/practice/follow-up',
      cookies: { cybervett_session: cookie.value },
      headers: { 'x-csrf-token': csrfToken },
      payload: {
        roleTitle: 'Software Engineering Intern',
        competency: 'Problem solving',
        question: 'Tell me about a technical problem you solved and how you approached it.',
        answer: 'I compared two approaches, tested the safer option, and measured the result with my project team.',
        locale: 'en',
      },
    })
    expect(practice.statusCode).toBe(200)
    expect(practice.json().followUpPrompt).toBeTruthy()
  })

  it('completes the consent-based candidate workflow without biometric analysis', async () => {
    const invitation = await app.inject({ method: 'GET', url: '/api/v1/public/invitations/demo-invite' })
    expect(invitation.statusCode).toBe(200)
    expect(invitation.json().privacy).toMatchObject({ cameraRequired: false, emotionAnalysis: false })

    const started = await app.inject({
      method: 'POST', url: '/api/v1/public/invitations/demo-invite/start',
      payload: {
        name: 'Candidate One',
        email: 'candidate-one@example.com',
        consent: true,
        resumeToken: 'candidate-resume-capability-token-0000000000001',
      },
    })
    expect(started.statusCode).toBe(200)
    const { sessionId, accessToken, questions } = started.json()

    for (const question of questions) {
      const saved = await app.inject({
        method: 'PUT', url: `/api/v1/public/interviews/${sessionId}/answers`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { questionId: question.id, answer: 'I would first gather evidence, compare the trade-offs, test the approach, and measure the result with the team.', locale: 'en' },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json().followUpPrompt).toBeTruthy()
      const followUp = await app.inject({
        method: 'PUT', url: `/api/v1/public/interviews/${sessionId}/follow-up`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { questionId: question.id, answer: 'The measured result improved, and I would document the trade-off more clearly next time.' },
      })
      expect(followUp.statusCode).toBe(200)
    }

    const completed = await app.inject({
      method: 'POST', url: `/api/v1/public/interviews/${sessionId}/complete`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { locale: 'en' },
    })
    expect(completed.statusCode).toBe(200)
    expect(completed.json().message).toContain('human review')
  })
})

async function trainerLogin(app: FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'maya@northstarlabs.test', password: 'Demo123!' }, // ggignore: public local demo fixture
  })
  return {
    cookie: response.cookies.find((item) => item.name === 'cybervett_session')!.value,
    csrfToken: response.json().csrfToken as string,
  }
}

function sufficientlyDetailedAnswer(label: string) {
  return `This ${label} answer explains the relevant actions, trade-offs, evidence, and measured outcome in enough detail for review.`
}
