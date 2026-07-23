import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  DEMO_MODE: true,
  AI_PROVIDER: 'demo',
  AI_MODEL: 'test-model',
}

describe('CyberVett API', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const store = new MemoryStore()
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
      payload: { name: 'Jing Yik Cheah', email: 'jing@example.com', consent: true },
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
