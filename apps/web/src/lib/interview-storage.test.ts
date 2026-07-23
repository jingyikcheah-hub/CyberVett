import { describe, expect, it, vi } from 'vitest'
import {
  createResumeToken,
  getBrowserSessionStorage,
  hasDurableInterviewReport,
  isPermanentResumeFailure,
  nextInterviewStep,
  prepareInterviewCredential,
  readInterviewCredential,
  safelyRemoveInterviewCredential,
  setInterviewHandoff,
  takeInterviewHandoff,
  writeInterviewCredential,
} from './interview-storage'

describe('interview credential storage', () => {
  it('safely acquires browser storage when the sessionStorage getter is blocked', () => {
    const available = {} as Storage
    expect(getBrowserSessionStorage({ sessionStorage: available })).toBe(available)

    const blocked = Object.defineProperty({}, 'sessionStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    expect(getBrowserSessionStorage(blocked as { readonly sessionStorage: Storage })).toBeNull()
  })

  it('creates and persists one stable 256-bit resume token before a start request', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    } as unknown as Storage
    const randomSource = {
      getRandomValues<T extends Exclude<BufferSource, ArrayBuffer>>(array: T): T {
        const bytes = array as unknown as Uint8Array
        bytes.forEach((_value, index) => { bytes[index] = index })
        return array
      },
    }

    const first = prepareInterviewCredential(storage, 'key', 'session-1', randomSource)
    const second = prepareInterviewCredential(storage, 'key', 'session-1', {
      getRandomValues<T extends Exclude<BufferSource, ArrayBuffer>>(_array: T): T {
        throw new Error('A persisted credential must be reused')
      },
    })

    expect(first).not.toBeNull()
    expect(first?.resumeToken).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toEqual(first)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('does not produce a start credential when durable persistence fails', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new DOMException('full', 'QuotaExceededError') }),
      removeItem: vi.fn(),
    } as unknown as Storage

    expect(prepareInterviewCredential(storage, 'key', 'session-1', crypto)).toBeNull()
  })

  it('classifies authorization failures as permanent and retryable failures as transient', () => {
    expect(isPermanentResumeFailure({ status: 401 })).toBe(true)
    expect(isPermanentResumeFailure({ status: 403 })).toBe(true)
    expect(isPermanentResumeFailure({ status: 0 })).toBe(false)
    expect(isPermanentResumeFailure({ status: 503 })).toBe(false)
    expect(isPermanentResumeFailure({ status: 408 })).toBe(false)
    expect(isPermanentResumeFailure(new Error('offline'))).toBe(false)
  })

  it('uses 32 bytes from the supplied cryptographic random source', () => {
    const getRandomValues = vi.fn((array: Uint8Array) => array)
    expect(createResumeToken({
      getRandomValues: getRandomValues as Crypto['getRandomValues'],
    })).toHaveLength(64)
    expect(getRandomValues).toHaveBeenCalledOnce()
    expect((getRandomValues.mock.calls[0]?.[0] as Uint8Array).byteLength).toBe(32)
  })

  it('accepts only a versioned credential for the expected session', () => {
    const resumeToken = 'resume-token-capability-0000000000000001'
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ version: 1, sessionId: 'session-1', resumeToken })),
      removeItem: vi.fn(),
    }
    expect(readInterviewCredential(storage, 'key', 'session-1')).toEqual({
      kind: 'ready',
      credential: { version: 1, sessionId: 'session-1', resumeToken },
    })
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong shape', JSON.stringify({ accessToken: 'secret', answers: [] })],
    ['wrong session', JSON.stringify({
      version: 1,
      sessionId: 'other',
      resumeToken: 'resume-token-capability-0000000000000001',
    })],
  ])('clears %s without throwing', (_label, value) => {
    const storage = { getItem: vi.fn(() => value), removeItem: vi.fn() }
    expect(readInterviewCredential(storage, 'key', 'session-1')).toEqual({ kind: 'corrupt' })
    expect(storage.removeItem).toHaveBeenCalledWith('key')
  })

  it('reports disabled storage and never throws on writes or cleanup', () => {
    const unavailable = {
      getItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError') }),
      removeItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError') }),
    }
    expect(readInterviewCredential(unavailable, 'key', 'session-1')).toEqual({ kind: 'unavailable' })
    expect(() => safelyRemoveInterviewCredential(unavailable, 'key')).not.toThrow()
    expect(writeInterviewCredential({
      setItem: vi.fn(() => { throw new DOMException('full', 'QuotaExceededError') }),
    }, 'key', { version: 1, sessionId: 'session-1', resumeToken: 'resume-token' })).toBe(false)
  })

  it('hands the full interview to the matching route in memory exactly once', () => {
    const interview = {
      sessionId: 'session-1',
      accessToken: 'access-token',
      resumeToken: 'resume-token',
      candidateName: 'Candidate',
      questions: [],
      answers: [],
    }
    setInterviewHandoff(interview)
    expect(takeInterviewHandoff('other-session')).toBeNull()
    expect(takeInterviewHandoff('session-1')).toBe(interview)
    expect(takeInterviewHandoff('session-1')).toBeNull()
  })

  it('returns an interrupted pending follow-up to the saved primary answer', () => {
    const interview = {
      sessionId: 'session-1',
      accessToken: 'access-token',
      resumeToken: 'resume-token',
      candidateName: 'Candidate',
      questions: [{ id: 'q1', competency: 'Reliability', prompt: 'Describe a recovery you tested.' }],
      answers: [{
        questionId: 'q1',
        answer: 'I tested the restore path and recorded the measured recovery time.',
        followUpPrompt: null,
        followUpAnswer: null,
        followUpPending: true,
      }],
    }

    expect(nextInterviewStep(interview)).toEqual({
      index: 0,
      phase: 'primary',
      draft: interview.answers[0]!.answer,
      ready: false,
    })
  })

  it('preserves resume access until completion has a durable report', () => {
    expect(hasDurableInterviewReport({ completed: false })).toBe(false)
    expect(hasDurableInterviewReport({ completed: true, assessmentStatus: 'unavailable' })).toBe(true)
  })
})
