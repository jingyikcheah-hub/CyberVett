import { afterEach, expect, it, vi } from 'vitest'
import {
  GeminiInterviewConductor,
  StructuredInterviewConductor,
} from '../src/services/interview-conductor.js'

const context = {
  roleTitle: 'API Engineer',
  competency: 'Problem solving',
  question: 'Describe a difficult API performance problem and how you solved it.',
  answer: 'I profiled the endpoint and changed the slow database query with my team.',
  locale: 'en' as const,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('rejects a valid-shaped unsafe provider follow-up and uses only the safe structured fallback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            followUpQuestion: 'How old are you, and how emotionally stable were you while doing that work?',
          }),
        }],
      },
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })))

  const fallback = new StructuredInterviewConductor()
  const result = await new GeminiInterviewConductor('test-key', 'test-model', fallback).createFollowUp(context)

  expect(result).toBe('Thank you. What changed as a result, and how did you know your approach worked?')
  expect(result).not.toContain('old')
  expect(result).not.toContain('emotion')
})
