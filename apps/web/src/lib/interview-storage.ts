import type { Question } from '@cybervett/contracts'

export type InterviewAnswer = {
  questionId: string
  answer: string
  followUpPrompt: string | null
  followUpAnswer: string | null
  followUpPending: boolean
}

export type CandidateInterviewSession = {
  sessionId: string
  accessToken: string
  resumeToken: string
  candidateName: string
  questions: Question[]
  answers: InterviewAnswer[]
}

export type InterviewCredential = {
  version: 1
  sessionId: string
  resumeToken: string
}

export type CandidateCompletionResult = {
  completed: boolean
  assessmentStatus?: 'available' | 'unavailable'
}

export type StoredInterviewResult =
  | { kind: 'ready'; credential: InterviewCredential }
  | { kind: 'missing' }
  | { kind: 'corrupt' }
  | { kind: 'unavailable' }

type SessionStorageHost = {
  readonly sessionStorage: Storage
}

type RandomSource = Pick<Crypto, 'getRandomValues'>

let interviewHandoff: CandidateInterviewSession | null = null

export function getBrowserSessionStorage(
  host?: SessionStorageHost,
): Storage | null {
  try {
    return (host ?? window).sessionStorage
  } catch {
    return null
  }
}

export function createResumeToken(
  randomSource: RandomSource = globalThis.crypto,
): string {
  const bytes = new Uint8Array(32)
  randomSource.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function prepareInterviewCredential(
  storage: Storage,
  key: string,
  sessionId: string,
  randomSource: RandomSource = globalThis.crypto,
): InterviewCredential | null {
  const existing = readInterviewCredential(storage, key, sessionId)
  if (existing.kind === 'ready') return existing.credential
  if (existing.kind === 'unavailable') return null

  try {
    const credential: InterviewCredential = {
      version: 1,
      sessionId,
      resumeToken: createResumeToken(randomSource),
    }
    return writeInterviewCredential(storage, key, credential) ? credential : null
  } catch {
    return null
  }
}

export function isPermanentResumeFailure(reason: unknown): boolean {
  const status = typeof reason === 'object'
    && reason !== null
    && 'status' in reason
    && typeof reason.status === 'number'
    ? reason.status
    : undefined

  if (status === undefined || status === 0 || status >= 500) return false
  if ([408, 425, 429].includes(status)) return false
  return status >= 400 && status < 500
}

export function setInterviewHandoff(interview: CandidateInterviewSession): void {
  interviewHandoff = interview
}

export function takeInterviewHandoff(sessionId: string): CandidateInterviewSession | null {
  if (interviewHandoff?.sessionId !== sessionId) return null
  const interview = interviewHandoff
  interviewHandoff = null
  return interview
}

export function nextInterviewStep(interview: CandidateInterviewSession) {
  const index = interview.questions.findIndex((question) => {
    const answer = interview.answers.find((item) => item.questionId === question.id)
    return !answer || answer.followUpPending || (answer.followUpPrompt && !answer.followUpAnswer)
  })
  if (index < 0) return { index: 0, phase: 'primary' as const, draft: '', ready: true }
  const answer = interview.answers.find((item) => item.questionId === interview.questions[index]!.id)
  const followUp = Boolean(answer?.followUpPrompt && !answer.followUpAnswer)
  return {
    index,
    phase: followUp ? 'follow_up' as const : 'primary' as const,
    draft: followUp ? '' : answer?.answer ?? '',
    ready: false,
  }
}

export function hasDurableInterviewReport(result: CandidateCompletionResult): boolean {
  return result.completed
}

export function readInterviewCredential(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
  expectedSessionId: string,
): StoredInterviewResult {
  try {
    const raw = storage.getItem(key)
    if (!raw) return { kind: 'missing' }
    const parsed: unknown = JSON.parse(raw)
    if (!isInterviewCredential(parsed) || parsed.sessionId !== expectedSessionId) {
      safelyRemoveInterviewCredential(storage, key)
      return { kind: 'corrupt' }
    }
    return { kind: 'ready', credential: parsed }
  } catch (error) {
    if (error instanceof SyntaxError) {
      safelyRemoveInterviewCredential(storage, key)
      return { kind: 'corrupt' }
    }
    return { kind: 'unavailable' }
  }
}

export function writeInterviewCredential(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  credential: InterviewCredential,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(credential))
    return true
  } catch {
    return false
  }
}

export function safelyRemoveInterviewCredential(
  storage: Pick<Storage, 'removeItem'>,
  key: string,
): void {
  try {
    storage.removeItem(key)
  } catch {
    // The server remains authoritative when browser storage is disabled.
  }
}

function isInterviewCredential(value: unknown): value is InterviewCredential {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
    return candidate.version === 1
    && typeof candidate.sessionId === 'string'
    && candidate.sessionId.length > 0
    && typeof candidate.resumeToken === 'string'
    && candidate.resumeToken.length >= 32
    && candidate.resumeToken.length <= 200
    && /^[A-Za-z0-9_-]+$/.test(candidate.resumeToken)
}
