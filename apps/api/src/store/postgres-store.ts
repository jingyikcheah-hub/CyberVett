import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import type { CandidateSummary, CreateJobInput, Dashboard, Job, Question, RegistrationInput, Report } from '@cybervett/contracts'
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
import { assertDatabaseUrlDoesNotConfigureSsl } from '../config/database.js'
import { EXPECTED_SCHEMA_VERSION } from '../scripts/migration-manifest.js'

type DbJob = QueryResultRow & {
  id: string
  title: string
  department: string
  location: string
  status: Job['status']
  duration_minutes: number
  questions: Question[]
  created_at: Date
  candidate_count: string | number
}

type DbSession = QueryResultRow & {
  id: string
  report_id: string | null
  organization_id: string
  candidate_name: string | null
  candidate_email: string | null
  job_id: string
  job_title: string
  status: SessionRecord['status']
  score: number | null
  completed_at: Date | null
  invite_token_digest: string
  questions: Question[]
  consented_at: Date | null
  started_at: Date | null
  reviewer_note: string | null
  invite_expires_at: Date
  invite_revoked_at: Date | null
  invite_consumed_at: Date | null
  resume_token_digest: string | null
  resume_expires_at: Date | null
  evaluation_started_at: Date | null
}

type DbUser = QueryResultRow & {
  id: string
  organization_id: string
  organization_name: string
  name: string
  email: string
  role: UserRecord['role']
  account_mode: UserRecord['mode']
  password_hash: string
}

type DbAnswer = QueryResultRow & {
  question_id: string
  answer: string
  follow_up_prompt: string | null
  follow_up_answer: string | null
  follow_up_pending: boolean
  answer_revision: number
  submitted_at: Date
}

export class PostgresStore implements Store {
  private readonly pool: Pool

  constructor(
    databaseUrl: string,
    sslMode: 'disable' | 'require' | 'verify-full' = 'disable',
    sslCa?: string,
  ) {
    assertDatabaseUrlDoesNotConfigureSsl(databaseUrl)
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: sslMode === 'disable'
        ? undefined
        : { rejectUnauthorized: sslMode === 'verify-full', ...(sslCa ? { ca: sslCa } : {}) },
    })
  }

  async ready(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ready: boolean }>(
        `select to_regclass('public.cybervett_schema_migrations') is not null
          and exists (
            select 1 from cybervett_schema_migrations where version = $1
          ) as ready`,
        [EXPECTED_SCHEMA_VERSION],
      )
      return result.rows[0]?.ready === true
    } catch {
      return false
    }
  }

  async close(): Promise<void> { await this.pool.end() }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<DbUser>(
      `select u.id, u.organization_id, o.name as organization_name, u.name, u.email, u.role, u.account_mode, u.password_hash
       from users u join organizations o on o.id = u.organization_id
       where lower(u.email) = lower($1) and u.active = true`,
      [email],
    )
    const row = result.rows[0]
    return row ? this.mapUser(row) : null
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const result = await this.pool.query<DbUser>(
      `select u.id, u.organization_id, o.name as organization_name, u.name, u.email, u.role, u.account_mode, u.password_hash
       from users u join organizations o on o.id = u.organization_id
       where u.id = $1 and u.active = true`,
      [id],
    )
    const row = result.rows[0]
    return row ? this.mapUser(row) : null
  }

  async registerOrganization(input: RegistrationInput, passwordHash: string): Promise<UserRecord | null> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const organizationId = randomUUID()
      const userId = randomUUID()
      const organizationName = input.mode === 'trainer' ? input.organizationName : `${input.name}'s practice workspace`
      await client.query('insert into organizations (id, name) values ($1, $2)', [organizationId, organizationName])
      await client.query(
        `insert into users (id, organization_id, name, email, role, account_mode, password_hash)
         values ($1, $2, $3, lower($4), $5, $6, $7)`,
        [userId, organizationId, input.name, input.email, input.mode === 'trainer' ? 'admin' : 'trainee', input.mode, passwordHash],
      )
      await client.query('commit')
      return {
        id: userId,
        organizationId,
        organizationName,
        name: input.name,
        email: input.email,
        role: input.mode === 'trainer' ? 'admin' : 'trainee',
        mode: input.mode,
        passwordHash,
      }
    } catch (error) {
      await client.query('rollback')
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return null
      throw error
    } finally {
      client.release()
    }
  }

  async getDashboard(organizationId: string): Promise<Dashboard> {
    const [jobs, candidates] = await Promise.all([
      this.listJobs(organizationId),
      this.listCandidates(organizationId),
    ])
    const scores = candidates.flatMap((candidate) => candidate.score === null ? [] : [candidate.score]).sort((a, b) => a - b)
    const sevenDaysAgo = Date.now() - 7 * 86_400_000
    return {
      activeJobs: jobs.filter((job) => job.status === 'active').length,
      awaitingReview: candidates.filter((candidate) => candidate.status === 'review').length,
      completedThisWeek: candidates.filter((candidate) => candidate.completedAt && new Date(candidate.completedAt).getTime() >= sevenDaysAgo).length,
      medianScore: this.median(scores),
      jobs,
      candidates,
    }
  }

  async listJobs(organizationId: string): Promise<Job[]> {
    const result = await this.pool.query<DbJob>(
      `select j.*, count(s.id) as candidate_count
       from jobs j left join interview_sessions s on s.job_id = j.id
       where j.organization_id = $1
       group by j.id order by j.created_at desc`,
      [organizationId],
    )
    return result.rows.map(this.mapJob)
  }

  async createJob(organizationId: string, input: CreateJobInput): Promise<Job> {
    const id = randomUUID()
    const result = await this.pool.query<DbJob>(
      `insert into jobs (id, organization_id, title, department, location, status, duration_minutes, questions)
       values ($1, $2, $3, $4, $5, 'active', $6, $7::jsonb)
       returning *, 0 as candidate_count`,
      [id, organizationId, input.title, input.department, input.location, input.durationMinutes, JSON.stringify(input.questions)],
    )
    return this.mapJob(result.rows[0]!)
  }

  async createInvitation(
    organizationId: string,
    jobId: string,
    tokenDigest: string,
    expiresAt: string,
  ): Promise<{ sessionId: string; expiresAt: string } | null> {
    const id = randomUUID()
    const result = await this.pool.query(
      `insert into interview_sessions (
         id, organization_id, job_id, invite_token_digest, invite_expires_at, status
       )
       select $1, $2, id, $3, $4, 'invited'
       from jobs where id = $5 and organization_id = $2 and status = 'active'
       returning id, invite_expires_at`,
      [id, organizationId, tokenDigest, expiresAt, jobId],
    )
    if (result.rowCount !== 1) return null
    return { sessionId: id, expiresAt }
  }

  async getInvitationByDigest(tokenDigest: string) {
    const result = await this.pool.query<DbSession & { organization_name: string }>(
      `${this.sessionSelect}
       join organizations o on o.id = s.organization_id
       where s.invite_token_digest = $1`,
      [tokenDigest],
    )
    const row = result.rows[0]
    if (!row) return null
    const [session, job] = await Promise.all([
      this.mapSessionWithAnswers(row),
      this.getJob(row.organization_id, row.job_id),
    ])
    return job ? { session, job, organizationName: row.organization_name } : null
  }

  async startInvitation(
    tokenDigest: string,
    name: string,
    email: string,
    resumeTokenDigest: string,
    resumeExpiresAt: string,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query<DbSession>(
      `update interview_sessions
       set candidate_name = $2, candidate_email = lower($3), status = 'in_progress',
           consented_at = now(), started_at = now(), invite_consumed_at = now(),
           resume_token_digest = $4, resume_expires_at = $5, updated_at = now()
       where invite_token_digest = $1 and status = 'invited'
         and invite_revoked_at is null and invite_expires_at > now()
       returning id`,
      [tokenDigest, name, email, resumeTokenDigest, resumeExpiresAt],
    )
    const row = result.rows[0]
    if (row) return this.getSession(row.id)
    const retry = await this.pool.query<{ id: string }>(
      `select id from interview_sessions
       where invite_token_digest = $1 and resume_token_digest = $2 and status = 'in_progress'
         and invite_revoked_at is null and resume_expires_at > now()`,
      [tokenDigest, resumeTokenDigest],
    )
    return retry.rows[0] ? this.getSession(retry.rows[0].id) : null
  }

  async resumeInvitation(
    sessionId: string,
    resumeTokenDigest: string,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query<{ id: string }>(
      `select id from interview_sessions
       where id = $1 and resume_token_digest = $2 and status in ('in_progress', 'completed')
         and invite_revoked_at is null and resume_expires_at > now()`,
      [sessionId, resumeTokenDigest],
    )
    return result.rowCount === 1 ? this.getSession(sessionId) : null
  }

  async revokeInvitation(
    organizationId: string,
    sessionId: string,
    audit: AuditEventInput,
  ): Promise<RevocationResult> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query<{ id: string }>(
        `update interview_sessions
         set status = 'revoked', invite_revoked_at = now(), resume_token_digest = null,
             resume_expires_at = null, updated_at = now()
         where id = $1 and organization_id = $2 and status in ('invited', 'in_progress')
         returning id`,
        [sessionId, organizationId],
      )
      if (result.rowCount !== 1) {
        const existing = await client.query(
          'select 1 from interview_sessions where id = $1 and organization_id = $2',
          [sessionId, organizationId],
        )
        await client.query('rollback')
        return existing.rowCount === 1 ? { kind: 'conflict' } : { kind: 'not_found' }
      }
      await this.insertAudit(client, audit)
      await client.query('commit')
      return { kind: 'revoked' }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<DbSession>(`${this.sessionSelect} where s.id = $1`, [sessionId])
    const row = result.rows[0]
    return row ? this.mapSessionWithAnswers(row) : null
  }

  async saveAnswer(
    sessionId: string,
    questionId: string,
    answer: string,
  ): Promise<{ session: SessionRecord; answerRevision: number } | null> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const state = await client.query<{ status: SessionRecord['status']; questions: Question[] }>(
        `select s.status, j.questions
         from interview_sessions s join jobs j on j.id = s.job_id
         where s.id = $1
         for update of s`,
        [sessionId],
      )
      const current = state.rows[0]
      if (
        !current
        || current.status !== 'in_progress'
        || !current.questions.some((question) => question.id === questionId)
      ) {
        await client.query('rollback')
        return null
      }
      const saved = await client.query<{ answer_revision: number }>(
        `insert into interview_answers (
           id, session_id, question_id, answer, follow_up_prompt, follow_up_answer,
           follow_up_pending, answer_revision
         )
         values ($1, $2, $3, $4, null, null, true, 1)
         on conflict (session_id, question_id) do update
         set answer = excluded.answer, follow_up_prompt = null, follow_up_answer = null,
             follow_up_pending = true,
             answer_revision = interview_answers.answer_revision + 1,
             submitted_at = now()
         returning answer_revision`,
        [randomUUID(), sessionId, questionId, answer],
      )
      await client.query('commit')
      const session = await this.getSession(sessionId)
      return session ? { session, answerRevision: saved.rows[0]!.answer_revision } : null
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async saveFollowUpPrompt(
    sessionId: string,
    questionId: string,
    prompt: string,
    expectedRevision: number,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `update interview_answers a
       set follow_up_prompt = $3, follow_up_answer = null, follow_up_pending = false
       from interview_sessions s
       where a.session_id = $1 and a.question_id = $2 and a.answer_revision = $4
         and a.follow_up_pending = true
         and s.id = a.session_id and s.status = 'in_progress'
       returning a.id`,
      [sessionId, questionId, prompt, expectedRevision],
    )
    return result.rowCount === 1 ? this.getSession(sessionId) : null
  }

  async saveFollowUpAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `update interview_answers a set follow_up_answer = $3
       from interview_sessions s
       where a.session_id = $1 and a.question_id = $2 and a.follow_up_prompt is not null
         and a.follow_up_pending = false
         and s.id = a.session_id and s.status = 'in_progress'
       returning a.id`,
      [sessionId, questionId, answer],
    )
    return result.rowCount === 1 ? this.getSession(sessionId) : null
  }

  async claimSessionForCompletion(sessionId: string): Promise<CompletionClaim> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const session = await this.getSessionWithClient(client, sessionId)
      if (!session) {
        await client.query('rollback')
        return { kind: 'not_found' }
      }
      if (session.reportId) {
        const existing = await this.getReportBySessionWithClient(client, session.id)
        await client.query('rollback')
        return existing ? { kind: 'existing', report: existing } : { kind: 'inactive' }
      }
      if (session.status === 'completed') {
        const started = session.evaluationStartedAt ? new Date(session.evaluationStartedAt).getTime() : 0
        if (started > Date.now() - 2 * 60_000) {
          await client.query('rollback')
          return { kind: 'pending' }
        }
        await client.query(
          'update interview_sessions set evaluation_started_at = now(), updated_at = now() where id = $1',
          [sessionId],
        )
        await client.query('commit')
        return {
          kind: 'claimed',
          session: { ...session, evaluationStartedAt: new Date().toISOString() },
        }
      }
      if (session.status !== 'in_progress') {
        await client.query('rollback')
        return { kind: 'inactive' }
      }
      if (
        session.answers.length < session.questions.length
        || session.answers.some((answer) => answer.followUpPending || (answer.followUpPrompt && !answer.followUpAnswer))
      ) {
        await client.query('rollback')
        return { kind: 'incomplete' }
      }
      const completedAt = new Date().toISOString()
      await client.query(
        `update interview_sessions
         set status = 'completed', completed_at = $2, evaluation_started_at = now(), updated_at = now()
         where id = $1 and status = 'in_progress'`,
        [sessionId, completedAt],
      )
      await client.query('commit')
      return {
        kind: 'claimed',
        session: {
          ...session,
          status: 'completed',
          completedAt,
          evaluationStartedAt: new Date().toISOString(),
        },
      }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async completeSession(sessionId: string, evaluation: EvaluationResult): Promise<Report | null> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const session = await this.getSessionWithClient(client, sessionId)
      if (!session) {
        await client.query('rollback')
        return null
      }
      const existing = await this.getReportBySessionWithClient(client, sessionId)
      if (existing) {
        await client.query('rollback')
        return existing
      }
      if (session.status !== 'completed') {
        await client.query('rollback')
        return null
      }
      const reportId = randomUUID()
      const completedAt = session.completedAt ?? new Date().toISOString()
      const candidate: CandidateSummary = {
        id: session.id,
        reportId,
        name: session.name,
        email: session.email,
        jobId: session.jobId,
        jobTitle: session.jobTitle,
        status: 'review',
        score: evaluation.overallScore,
        completedAt,
      }
      const report: Report = { ...evaluation, id: reportId, candidate, reviewerNote: null }
      await client.query(
        `insert into interview_reports (id, session_id, organization_id, payload) values ($1, $2, $3, $4::jsonb)`,
        [reportId, sessionId, session.organizationId, JSON.stringify(report)],
      )
      await client.query(
        `update interview_sessions
         set status = 'review', score = $2, completed_at = $3, evaluation_started_at = null,
             resume_token_digest = null, resume_expires_at = null, updated_at = now()
         where id = $1 and status = 'completed'`,
        [sessionId, evaluation.overallScore, completedAt],
      )
      await client.query('commit')
      return report
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async getReport(organizationId: string, reportId: string): Promise<Report | null> {
    const result = await this.pool.query<QueryResultRow & { payload: Report }>(
      'select payload from interview_reports where id = $1 and organization_id = $2',
      [reportId, organizationId],
    )
    return result.rows[0]?.payload ?? null
  }

  async updateDecision(
    organizationId: string,
    reportId: string,
    decision: 'review' | 'shortlisted' | 'declined',
    note: string | undefined,
    audit: AuditEventInput,
  ): Promise<DecisionUpdateResult> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const locked = await client.query<QueryResultRow & {
        payload: Report
        session_id: string
        session_status: SessionRecord['status']
      }>(
        `select r.payload, r.session_id, s.status as session_status
         from interview_reports r
         join interview_sessions s on s.id = r.session_id
         where r.id = $1 and r.organization_id = $2
         for update of r, s`,
        [reportId, organizationId],
      )
      const row = locked.rows[0]
      if (!row) {
        await client.query('rollback')
        return { kind: 'not_found' }
      }
      const replayed = await client.query(
        `select 1
         from audit_events
         where organization_id = $1 and request_id = $2 and action = $3
           and entity_type = $4 and entity_id = $5
         limit 1`,
        [audit.organizationId, audit.requestId, audit.action, audit.entityType, audit.entityId],
      )
      if (replayed.rowCount === 1) {
        await client.query('rollback')
        return { kind: 'updated', report: row.payload }
      }
      if (
        ['shortlisted', 'declined'].includes(row.session_status)
        && ['shortlisted', 'declined'].includes(decision)
        && row.session_status !== decision
      ) {
        await client.query('rollback')
        return { kind: 'conflict' }
      }
      const updated: Report = {
        ...row.payload,
        candidate: { ...row.payload.candidate, status: decision },
        reviewerNote: note ?? null,
      }
      await client.query(
        'update interview_reports set payload = $2::jsonb, updated_at = now() where id = $1',
        [reportId, JSON.stringify(updated)],
      )
      await client.query(
        `update interview_sessions
         set status = $2, reviewer_note = $3, updated_at = now()
         where id = $1 and organization_id = $4`,
        [row.session_id, decision, note ?? null, organizationId],
      )
      await this.insertAudit(client, audit)
      await client.query('commit')
      return { kind: 'updated', report: updated }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async logAudit(event: AuditEventInput): Promise<void> {
    await this.insertAudit(this.pool, event)
  }

  private async listCandidates(organizationId: string): Promise<CandidateSummary[]> {
    const result = await this.pool.query<DbSession>(
      `${this.sessionSelect} where s.organization_id = $1 order by s.created_at desc`,
      [organizationId],
    )
    return result.rows.map((row) => this.toCandidate(row))
  }

  private async getJob(organizationId: string, jobId: string): Promise<Job | null> {
    const result = await this.pool.query<DbJob>(
      `select j.*, count(s.id) as candidate_count from jobs j
       left join interview_sessions s on s.job_id = j.id
       where j.organization_id = $1 and j.id = $2 group by j.id`,
      [organizationId, jobId],
    )
    return result.rows[0] ? this.mapJob(result.rows[0]) : null
  }

  private async mapSessionWithAnswers(row: DbSession): Promise<SessionRecord> {
    const answers = await this.pool.query<DbAnswer>(
      `select question_id, answer, follow_up_prompt, follow_up_answer, follow_up_pending,
              answer_revision, submitted_at
       from interview_answers where session_id = $1 order by submitted_at`,
      [row.id],
    )
    return this.mapSession(row, answers.rows)
  }

  private async getSessionWithClient(client: PoolClient, sessionId: string): Promise<SessionRecord | null> {
    const sessionResult = await client.query<DbSession>(`${this.sessionSelect} where s.id = $1 for update of s`, [sessionId])
    const row = sessionResult.rows[0]
    if (!row) return null
    const answers = await client.query<DbAnswer>(
      `select question_id, answer, follow_up_prompt, follow_up_answer, follow_up_pending,
              answer_revision, submitted_at
       from interview_answers where session_id = $1 order by submitted_at`,
      [sessionId],
    )
    return this.mapSession(row, answers.rows)
  }

  private mapSession(row: DbSession, answers: DbAnswer[]): SessionRecord {
    return {
      ...this.toCandidate(row),
      organizationId: row.organization_id,
      inviteTokenDigest: row.invite_token_digest,
      questions: row.questions,
      answers: answers.map((answer) => ({
        questionId: answer.question_id,
        answer: answer.answer,
        followUpPrompt: answer.follow_up_prompt,
        followUpAnswer: answer.follow_up_answer,
        followUpPending: answer.follow_up_pending,
        revision: answer.answer_revision,
        submittedAt: answer.submitted_at.toISOString(),
      })),
      consentedAt: row.consented_at?.toISOString() ?? null,
      startedAt: row.started_at?.toISOString() ?? null,
      reviewerNote: row.reviewer_note,
      inviteExpiresAt: row.invite_expires_at.toISOString(),
      inviteRevokedAt: row.invite_revoked_at?.toISOString() ?? null,
      inviteConsumedAt: row.invite_consumed_at?.toISOString() ?? null,
      resumeTokenDigest: row.resume_token_digest,
      resumeExpiresAt: row.resume_expires_at?.toISOString() ?? null,
      evaluationStartedAt: row.evaluation_started_at?.toISOString() ?? null,
    }
  }

  private toCandidate(row: DbSession): CandidateSummary {
    return {
      id: row.id,
      reportId: row.report_id,
      name: row.candidate_name ?? 'Invited candidate',
      email: row.candidate_email ?? `pending-${row.id}@invalid.local`,
      jobId: row.job_id,
      jobTitle: row.job_title,
      status: row.status,
      score: row.score,
      completedAt: row.completed_at?.toISOString() ?? null,
    }
  }

  private mapJob(row: DbJob): Job {
    return {
      id: row.id,
      title: row.title,
      department: row.department,
      location: row.location,
      status: row.status,
      durationMinutes: row.duration_minutes,
      questions: row.questions,
      createdAt: row.created_at.toISOString(),
      candidateCount: Number(row.candidate_count),
    }
  }

  private mapUser(row: DbUser): UserRecord {
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      name: row.name,
      email: row.email,
      role: row.role,
      mode: row.account_mode,
      passwordHash: row.password_hash,
    }
  }

  private async getReportBySessionWithClient(client: PoolClient, sessionId: string): Promise<Report | null> {
    const result = await client.query<QueryResultRow & { payload: Report }>(
      'select payload from interview_reports where session_id = $1',
      [sessionId],
    )
    return result.rows[0]?.payload ?? null
  }

  private async insertAudit(client: Pool | PoolClient, event: AuditEventInput): Promise<void> {
    await client.query(
      `insert into audit_events (organization_id, actor_id, action, entity_type, entity_id, request_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        event.organizationId,
        event.actorId,
        event.action,
        event.entityType,
        event.entityId ?? null,
        event.requestId ?? null,
      ],
    )
  }

  private median(sorted: number[]): number | null {
    if (sorted.length === 0) return null
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
      ? sorted[middle]!
      : (sorted[middle - 1]! + sorted[middle]!) / 2
  }

  private readonly sessionSelect = `
    select s.id, r.id as report_id, s.organization_id, s.candidate_name, s.candidate_email, s.job_id,
           j.title as job_title, s.status, s.score, s.completed_at, s.invite_token_digest,
           j.questions, s.consented_at, s.started_at, s.reviewer_note, s.invite_expires_at,
           s.invite_revoked_at, s.invite_consumed_at, s.resume_token_digest, s.resume_expires_at,
           s.evaluation_started_at
    from interview_sessions s join jobs j on j.id = s.job_id
    left join interview_reports r on r.session_id = s.id`
}
