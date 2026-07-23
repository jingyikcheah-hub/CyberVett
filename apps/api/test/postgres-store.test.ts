import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CreateJobInput, RegistrationInput } from '@cybervett/contracts'
import type { EvaluationResult, SessionRecord, UserRecord } from '../src/domain/types.js'
import { runMigrations } from '../src/scripts/migrate.js'
import { PostgresStore } from '../src/store/postgres-store.js'

const databaseUrl = process.env.TEST_DATABASE_URL

describe('PostgresStore database TLS configuration', () => {
  it('rejects SSL overrides in the connection URL before creating a pool', () => {
    expect(() => new PostgresStore(
      'postgres://database.example.com/cybervett?sslmode=disable',
      'verify-full',
      '-----BEGIN CERTIFICATE-----\nTEST-CA-DATA\n-----END CERTIFICATE-----',
    )).toThrow(/DATABASE_URL must not include SSL-related query parameters/)
  })
})

describe.skipIf(!databaseUrl)('PostgresStore integration', () => {
  let pool: Pool
  let store: PostgresStore
  let user: UserRecord

  beforeAll(async () => {
    await runMigrations({ connectionString: databaseUrl! })
    pool = new Pool({ connectionString: databaseUrl })
  })

  beforeEach(async () => {
    await pool.query(`
      truncate table audit_events, interview_reports, interview_answers, interview_sessions,
                     jobs, users, organizations
      restart identity cascade
    `)
    store = new PostgresStore(databaseUrl!, 'disable')
    user = (await store.registerOrganization(registration, 'test-password-hash'))!
  })

  afterEach(async () => {
    await store.close()
  })

  afterAll(async () => {
    await pool?.end()
  })

  it('allows exactly one concurrent invitation start and keeps identity immutable', async () => {
    const { tokenDigest, sessionId } = await createInvitation(store, user)
    const results = await Promise.all([
      store.startInvitation(
        tokenDigest,
        'Alice Tan',
        'alice@example.com',
        digestLabel('alice-resume'),
        future(1),
      ),
      store.startInvitation(
        tokenDigest,
        'Mallory Lim',
        'mallory@example.com',
        digestLabel('mallory-resume'),
        future(1),
      ),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    const persisted = await store.getSession(sessionId)
    expect(['Alice Tan', 'Mallory Lim']).toContain(persisted?.name)
    expect(persisted?.inviteConsumedAt).not.toBeNull()
    expect(persisted?.resumeTokenDigest).not.toBeNull()

    const idempotentRetry = await store.startInvitation(
      tokenDigest,
      'A changed retry must not replace the winner',
      'changed@example.com',
      persisted!.resumeTokenDigest!,
      future(1),
    )
    expect(idempotentRetry?.id).toBe(sessionId)
    expect(idempotentRetry?.name).toBe(persisted?.name)
  })

  it('guards delayed follow-ups with answer revisions', async () => {
    const session = await startedSession(store, user)
    const question = session.questions[0]!
    const first = await store.saveAnswer(session.id, question.id, longAnswer('first'))
    const second = await store.saveAnswer(session.id, question.id, longAnswer('second'))

    expect(await store.saveFollowUpPrompt(session.id, question.id, 'A stale follow-up question?', first!.answerRevision)).toBeNull()
    const current = await store.saveFollowUpPrompt(
      session.id,
      question.id,
      'What result did the current approach produce?',
      second!.answerRevision,
    )
    expect(current?.answers[0]).toMatchObject({
      answer: longAnswer('second'),
      followUpPrompt: 'What result did the current approach produce?',
      revision: second!.answerRevision,
    })
  })

  it('serializes concurrent completion and returns one persisted report', async () => {
    const session = await answeredSession(store, user)
    const claims = await Promise.all([
      store.claimSessionForCompletion(session.id),
      store.claimSessionForCompletion(session.id),
    ])
    expect(claims.map((claim) => claim.kind).sort()).toEqual(['claimed', 'pending'])

    const evaluation = availableEvaluation(session)
    const [first, second] = await Promise.all([
      store.completeSession(session.id, evaluation),
      store.completeSession(session.id, evaluation),
    ])
    expect(first?.id).toBe(second?.id)

    const count = await pool.query<{ count: string }>(
      'select count(*) from interview_reports where session_id = $1',
      [session.id],
    )
    expect(Number(count.rows[0]!.count)).toBe(1)
  })

  it('keeps the resume capability valid while a completion report is pending', async () => {
    const session = await answeredSession(store, user)
    expect((await store.claimSessionForCompletion(session.id)).kind).toBe('claimed')

    const firstResume = await store.resumeInvitation(session.id, session.resumeTokenDigest!)
    const retryResume = await store.resumeInvitation(session.id, session.resumeTokenDigest!)

    expect(firstResume?.status).toBe('completed')
    expect(retryResume?.id).toBe(session.id)
  })

  it('keeps report, session, and audit consistent for concurrent final decisions', async () => {
    const session = await answeredSession(store, user)
    await store.claimSessionForCompletion(session.id)
    const report = (await store.completeSession(session.id, availableEvaluation(session)))!
    const decisions = await Promise.all([
      store.updateDecision(user.organizationId, report.id, 'shortlisted', 'Reviewer A', audit(user, report.id, 'shortlisted')),
      store.updateDecision(user.organizationId, report.id, 'declined', 'Reviewer B', audit(user, report.id, 'declined')),
    ])
    expect(decisions.map((result) => result.kind).sort()).toEqual(['conflict', 'updated'])

    const storedReport = await store.getReport(user.organizationId, report.id)
    const state = await pool.query<{ status: string; reviewer_note: string | null }>(
      'select status, reviewer_note from interview_sessions where id = $1',
      [session.id],
    )
    expect(storedReport?.candidate.status).toBe(state.rows[0]!.status)
    expect(storedReport?.reviewerNote).toBe(state.rows[0]!.reviewer_note)
    const winningDecision = state.rows[0]!.status as 'shortlisted' | 'declined'
    const winningNote = state.rows[0]!.reviewer_note
    const replay = await store.updateDecision(
      user.organizationId,
      report.id,
      winningDecision,
      'A retry must not replace the original note',
      audit(user, report.id, winningDecision),
    )
    expect(replay.kind).toBe('updated')
    expect(replay.kind === 'updated' ? replay.report.reviewerNote : null).toBe(winningNote)
    const auditCount = await pool.query<{ count: string }>(
      'select count(*) from audit_events where entity_id = $1',
      [report.id],
    )
    expect(Number(auditCount.rows[0]!.count)).toBe(1)
  })

  it('persists an unavailable assessment without a score', async () => {
    const session = await answeredSession(store, user)
    await store.claimSessionForCompletion(session.id)
    const report = await store.completeSession(session.id, unavailableEvaluation(session))
    expect(report).toMatchObject({
      assessmentStatus: 'unavailable',
      overallScore: null,
      recommendation: null,
    })
    expect((await store.getSession(session.id))?.score).toBeNull()
  })
})

const registration: RegistrationInput = {
  mode: 'trainer',
  name: 'Integration Admin',
  organizationName: 'Integration Org',
  email: 'admin@integration.test',
  password: 'IntegrationPass123',
  acceptTerms: true,
}

const jobInput: CreateJobInput = {
  title: 'Integration Engineer',
  department: 'Engineering',
  location: 'Remote',
  durationMinutes: 30,
  questions: [
    { id: 'q1', competency: 'API design', prompt: 'How would you design an API write that is safe to retry?' },
    { id: 'q2', competency: 'Reliability', prompt: 'How would you investigate an intermittent production failure?' },
    { id: 'q3', competency: 'Collaboration', prompt: 'How would you document and communicate a technical decision?' },
  ],
}

async function createInvitation(store: PostgresStore, user: UserRecord) {
  const job = await store.createJob(user.organizationId, jobInput)
  const tokenDigest = digestLabel(randomUUID())
  const invitation = await store.createInvitation(user.organizationId, job.id, tokenDigest, future(7))
  if (!invitation) throw new Error('Invitation was not created')
  return { ...invitation, tokenDigest }
}

async function startedSession(store: PostgresStore, user: UserRecord) {
  const invitation = await createInvitation(store, user)
  const session = await store.startInvitation(
    invitation.tokenDigest,
    'Candidate One',
    'candidate@example.com',
    digestLabel('resume-secret'),
    future(1),
  )
  if (!session) throw new Error('Invitation was not started')
  return session
}

async function answeredSession(store: PostgresStore, user: UserRecord) {
  const session = await startedSession(store, user)
  for (const question of session.questions) {
    const saved = await store.saveAnswer(session.id, question.id, longAnswer(question.id))
    await store.saveFollowUpPrompt(
      session.id,
      question.id,
      `What measurable result followed from the ${question.id} approach?`,
      saved!.answerRevision,
    )
    await store.saveFollowUpAnswer(session.id, question.id, longAnswer(`follow-up-${question.id}`))
  }
  return (await store.getSession(session.id))!
}

function audit(user: UserRecord, reportId: string, decision: string) {
  return {
    organizationId: user.organizationId,
    actorId: user.id,
    action: `candidate.${decision}`,
    entityType: 'report',
    entityId: reportId,
    requestId: `request-${decision}`,
  }
}

function availableEvaluation(session: SessionRecord): EvaluationResult {
  return {
    assessmentStatus: 'available',
    overallScore: 70,
    recommendation: 'mixed_evidence',
    summary: 'The answers contain job-related evidence that a human reviewer must verify before deciding.',
    dimensions: session.questions.map((question) => ({
      name: question.competency,
      score: 70,
      evidence: ['The candidate described a concrete action and a measurable result.'],
    })),
    strengths: ['Concrete job-related examples'],
    developmentAreas: ['Verify the stated outcomes during human review'],
    answers: session.questions.map((question) => ({
      question: question.prompt,
      competency: question.competency,
      answer: longAnswer(question.id),
    })),
    generatedBy: 'Integration evaluator',
    generatedAt: new Date().toISOString(),
  }
}

function unavailableEvaluation(session: SessionRecord): EvaluationResult {
  return {
    assessmentStatus: 'unavailable',
    overallScore: null,
    recommendation: null,
    summary: 'Automated assessment is unavailable. A human reviewer must inspect the submitted answers directly.',
    dimensions: [],
    strengths: [],
    developmentAreas: [],
    answers: session.questions.map((question) => ({
      question: question.prompt,
      competency: question.competency,
      answer: longAnswer(question.id),
    })),
    generatedBy: 'Human-review mode',
    generatedAt: new Date().toISOString(),
  }
}

function longAnswer(label: string) {
  return `This is a sufficiently detailed ${label} answer with reasoning, trade-offs, concrete actions, and a measured job-related result.`
}

function future(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function digestLabel(label: string) {
  return Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64)
}
