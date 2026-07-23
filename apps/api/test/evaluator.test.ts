import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluationResultSchema } from '@cybervett/contracts'
import { loadConfig } from '../src/config/env.js'
import type { SessionRecord } from '../src/domain/types.js'
import {
  createEvaluator,
  GeminiEvaluator,
  HumanReviewEvaluator,
  StructuredEvaluator,
} from '../src/services/evaluator.js'

const session: SessionRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  reportId: null,
  name: 'Candidate',
  email: 'candidate@example.com',
  jobId: '33333333-3333-4333-8333-333333333333',
  jobTitle: 'API Engineer',
  status: 'in_progress',
  score: null,
  completedAt: null,
  organizationId: '11111111-1111-4111-8111-111111111111',
  inviteTokenDigest: 'digest',
  questions: [
    {
      id: 'problem_solving',
      competency: 'Problem solving',
      prompt: 'Describe a difficult API performance problem and how you solved it.',
    },
    {
      id: 'reliability',
      competency: 'Reliability',
      prompt: 'How did you make a production service more reliable after an incident?',
    },
    {
      id: 'collaboration',
      competency: 'Collaboration',
      prompt: 'Describe how you helped a team reach an important technical decision.',
    },
  ],
  answers: [
    {
      questionId: 'problem_solving',
      answer: 'I profiled API latency, changed the slow query, and measured a 35 percent improvement.',
      followUpPrompt: null,
      followUpAnswer: null,
      submittedAt: new Date(0).toISOString(),
    },
    {
      questionId: 'reliability',
      answer: 'I added a rollback check and tested the recovery procedure with the service team.',
      followUpPrompt: null,
      followUpAnswer: null,
      submittedAt: new Date(0).toISOString(),
    },
    {
      questionId: 'collaboration',
      answer: 'I documented the trade-offs and asked each stakeholder to review the decision record.',
      followUpPrompt: null,
      followUpAnswer: null,
      submittedAt: new Date(0).toISOString(),
    },
  ],
  consentedAt: new Date(0).toISOString(),
  startedAt: new Date(0).toISOString(),
  reviewerNote: null,
}

const validProviderEvaluation = {
  summary: 'The answers contain job-related examples and traceable technical evidence for human review.',
  dimensions: [
    {
      name: 'Problem solving',
      score: 80,
      evidence: ['changed the slow query'],
    },
    {
      name: 'Reliability',
      score: 75,
      evidence: ['tested the recovery procedure'],
    },
    {
      name: 'Collaboration',
      score: 70,
      evidence: ['documented the trade-offs'],
    },
  ],
  strengths: ['Used measured, job-related technical evidence.'],
  developmentAreas: ['Could provide more detail about the rollback criteria.'],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GeminiEvaluator responsible-AI boundary', () => {
  it('returns a localized unavailable assessment with source answers when the provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('provider unavailable') }))

    const result = await new GeminiEvaluator('test-key', 'test-model').evaluate(session, 'zh-CN')

    expect(result).toMatchObject({
      assessmentStatus: 'unavailable',
      overallScore: null,
      recommendation: null,
      dimensions: [],
      strengths: [],
      developmentAreas: [],
    })
    expect(result.summary).toContain('自动评估当前不可用')
    expect(result.answers).toHaveLength(session.questions.length)
    expect(result.answers[0]?.answer).toBe(session.answers[0]?.answer)
    expect(evaluationResultSchema.parse(result)).toEqual(result)
  })

  it('rejects valid-shaped provider output containing prohibited traits and a hiring decision', async () => {
    stubProviderResponse({
      ...validProviderEvaluation,
      summary: 'The candidate is young and emotionally stable, so the team should hire this candidate.',
    })

    const result = await new GeminiEvaluator('test-key', 'test-model').evaluate(session)

    expect(result.assessmentStatus).toBe('unavailable')
    expect(result.overallScore).toBeNull()
    expect(result.recommendation).toBeNull()
    expect(result.summary).not.toContain('young')
  })

  it('rejects missing competencies and evidence that is not traceable to a submitted answer', async () => {
    stubProviderResponse({
      ...validProviderEvaluation,
      dimensions: validProviderEvaluation.dimensions.slice(0, 2),
    })
    const missing = await new GeminiEvaluator('test-key', 'test-model').evaluate(session)
    expect(missing.assessmentStatus).toBe('unavailable')

    stubProviderResponse({
      ...validProviderEvaluation,
      dimensions: validProviderEvaluation.dimensions.map((dimension, index) => index === 0
        ? { ...dimension, evidence: ['A fabricated claim that does not appear in the answer.'] }
        : dimension),
    })
    const untraceable = await new GeminiEvaluator('test-key', 'test-model').evaluate(session)
    expect(untraceable.assessmentStatus).toBe('unavailable')
  })

  it('accepts only a complete, traceable, policy-safe competency set', async () => {
    stubProviderResponse(validProviderEvaluation)

    const result = await new GeminiEvaluator('test-key', 'test-model').evaluate(session)

    expect(result).toMatchObject({
      assessmentStatus: 'available',
      overallScore: 75,
      recommendation: 'mixed_evidence',
    })
    expect(result.dimensions.map((dimension) => dimension.name)).toEqual([
      'Problem solving',
      'Reliability',
      'Collaboration',
    ])
    expect(evaluationResultSchema.parse(result)).toEqual(result)
  })
})

describe('explicit local evaluator modes', () => {
  it('labels deterministic scoring as demo-only', async () => {
    const result = await new StructuredEvaluator().evaluate(session)
    expect(result.assessmentStatus).toBe('available')
    expect(result.generatedBy).toContain('demo evaluator')
    expect(result.overallScore).not.toBeNull()
  })

  it('supports an explicit human-review-only evaluator', async () => {
    const evaluator = createEvaluator(loadConfig({
      NODE_ENV: 'test',
      AI_PROVIDER: 'disabled',
    }))
    expect(evaluator).toBeInstanceOf(HumanReviewEvaluator)

    const result = await evaluator.evaluate(session, 'ms')
    expect(result).toMatchObject({
      assessmentStatus: 'unavailable',
      overallScore: null,
      recommendation: null,
    })
    expect(result.summary).toContain('Penilaian automatik tidak tersedia')
    expect(result.answers).toHaveLength(3)
  })
})

function stubProviderResponse(payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })))
}
