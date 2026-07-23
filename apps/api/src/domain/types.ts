import type {
  CandidateSummary,
  CreateJobInput,
  Dashboard,
  EvaluationResult as ContractEvaluationResult,
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
    followUpPending: boolean
    revision: number
    submittedAt: string
  }>
  consentedAt: string | null
  startedAt: string | null
  reviewerNote: string | null
  inviteExpiresAt: string
  inviteRevokedAt: string | null
  inviteConsumedAt: string | null
  resumeTokenDigest: string | null
  resumeExpiresAt: string | null
  evaluationStartedAt: string | null
}

export type EvaluationResult = ContractEvaluationResult

export type AuditEventInput = {
  organizationId: string
  actorId: string
  action: string
  entityType: string
  entityId?: string
  requestId?: string
}

export type CompletionClaim =
  | { kind: 'claimed'; session: SessionRecord }
  | { kind: 'pending' }
  | { kind: 'existing'; report: Report }
  | { kind: 'not_found' }
  | { kind: 'inactive' }
  | { kind: 'incomplete' }

export type DecisionUpdateResult =
  | { kind: 'updated'; report: Report }
  | { kind: 'not_found' }
  | { kind: 'conflict' }

export type RevocationResult =
  | { kind: 'revoked' }
  | { kind: 'not_found' }
  | { kind: 'conflict' }

export interface Store {
  ready(): Promise<boolean>
  close(): Promise<void>
  findUserByEmail(email: string): Promise<UserRecord | null>
  findUserById(id: string): Promise<UserRecord | null>
  registerOrganization(input: RegistrationInput, passwordHash: string): Promise<UserRecord | null>
  getDashboard(organizationId: string): Promise<Dashboard>
  listJobs(organizationId: string): Promise<Job[]>
  createJob(organizationId: string, input: CreateJobInput): Promise<Job>
  createInvitation(
    organizationId: string,
    jobId: string,
    tokenDigest: string,
    expiresAt: string,
  ): Promise<{ sessionId: string; expiresAt: string } | null>
  getInvitationByDigest(tokenDigest: string): Promise<{ session: SessionRecord; job: Job; organizationName: string } | null>
  startInvitation(
    tokenDigest: string,
    name: string,
    email: string,
    resumeTokenDigest: string,
    resumeExpiresAt: string,
  ): Promise<SessionRecord | null>
  resumeInvitation(
    sessionId: string,
    resumeTokenDigest: string,
  ): Promise<SessionRecord | null>
  revokeInvitation(
    organizationId: string,
    sessionId: string,
    audit: AuditEventInput,
  ): Promise<RevocationResult>
  getSession(sessionId: string): Promise<SessionRecord | null>
  saveAnswer(
    sessionId: string,
    questionId: string,
    answer: string,
  ): Promise<{ session: SessionRecord; answerRevision: number } | null>
  saveFollowUpPrompt(
    sessionId: string,
    questionId: string,
    prompt: string,
    expectedRevision: number,
  ): Promise<SessionRecord | null>
  saveFollowUpAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null>
  claimSessionForCompletion(sessionId: string): Promise<CompletionClaim>
  completeSession(sessionId: string, evaluation: EvaluationResult): Promise<Report | null>
  getReport(organizationId: string, reportId: string): Promise<Report | null>
  updateDecision(
    organizationId: string,
    reportId: string,
    decision: 'review' | 'shortlisted' | 'declined',
    note: string | undefined,
    audit: AuditEventInput,
  ): Promise<DecisionUpdateResult>
  logAudit(event: AuditEventInput): Promise<void>
}
