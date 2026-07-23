import type {
  CandidateSummary,
  CreateJobInput,
  Dashboard,
  Job,
  Question,
  Report,
  RegistrationInput,
  Role,
} from '@cybervett/contracts'

export type UserRecord = {
  id: string
  organizationId: string
  organizationName: string
  name: string
  email: string
  role: Role
  mode: 'trainer' | 'trainee'
  passwordHash: string
}

export type SessionRecord = CandidateSummary & {
  organizationId: string
  inviteTokenDigest: string
  questions: Question[]
  answers: Array<{
    questionId: string
    answer: string
    followUpPrompt: string | null
    followUpAnswer: string | null
    submittedAt: string
  }>
  consentedAt: string | null
  startedAt: string | null
  reviewerNote: string | null
}

export type EvaluationResult = Omit<Report, 'id' | 'candidate' | 'reviewerNote'>

export interface Store {
  ready(): Promise<boolean>
  close(): Promise<void>
  findUserByEmail(email: string): Promise<UserRecord | null>
  findUserById(id: string): Promise<UserRecord | null>
  registerOrganization(input: RegistrationInput, passwordHash: string): Promise<UserRecord | null>
  getDashboard(organizationId: string): Promise<Dashboard>
  listJobs(organizationId: string): Promise<Job[]>
  createJob(organizationId: string, input: CreateJobInput): Promise<Job>
  createInvitation(organizationId: string, jobId: string, tokenDigest: string): Promise<{ sessionId: string }>
  getInvitationByDigest(tokenDigest: string): Promise<{ session: SessionRecord; job: Job; organizationName: string } | null>
  startInvitation(tokenDigest: string, name: string, email: string): Promise<SessionRecord | null>
  getSession(sessionId: string): Promise<SessionRecord | null>
  saveAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null>
  saveFollowUpPrompt(sessionId: string, questionId: string, prompt: string): Promise<SessionRecord | null>
  saveFollowUpAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null>
  completeSession(sessionId: string, evaluation: EvaluationResult): Promise<Report | null>
  getReport(organizationId: string, reportId: string): Promise<Report | null>
  updateDecision(
    organizationId: string,
    reportId: string,
    decision: 'review' | 'shortlisted' | 'declined',
    note?: string,
  ): Promise<Report | null>
  logAudit(event: {
    organizationId: string
    actorId: string
    action: string
    entityType: string
    entityId?: string
    requestId?: string
  }): Promise<void>
}
