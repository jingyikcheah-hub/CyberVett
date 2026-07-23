import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '@cybervett/contracts'
import { LocaleProvider } from '../context/LocaleContext'
import { JobsPage } from './JobsPage'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock('../lib/api', () => ({
  api: mocks.api,
  ApiClientError: class ApiClientError extends Error {
    constructor(message: string, public readonly code: string, public readonly status: number) {
      super(message)
    }
  },
}))

const job: Job = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Backend Engineer',
  department: 'Engineering',
  location: 'Hybrid',
  status: 'active',
  durationMinutes: 30,
  questions: [
    { id: 'q1', competency: 'Problem solving', prompt: 'Describe a difficult technical problem.' },
    { id: 'q2', competency: 'Reliability', prompt: 'Describe a production incident you handled.' },
    { id: 'q3', competency: 'Collaboration', prompt: 'Describe a difficult technical decision.' },
  ],
  createdAt: '2026-07-23T00:00:00.000Z',
  candidateCount: 0,
}

describe('JobsPage', () => {
  beforeEach(() => {
    mocks.api.mockReset()
    mocks.api.mockImplementation((path: string) => {
      if (path === '/jobs') return Promise.resolve([job])
      if (path.endsWith('/invitations')) return Promise.resolve({ inviteUrl: 'https://example.test/invite/secret-token' })
      return Promise.reject(new Error(`Unexpected path: ${path}`))
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })

  it('keeps a created invitation selectable when clipboard permission is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderJobsPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Create invitation' }))

    const inviteUrl = await screen.findByLabelText('Candidate invitation link')
    expect(inviteUrl).toHaveValue('https://example.test/invite/secret-token')
    expect(await screen.findByRole('alert')).toHaveTextContent('Automatic copying was blocked')

    fireEvent.click(screen.getByRole('button', { name: 'Try copying again' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(invitationRequestCount()).toBe(1)
  })

  it('keeps a created invitation selectable when the Clipboard API is absent', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    renderJobsPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Create invitation' }))

    expect(await screen.findByLabelText('Candidate invitation link')).toHaveValue('https://example.test/invite/secret-token')
    expect(invitationRequestCount()).toBe(1)
  })

  it('renders a retryable error instead of the valid empty state when jobs fail', async () => {
    mocks.api.mockRejectedValue(new Error('offline'))
    renderJobsPage()

    expect(await screen.findByRole('heading', { name: 'We could not load the roles' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Create your first role' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

function renderJobsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><JobsPage /></MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  )
}

function invitationRequestCount() {
  return mocks.api.mock.calls.filter(([path]) => typeof path === 'string' && path.endsWith('/invitations')).length
}
