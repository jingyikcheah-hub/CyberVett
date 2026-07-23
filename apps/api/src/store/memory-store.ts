import { randomUUID } from 'node:crypto'
import { hash } from 'bcryptjs'
import type { CandidateSummary, CreateJobInput, Dashboard, Job, RegistrationInput, Report } from '@cybervett/contracts'
import type { EvaluationResult, SessionRecord, Store, UserRecord } from '../domain/types.js'
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
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
          {
            questionId: 'q2',
            answer: 'I would reproduce the issue, inspect network and performance traces, then separate rendering cost from data-fetching cost. For rendering, I would consider pagination or virtualization and confirm the result with before-and-after measurements.',
            followUpPrompt: null,
            followUpAnswer: null,
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
          {
            questionId: 'q3',
            answer: 'I wrote down the decision criteria, asked each engineer to explain their main concern, and proposed a small time-boxed spike. The team used the evidence from that spike and recorded the decision so we could revisit it later.',
            followUpPrompt: null,
            followUpAnswer: null,
            submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
        ],
        consentedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        startedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        reviewerNote: null,
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
    if (await this.findUserByEmail(input.email)) return null
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
    return {
      activeJobs: jobs.filter((job) => job.status === 'active').length,
      awaitingReview: candidates.filter((candidate) => candidate.status === 'review').length,
      completedThisWeek: candidates.filter((candidate) => candidate.completedAt !== null).length,
      medianScore: scored.length > 0 ? scored[Math.floor(scored.length / 2)]! : null,
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

  async createInvitation(organizationId: string, jobId: string, tokenDigest: string): Promise<{ sessionId: string }> {
    const job = this.jobs.find((item) => item.id === jobId)
    if (!job || this.jobOrganizations.get(job.id) !== organizationId) throw new Error('Job not found')
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
    })
    job.candidateCount += 1
    return { sessionId }
  }

  async getInvitationByDigest(tokenDigest: string) {
    const session = this.sessions.find((item) => item.inviteTokenDigest === tokenDigest)
    if (!session) return null
    const job = this.jobs.find((item) => item.id === session.jobId)
    if (!job) return null
    return { session, job, organizationName: this.organizationNames.get(session.organizationId) ?? 'Hiring team' }
  }

  async startInvitation(tokenDigest: string, name: string, email: string): Promise<SessionRecord | null> {
    const result = await this.getInvitationByDigest(tokenDigest)
    if (!result || !['invited', 'in_progress'].includes(result.session.status)) return null
    Object.assign(result.session, {
      name,
      email,
      status: 'in_progress' as const,
      consentedAt: result.session.consentedAt ?? new Date().toISOString(),
      startedAt: result.session.startedAt ?? new Date().toISOString(),
    })
    return result.session
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.find((item) => item.id === sessionId) ?? null
  }

  async saveAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId)
    if (!session || session.status !== 'in_progress' || !session.questions.some((q) => q.id === questionId)) return null
    const existing = session.answers.find((item) => item.questionId === questionId)
    if (existing) Object.assign(existing, { answer, followUpPrompt: null, followUpAnswer: null, submittedAt: new Date().toISOString() })
    else session.answers.push({ questionId, answer, followUpPrompt: null, followUpAnswer: null, submittedAt: new Date().toISOString() })
    return session
  }

  async saveFollowUpPrompt(sessionId: string, questionId: string, prompt: string): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId)
    const existing = session?.answers.find((item) => item.questionId === questionId)
    if (!session || session.status !== 'in_progress' || !existing) return null
    existing.followUpPrompt = prompt
    existing.followUpAnswer = null
    return session
  }

  async saveFollowUpAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId)
    const existing = session?.answers.find((item) => item.questionId === questionId)
    if (!session || session.status !== 'in_progress' || !existing?.followUpPrompt) return null
    existing.followUpAnswer = answer
    return session
  }

  async completeSession(sessionId: string, evaluation: EvaluationResult): Promise<Report | null> {
    const session = await this.getSession(sessionId)
    if (!session || session.answers.length < session.questions.length || session.answers.some((answer) => answer.followUpPrompt && !answer.followUpAnswer)) return null
    session.status = 'review'
    session.score = evaluation.overallScore
    session.completedAt = new Date().toISOString()
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

  async updateDecision(organizationId: string, reportId: string, decision: 'review' | 'shortlisted' | 'declined', note?: string): Promise<Report | null> {
    const report = await this.getReport(organizationId, reportId)
    if (!report) return null
    report.candidate.status = decision
    report.reviewerNote = note ?? null
    const session = await this.getSession(report.candidate.id)
    if (session) {
      session.status = decision
      session.reviewerNote = note ?? null
    }
    return report
  }

  async logAudit(): Promise<void> {}

  private toCandidate(session: SessionRecord): CandidateSummary {
    const { id, reportId, name, email, jobId, jobTitle, status, score, completedAt } = session
    return { id, reportId, name, email, jobId, jobTitle, status, score, completedAt }
  }
}
