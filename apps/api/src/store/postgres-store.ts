import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import type { CandidateSummary, CreateJobInput, Dashboard, Job, Question, RegistrationInput, Report } from '@cybervett/contracts'
import type { EvaluationResult, SessionRecord, Store, UserRecord } from '../domain/types.js'

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
  submitted_at: Date
}

export class PostgresStore implements Store {
  private readonly pool: Pool

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    })
  }

  async ready(): Promise<boolean> {
    try {
      await this.pool.query('select 1')
      return true
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
      medianScore: scores.length > 0 ? scores[Math.floor(scores.length / 2)]! : null,
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

  async createInvitation(organizationId: string, jobId: string, tokenDigest: string): Promise<{ sessionId: string }> {
    const id = randomUUID()
    const result = await this.pool.query(
      `insert into interview_sessions (id, organization_id, job_id, invite_token_digest, status)
       select $1, $2, id, $3, 'invited' from jobs where id = $4 and organization_id = $2 and status = 'active'
       returning id`,
      [id, organizationId, tokenDigest, jobId],
    )
    if (result.rowCount !== 1) throw new Error('Job not found')
    return { sessionId: id }
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

  async startInvitation(tokenDigest: string, name: string, email: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<DbSession>(
      `update interview_sessions
       set candidate_name = $2, candidate_email = lower($3), status = 'in_progress',
           consented_at = coalesce(consented_at, now()), started_at = coalesce(started_at, now()), updated_at = now()
       where invite_token_digest = $1 and status in ('invited', 'in_progress')
       returning id`,
      [tokenDigest, name, email],
    )
    const row = result.rows[0]
    return row ? this.getSession(row.id) : null
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<DbSession>(`${this.sessionSelect} where s.id = $1`, [sessionId])
    const row = result.rows[0]
    return row ? this.mapSessionWithAnswers(row) : null
  }

  async saveAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null> {
    const session = await this.getSession(sessionId)
    if (!session || session.status !== 'in_progress' || !session.questions.some((question) => question.id === questionId)) return null
    await this.pool.query(
      `insert into interview_answers (id, session_id, question_id, answer, follow_up_prompt, follow_up_answer)
       values ($1, $2, $3, $4, null, null)
       on conflict (session_id, question_id) do update
       set answer = excluded.answer, follow_up_prompt = null, follow_up_answer = null, submitted_at = now()`,
      [randomUUID(), sessionId, questionId, answer],
    )
    return this.getSession(sessionId)
  }

  async saveFollowUpPrompt(sessionId: string, questionId: string, prompt: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `update interview_answers a set follow_up_prompt = $3, follow_up_answer = null
       from interview_sessions s
       where a.session_id = $1 and a.question_id = $2 and s.id = a.session_id and s.status = 'in_progress'
       returning a.id`,
      [sessionId, questionId, prompt],
    )
    return result.rowCount === 1 ? this.getSession(sessionId) : null
  }

  async saveFollowUpAnswer(sessionId: string, questionId: string, answer: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `update interview_answers a set follow_up_answer = $3
       from interview_sessions s
       where a.session_id = $1 and a.question_id = $2 and a.follow_up_prompt is not null
         and s.id = a.session_id and s.status = 'in_progress'
       returning a.id`,
      [sessionId, questionId, answer],
    )
    return result.rowCount === 1 ? this.getSession(sessionId) : null
  }

  async completeSession(sessionId: string, evaluation: EvaluationResult): Promise<Report | null> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const session = await this.getSessionWithClient(client, sessionId)
      if (!session || session.answers.length < session.questions.length || session.answers.some((answer) => answer.followUpPrompt && !answer.followUpAnswer)) {
        await client.query('rollback')
        return null
      }
      const reportId = randomUUID()
      const completedAt = new Date().toISOString()
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
        `update interview_sessions set status = 'review', score = $2, completed_at = $3, updated_at = now() where id = $1`,
        [sessionId, evaluation.overallScore, completedAt],
      )
      await client.query(
        `insert into interview_reports (id, session_id, organization_id, payload) values ($1, $2, $3, $4::jsonb)`,
        [reportId, sessionId, session.organizationId, JSON.stringify(report)],
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

  async updateDecision(organizationId: string, reportId: string, decision: 'review' | 'shortlisted' | 'declined', note?: string): Promise<Report | null> {
    const report = await this.getReport(organizationId, reportId)
    if (!report) return null
    const updated: Report = {
      ...report,
      candidate: { ...report.candidate, status: decision },
      reviewerNote: note ?? null,
    }
    const result = await this.pool.query(
      `update interview_reports r set payload = $3::jsonb, updated_at = now()
       from interview_sessions s
       where r.id = $1 and r.organization_id = $2 and s.id = r.session_id
       returning s.id`,
      [reportId, organizationId, JSON.stringify(updated)],
    )
    if (result.rowCount !== 1) return null
    await this.pool.query(
      `update interview_sessions set status = $2, reviewer_note = $3, updated_at = now()
       where id = $1 and organization_id = $4`,
      [report.candidate.id, decision, note ?? null, organizationId],
    )
    return updated
  }

  async logAudit(event: {
    organizationId: string
    actorId: string
    action: string
    entityType: string
    entityId?: string
    requestId?: string
  }): Promise<void> {
    await this.pool.query(
      `insert into audit_events (organization_id, actor_id, action, entity_type, entity_id, request_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [event.organizationId, event.actorId, event.action, event.entityType, event.entityId ?? null, event.requestId ?? null],
    )
  }

  private async listCandidates(organizationId: string): Promise<CandidateSummary[]> {
    const result = await this.pool.query<DbSession>(
      `${this.sessionSelect} where s.organization_id = $1 order by s.created_at desc limit 100`,
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
      'select question_id, answer, follow_up_prompt, follow_up_answer, submitted_at from interview_answers where session_id = $1 order by submitted_at',
      [row.id],
    )
    return this.mapSession(row, answers.rows)
  }

  private async getSessionWithClient(client: PoolClient, sessionId: string): Promise<SessionRecord | null> {
    const sessionResult = await client.query<DbSession>(`${this.sessionSelect} where s.id = $1 for update of s`, [sessionId])
    const row = sessionResult.rows[0]
    if (!row) return null
    const answers = await client.query<DbAnswer>(
      'select question_id, answer, follow_up_prompt, follow_up_answer, submitted_at from interview_answers where session_id = $1 order by submitted_at',
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
        submittedAt: answer.submitted_at.toISOString(),
      })),
      consentedAt: row.consented_at?.toISOString() ?? null,
      startedAt: row.started_at?.toISOString() ?? null,
      reviewerNote: row.reviewer_note,
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
  private readonly sessionSelect = `
    select s.id, r.id as report_id, s.organization_id, s.candidate_name, s.candidate_email, s.job_id,
           j.title as job_title, s.status, s.score, s.completed_at, s.invite_token_digest,
           j.questions, s.consented_at, s.started_at, s.reviewer_note
    from interview_sessions s join jobs j on j.id = s.job_id
    left join interview_reports r on r.session_id = s.id`
}
