import { randomUUID } from 'node:crypto'
import { hash } from 'bcryptjs'
import type { CandidateSummary, CreateJobInput, Dashboard, Job, RegistrationInput, Report } from '@cybervett/contracts'
import type {
  AuditEventInput,
  CompletionClaim,
  DecisionUpdateResult,
  EvaluationResult,
  RevocationResult,
  SessionRecord,
  Store,
  UserRecord,
} from '../domain/types.js'
import { digestToken } from '../utils/security.js'

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const JOB_ID = '33333333-3333-4333-8333-333333333333'
const SESSION_ID = '44444444-4444-4444-8444-444444444444'
const REPORT_ID = '55555555-5555-4555-8555-555555555555'
const INVITE_SESSION_ID = '66666666-6666-4666-8666-666666666666'

export class MemoryStore implements Store {
  private users: UserRecord[] = []
  private readonly jobs: Job[]
  private readonly sessions: SessionRecord[]
  private readonly reports: Report[]
  private readonly auditEvents: AuditEventInput[] = []
  private readonly organizationNames = new Map<string, string>([[ORGANIZATION_ID, 'Northstar Labs']])
  private readonly jobOrganizations = new Map<string, string>([[JOB_ID, ORGANIZATION_ID]])

  constructor() {
    const createdAt = new Date(Date.now() - 86_400_000 * 5).toISOString()
    this.jobs = [
      {
        id: JOB_ID,
        title: 'Frontend Engineer',
        department: 'Product Engineering',
        location: 'Hybrid · Kuala Lumpur',
        status: 'active',
        durationMinutes: 30,
        createdAt,
        candidateCount: 3,
        questions: [
          {
            id: 'q1',
            competency: 'Problem solving',
            prompt: 'Tell us about a difficult frontend problem you solved. What options did you consider, and why did you choose your final approach?',
            guidance: 'Use a real example and explain your trade-offs.',
          },
          {
            id: 'q2',
            competency: 'Web fundamentals',
            prompt: 'A page feels slow after loading a large list. How would you identify the bottleneck and improve the experience?',
          },
          {
            id: 'q3',
            competency: 'Collaboration',
            prompt: 'Describe a disagreement about a technical decision. How did you help the team reach a decision?',
          },
        ],
      },
    ]

    const candidate: CandidateSummary = {
      id: SESSION_ID,
      reportId: REPORT_ID,
      name: 'Aisha Rahman',
      email: 'aisha@example.com',
      jobId: JOB_ID,
      jobTitle: 'Frontend Engineer',
      status: 'review',
      score: 82,
      completedAt: new Date(Date.now() - 86_400_000).toISOString(),
    }

    this.sessions = [
      {
        ...candidate,
        organizationId: ORGANIZATION_ID,
        inviteTokenDigest: digestToken('completed-demo'),
        questions: this.jobs[0]!.questions,
        answers: [
          {
            questionId: 'q1',
            answer: 'I reduced a dashboard bundle by profiling it first, splitting large routes, and measuring real-user performance before and after the change. I chose route-level splitting because it improved the first visit without making the code hard to maintain.',
            followUpPrompt: null,
            followUpAnswer: null,
            followUpPending: false,
            revision: 1,
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
          {
            questionId: 'q2',
            answer: 'I would reproduce the issue, inspect network and performance traces, then separate rendering cost from data-fetching cost. For rendering, I would consider pagination or virtualization and confirm the result with before-and-after measurements.',
            followUpPrompt: null,
            followUpAnswer: null,
            followUpPending: false,
            revision: 1,
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
          {
            questionId: 'q3',
            answer: 'I wrote down the decision criteria, asked each engineer to explain their main concern, and proposed a small time-boxed spike. The team used the evidence from that spike and recorded the decision so we could revisit it later.',
            followUpPrompt: null,
            followUpAnswer: null,
            followUpPending: false,
            revision: 1,
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
        ],
        consentedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        startedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        reviewerNote: null,
        inviteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        inviteRevokedAt: null,
        inviteConsumedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        resumeTokenDigest: null,
        resumeExpiresAt: null,
        evaluationStartedAt: null,
      },
    ]

    this.sessions.push({
      id: INVITE_SESSION_ID,
      reportId: null,
      name: 'Invited candidate',
      email: `pending-${INVITE_SESSION_ID}@invalid.local`,
      jobId: JOB_ID,
      jobTitle: 'Frontend Engineer',
      status: 'invited',
      score: null,
      completedAt: null,
      organizationId: ORGANIZATION_ID,
      inviteTokenDigest: digestToken('demo-invite'),
      questions: this.jobs[0]!.questions,
      answers: [],
      consentedAt: null,
      startedAt: null,
      reviewerNote: null,
      inviteExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      inviteRevokedAt: null,
      inviteConsumedAt: null,
      resumeTokenDigest: null,
      resumeExpiresAt: null,
      evaluationStartedAt: null,
    })

    this.reports = [
      {
        id: REPORT_ID,
        candidate,
        overallScore: 82,
        recommendation: 'strong_evidence',
        summary: 'Aisha gave specific examples, explained trade-offs, and consistently described how she validates technical decisions with evidence.',
        dimensions: [
          { name: 'Problem solving', score: 84, evidence: ['Explained the alternatives considered before choosing route-level code splitting.'] },
          { name: 'Web fundamentals', score: 82, evidence: ['Separated network, rendering, and data-fetching bottlenecks in the investigation plan.'] },
          { name: 'Collaboration', score: 80, evidence: ['Used decision criteria and a time-boxed spike to resolve disagreement.'] },
        ],
        strengths: ['Evidence-led debugging', 'Clear trade-off reasoning', 'Constructive collaboration'],
        developmentAreas: ['Could explain accessibility verification in more detail.'],
        answers: [
          { question: this.jobs[0]!.questions[0]!.prompt, answer: this.sessions[0]!.answers[0]!.answer, competency: 'Problem solving' },
          { question: this.jobs[0]!.questions[1]!.prompt, answer: this.sessions[0]!.answers[1]!.answer, competency: 'Web fundamentals' },
          { question: this.jobs[0]!.questions[2]!.prompt, answer: this.sessions[0]!.answers[2]!.answer, competency: 'Collaboration' },
        ],
        reviewerNote: null,
        assessmentStatus: 'available',
        generatedBy: 'CyberVett structured evaluator',
        generatedAt: candidate.completedAt!,
      },
    ]
  }

  async initialize(): Promise<void> {
    this.users = [
      {
        id: USER_ID,
        organizationId: ORGANIZATION_ID,
        organizationName: 'Northstar Labs',
        name: 'Maya Lee',
        email: 'maya@northstarlabs.test',
        role: 'admin',
        mode: 'trainer',
        passwordHash: await hash('Demo123!', 10),
      },
    ]
  }

  async ready(): Promise<boolean> { return true }
  async close(): Promise<void> {}

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.id === id) ?? null
  }

  async registerOrganization(input: RegistrationInput, passwordHash: string): Promise<UserRecord | null> {
    if (this.users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) return null
    const organizationId = randomUUID()
    const organizationName = input.mode === 'trainer' ? input.organizationName : `${input.name}'s practice workspace`
    this.organizationNames.set(organizationId, organizationName)
    const user: UserRecord = {
      id: randomUUID(),
      organizationId,
      organizationName,
      name: input.name,
      email: input.email,
      role: input.mode === 'trainer' ? 'admin' : 'trainee',
      mode: input.mode,
      passwordHash,
    }
    this.users.push(user)
    return user
  }

  async getDashboard(organizationId: string): Promise<Dashboard> {
    const jobs = this.jobs.filter((job) => this.jobOrganizations.get(job.id) === organizationId)
    const candidates = this.sessions
      .filter((session) => session.organizationId === organizationId)
      .map(this.toCandidate)
    const scored = candidates.flatMap((candidate) => candidate.score === null ? [] : [candidate.score]).sort((a, b) => a - b)
    const sevenDaysAgo = Date.now() - 7 * 86_400_000
    return {
      activeJobs: jobs.filter((job) => job.status === 'active').length,
      awaitingReview: candidates.filter((candidate) => candidate.status === 'review').length,
      completedThisWeek: candidates.filter((candidate) => candidate.completedAt && new Date(candidate.completedAt).getTime() >= sevenDaysAgo).length,
      medianScore: this.median(scored),
      jobs,
      candidates,
    }
  }

  async listJobs(organizationId: string): Promise<Job[]> {
    return this.jobs.filter((job) => this.jobOrganizations.get(job.id) === organizationId)
  }

  async createJob(organizationId: string, input: CreateJobInput): Promise<Job> {
    if (!this.organizationNames.has(organizationId)) throw new Error('Organization not found')
    const job: Job = {
      ...input,
      id: randomUUID(),
      status: 'active',
      createdAt: new Date().toISOString(),
      candidateCount: 0,
    }
    this.jobs.unshift(job)
    this.jobOrganizations.set(job.id, organizationId)
    return job
  }

  async createInvitation(
    organizationId: string,
    jobId: string,
    tokenDigest: string,
    expiresAt: string,
  ): Promise<{ sessionId: string; expiresAt: string } | null> {
    const job = this.jobs.find((item) => item.id === jobId)
    if (!job || job.status !== 'active' || this.jobOrganizations.get(job.id) !== organizationId) return null
    const sessionId = randomUUID()
    this.sessions.unshift({
      id: sessionId,
      reportId: null,
      name: 'Invited candidate',
      email: `pending-${sessionId}@invalid.local`,
      jobId: job.id,
      jobTitle: job.title,
      status: 'invited',
      score: null,
      completedAt: null,
      organizationId,
      inviteTokenDigest: tokenDigest,
      questions: job.questions,
      answers: [],
      consentedAt: null,
      startedAt: null,
      reviewerNote: null,
      inviteExpiresAt: expiresAt,
      inviteRevokedAt: null,
      inviteConsumedAt: null,
      resumeTokenDigest: null,
      resumeExpiresAt: null,
      evaluationStartedAt: null,
    })
    job.candidateCount += 1
    return { sessionId, expiresAt }
  }

  async getInvitationByDigest(tokenDigest: string) {
    const session = this.sessions.find((item) => item.inviteTokenDigest === tokenDigest)
    if (!session) return null
    const job = this.jobs.find((item) => item.id === session.jobId)
    if (!job) return null
    return { session, job, organizationName: this.organizationNames.get(session.organizationId) ?? 'Hiring team' }
  }

  async startInvitation(
    tokenDigest: string,
    name: string,
    email: string,
    resumeTokenDigest: string,
    resumeExpiresAt: string,
  ): Promise<SessionRecord | null> {
    const session = this.sessions.find((item) => item.inviteTokenDigest === tokenDigest)
    if (
      session
      && session.status === 'in_progress'
      && !session.inviteRevokedAt
      && session.resumeTokenDigest === resumeTokenDigest
      && session.resumeExpiresAt
      && new Date(session.resumeExpiresAt).getTime() > Date.now()
    ) return session
    if (
      !session
      || session.status !== 'invited'
      || session.inviteRevokedAt
      || new Date(session.inviteExpiresAt).getTime() <= Date.now()
    ) return null
    Object.assign(session, {
      name,
      email,
      status: 'in_progress' as const,
      consentedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      inviteConsumedAt: new Date().toISOString(),
      resumeTokenDigest,
      resumeExpiresAt,
    })
    return session
  }

  async resumeInvitation(
    sessionId: string,
    resumeTokenDigest: string,
  ): Promise<SessionRecord | null> {
    const session = this.sessions.find((item) => item.id === sessionId)
    if (
      !session
      || !['in_progress', 'completed'].includes(session.status)
      || session.inviteRevokedAt
      || session.resumeTokenDigest !== resumeTokenDigest
      || !session.resumeExpiresAt
      || new Date(session.resumeExpiresAt).getTime() <= Date.now()
    ) return null
    return session
  }

  async revokeInvitation(
    organizationId: string,
    sessionId: string,
    audit: AuditEventInput,
  ): Promise<RevocationResult> {
    const session = this.sessions.find((item) => item.id === sessionId && item.organizationId === organizationId)
    if (!session) return { kind: 'not_found' }
    if (!['invited', 'in_progress'].includes(session.status)) return { kind: 'conflict' }
    session.status = 'revoked'
    session.inviteRevokedAt = new Date().toISOString()
    session.resumeTokenDigest = null
    session.resumeExpiresAt = null
    this.auditEvents.push(audit)
    return { kind: 'revoked' }
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.find((item) => item.id === sessionId) ?? null
  }

  async saveAnswer(
    sessionId: string,
    questionId: string,
    answer: string,
  ): Promise<{ session: SessionRecord; answerRevision: number } | null> {
    const session = await this.getSession(sessionId)
    if (!session || session.status !== 'in_progress' || !session.questions.some((q) => q.id === questionId)) return null
    const existing = session.answers.find((item) => item.questionId === questionId)
    if (existing) {
      Object.assign(existing, {
        answer,
        followUpPrompt: null,
        followUpAnswer: null,
        followUpPending: true,
        revision: existing.revision + 1,
        submittedAt: new Date().toISOString(),
      })
    } else {
      session.answers.push({
        questionId,
        answer,
        followUpPrompt: null,
        followUpAnswer: null,
        followUpPending: true,
        revision: 1,
        submittedAt: new Date().toISOString(),
      })
    }
    const saved = session.answers.find((item) => item.questionId === questionId)!
    return { session, answerRevision: saved.revision }
  }

  async saveFollowUpPrompt(
    sessionId: string,
    questionId: string,
    prompt: string,
    expectedRevision: number,
  ): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId)
    const existing = session?.answers.find((item) => item.questionId === questionId)
    if (
      !session
      || session.status !== 'in_progress'
      || !existing
      || !existing.followUpPending
      || existing.revision !== expectedRevision
    ) return null
    existing.followUpPrompt = prompt
    existing.followUpAnswer = null
    existing.followUpPending = false
    return session
  }

  async saveFollowUpAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId)
    const existing = session?.answers.find((item) => item.questionId === questionId)
    if (!session || session.status !== 'in_progress' || existing?.followUpPending || !existing?.followUpPrompt) return null
    existing.followUpAnswer = answer
    return session
  }

  async claimSessionForCompletion(sessionId: string): Promise<CompletionClaim> {
    const session = this.sessions.find((item) => item.id === sessionId)
    if (!session) return { kind: 'not_found' }
    if (session.reportId) {
      const report = this.reports.find((item) => item.id === session.reportId)
      return report ? { kind: 'existing', report } : { kind: 'inactive' }
    }
    if (session.status === 'completed') {
      const started = session.evaluationStartedAt ? new Date(session.evaluationStartedAt).getTime() : 0
      if (started > Date.now() - 2 * 60_000) return { kind: 'pending' }
      session.evaluationStartedAt = new Date().toISOString()
      return { kind: 'claimed', session: structuredClone(session) }
    }
    if (session.status !== 'in_progress') return { kind: 'inactive' }
    if (
      session.answers.length < session.questions.length
      || session.answers.some((answer) => answer.followUpPending || (answer.followUpPrompt && !answer.followUpAnswer))
    ) return { kind: 'incomplete' }
    session.status = 'completed'
    session.completedAt = new Date().toISOString()
    session.evaluationStartedAt = new Date().toISOString()
    return { kind: 'claimed', session: structuredClone(session) }
  }

  async completeSession(sessionId: string, evaluation: EvaluationResult): Promise<Report | null> {
    const session = this.sessions.find((item) => item.id === sessionId)
    if (!session) return null
    if (session.reportId) return this.reports.find((item) => item.id === session.reportId) ?? null
    if (session.status !== 'completed') return null
    session.status = 'review'
    session.score = evaluation.overallScore
    session.completedAt ??= new Date().toISOString()
    session.resumeTokenDigest = null
    session.resumeExpiresAt = null
    session.evaluationStartedAt = null
    const report: Report = {
      ...evaluation,
      id: randomUUID(),
      candidate: this.toCandidate(session),
      reviewerNote: null,
    }
    session.reportId = report.id
    report.candidate.reportId = report.id
    this.reports.unshift(report)
    return report
  }

  async getReport(organizationId: string, reportId: string): Promise<Report | null> {
    const report = this.reports.find((item) => item.id === reportId)
    if (!report) return null
    const session = this.sessions.find((item) => item.id === report.candidate.id)
    return session?.organizationId === organizationId ? report : null
  }

  async updateDecision(
    organizationId: string,
    reportId: string,
    decision: 'review' | 'shortlisted' | 'declined',
    note: string | undefined,
    audit: AuditEventInput,
  ): Promise<DecisionUpdateResult> {
    const report = await this.getReport(organizationId, reportId)
    if (!report) return { kind: 'not_found' }
    const previous = report.candidate.status
    const replayed = this.auditEvents.some((event) => (
      event.organizationId === audit.organizationId
      && event.requestId === audit.requestId
      && event.action === audit.action
      && event.entityType === audit.entityType
      && event.entityId === audit.entityId
    ))
    if (replayed) return { kind: 'updated', report }
    if (
      ['shortlisted', 'declined'].includes(previous)
      && ['shortlisted', 'declined'].includes(decision)
      && previous !== decision
    ) return { kind: 'conflict' }
    report.candidate.status = decision
    report.reviewerNote = note ?? null
    const session = await this.getSession(report.candidate.id)
    if (session) {
      session.status = decision
      session.reviewerNote = note ?? null
    }
    this.auditEvents.push(audit)
    return { kind: 'updated', report }
  }

  async logAudit(event: AuditEventInput): Promise<void> {
    this.auditEvents.push(event)
  }

  private toCandidate(session: SessionRecord): CandidateSummary {
    const { id, reportId, name, email, jobId, jobTitle, status, score, completedAt } = session
    return { id, reportId, name, email, jobId, jobTitle, status, score, completedAt }
  }

  private median(sorted: number[]): number | null {
    if (sorted.length === 0) return null
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
      ? sorted[middle]!
      : (sorted[middle - 1]! + sorted[middle]!) / 2
  }
}
