import { beforeEach, describe, expect, it } from 'vitest'
import type { EvaluationResult } from '../src/domain/types'
import { MemoryStore } from '../src/store/memory-store'
import { digestToken } from '../src/utils/security'

describe('MemoryStore lifecycle and retry semantics', () => {
  let store: MemoryStore

  beforeEach(async () => {
    store = new MemoryStore()
    await store.initialize()
  })

  it('attaches a generated follow-up only to the answer revision that requested it', async () => {
    const session = await startDemoInvitation(store)
    const question = session.questions[0]!
    const first = await store.saveAnswer(session.id, question.id, longAnswer('first'))
    const second = await store.saveAnswer(session.id, question.id, longAnswer('second'))

    expect(first?.answerRevision).toBe(1)
    expect(second?.answerRevision).toBe(2)
    expect(await store.saveFollowUpPrompt(session.id, question.id, 'Stale generated follow-up prompt.', 1)).toBeNull()
    const current = await store.saveFollowUpPrompt(session.id, question.id, 'Current generated follow-up prompt.', 2)
    expect(current?.answers[0]).toMatchObject({
      answer: longAnswer('second'),
      followUpPrompt: 'Current generated follow-up prompt.',
      revision: 2,
    })
  })

  it('freezes writes before evaluation and returns one report for completion retries', async () => {
    const session = await completeAnswers(store)
    const firstClaim = await store.claimSessionForCompletion(session.id)
    const overlappingClaim = await store.claimSessionForCompletion(session.id)

    expect(firstClaim.kind).toBe('claimed')
    expect(overlappingClaim).toEqual({ kind: 'pending' })
    expect(await store.saveAnswer(session.id, session.questions[0]!.id, longAnswer('late'))).toBeNull()

    const first = await store.completeSession(session.id, availableEvaluation(session))
    const retry = await store.completeSession(session.id, availableEvaluation(session))
    expect(first?.id).toBeTruthy()
    expect(retry?.id).toBe(first?.id)
    expect((await store.claimSessionForCompletion(session.id)).kind).toBe('existing')
  })

  it('keeps one idempotent resume capability during pending completion', async () => {
    const session = await completeAnswers(store)
    expect((await store.claimSessionForCompletion(session.id)).kind).toBe('claimed')

    const first = await store.resumeInvitation(session.id, session.resumeTokenDigest!)
    const retry = await store.resumeInvitation(session.id, session.resumeTokenDigest!)

    expect(first?.status).toBe('completed')
    expect(retry?.id).toBe(session.id)
  })

  it('keeps unavailable assessments scoreless and excludes them from the median', async () => {
    const session = await completeAnswers(store)
    expect((await store.claimSessionForCompletion(session.id)).kind).toBe('claimed')
    const report = await store.completeSession(session.id, unavailableEvaluation(session))

    expect(report).toMatchObject({
      assessmentStatus: 'unavailable',
      overallScore: null,
      recommendation: null,
    })
    const dashboard = await store.getDashboard(session.organizationId)
    expect(dashboard.medianScore).toBe(82)
  })

  it('requires reopening review before changing one final outcome to another', async () => {
    const session = await completeAnswers(store)
    await store.claimSessionForCompletion(session.id)
    const report = await store.completeSession(session.id, availableEvaluation(session))
    expect((await store.updateDecision(session.organizationId, report!.id, 'shortlisted', undefined, decisionAudit(session.organizationId, report!.id, 'shortlisted'))).kind).toBe('updated')
    expect((await store.updateDecision(session.organizationId, report!.id, 'declined', undefined, decisionAudit(session.organizationId, report!.id, 'declined'))).kind).toBe('conflict')
    expect((await store.updateDecision(session.organizationId, report!.id, 'review', 'Reopened', decisionAudit(session.organizationId, report!.id, 'review'))).kind).toBe('updated')
    expect((await store.updateDecision(session.organizationId, report!.id, 'declined', 'Reviewed', decisionAudit(session.organizationId, report!.id, 'declined-after-review'))).kind).toBe('updated')
  })

  it('does not duplicate or mutate a human decision when the same request is replayed', async () => {
    const session = await completeAnswers(store)
    await store.claimSessionForCompletion(session.id)
    const report = (await store.completeSession(session.id, availableEvaluation(session)))!
    const audit = decisionAudit(session.organizationId, report.id, 'same-request')

    await store.updateDecision(session.organizationId, report.id, 'shortlisted', 'Original note', audit)
    const replay = await store.updateDecision(session.organizationId, report.id, 'shortlisted', 'Changed retry note', audit)

    expect(replay).toMatchObject({
      kind: 'updated',
      report: { reviewerNote: 'Original note', candidate: { status: 'shortlisted' } },
    })
  })

  it('serializes same-email registration in the in-memory implementation', async () => {
    const registration = {
      mode: 'trainer' as const,
      name: 'Concurrent Admin',
      organizationName: 'Concurrency Org',
      email: 'same@example.com',
      password: 'SecurePassword123',
      acceptTerms: true,
    }
    const results = await Promise.all([
      store.registerOrganization(registration, 'hash-one'),
      store.registerOrganization({ ...registration, email: 'SAME@example.com' }, 'hash-two'),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

function decisionAudit(organizationId: string, reportId: string, request: string) {
  return {
    organizationId,
    actorId: '22222222-2222-4222-8222-222222222222',
    action: request.startsWith('declined') ? 'candidate.declined'
      : request === 'review' ? 'candidate.review'
        : 'candidate.shortlisted',
    entityType: 'report',
    entityId: reportId,
    requestId: `decision-${request}`,
  }
}

async function startDemoInvitation(store: MemoryStore) {
  const result = await store.startInvitation(
    digestToken('demo-invite'),
    'Candidate One',
    'candidate@example.com',
    digestToken('resume-secret'),
    new Date(Date.now() + 86_400_000).toISOString(),
  )
  if (!result) throw new Error('Demo invitation did not start')
  return result
}

async function completeAnswers(store: MemoryStore) {
  const session = await startDemoInvitation(store)
  for (const question of session.questions) {
    const saved = await store.saveAnswer(session.id, question.id, longAnswer(question.id))
    await store.saveFollowUpPrompt(session.id, question.id, `Please expand on the outcome for ${question.id}.`, saved!.answerRevision)
    await store.saveFollowUpAnswer(session.id, question.id, longAnswer(`follow-up-${question.id}`))
  }
  return (await store.getSession(session.id))!
}

function longAnswer(label: string) {
  return `This is a sufficiently detailed ${label} answer that explains the job-related reasoning, actions, trade-offs, and measured outcome.`
}

function availableEvaluation(session: Awaited<ReturnType<typeof startDemoInvitation>>): EvaluationResult {
  return {
    assessmentStatus: 'available',
    overallScore: 60,
    recommendation: 'mixed_evidence',
    summary: 'The submitted answers contain job-related evidence that requires verification by a human reviewer.',
    dimensions: session.questions.map((question) => ({
      name: question.competency,
      score: 60,
      evidence: ['The candidate described a concrete job-related action and outcome.'],
    })),
    strengths: ['Concrete job-related examples'],
    developmentAreas: ['A human reviewer should verify the stated outcomes'],
    answers: session.questions.map((question) => ({
      question: question.prompt,
      competency: question.competency,
      answer: longAnswer(question.id),
    })),
    generatedBy: 'Test evaluator',
    generatedAt: new Date().toISOString(),
  }
}

function unavailableEvaluation(session: Awaited<ReturnType<typeof startDemoInvitation>>): EvaluationResult {
  return {
    assessmentStatus: 'unavailable',
    overallScore: null,
    recommendation: null,
    summary: 'Automated assessment is unavailable. A human reviewer must review the submitted job-related answers directly.',
    dimensions: [],
    strengths: [],
    developmentAreas: [],
    answers: session.questions.map((question) => ({
      question: question.prompt,
      competency: question.competency,
      answer: longAnswer(question.id),
    })),
    generatedBy: 'Assessment unavailable',
    generatedAt: new Date().toISOString(),
  }
}
