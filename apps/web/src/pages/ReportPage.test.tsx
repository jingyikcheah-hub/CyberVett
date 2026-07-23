import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../context/LocaleContext'
import { ReportLoadError, ReportPage } from './ReportPage'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock('../lib/api', () => ({ api: mocks.api }))

const availableReport = {
  id: '22222222-2222-4222-8222-222222222222',
  assessmentStatus: 'available',
  candidate: {
    id: '33333333-3333-4333-8333-333333333333',
    reportId: '22222222-2222-4222-8222-222222222222',
    name: 'Aisha Rahman',
    email: 'aisha@example.test',
    jobId: '11111111-1111-4111-8111-111111111111',
    jobTitle: 'Backend Engineer',
    status: 'review',
    score: 82,
    completedAt: '2026-07-23T08:00:00.000Z',
  },
  overallScore: 82,
  recommendation: 'strong_evidence',
  summary: 'The answers contain relevant evidence for a human reviewer.',
  dimensions: [{ name: 'Problem solving', score: 82, evidence: ['A concrete troubleshooting example.'] }],
  strengths: ['Explained the investigation clearly.'],
  developmentAreas: ['Clarify the measured outcome.'],
  answers: [{ competency: 'Problem solving', question: 'How did you investigate the incident?', answer: 'I reviewed the logs and isolated the failing dependency.' }],
  reviewerNote: null,
  generatedBy: 'Gemini test model',
  generatedAt: '2026-07-23T08:00:00.000Z',
} as const

describe('ReportPage', () => {
  beforeEach(() => mocks.api.mockReset())

  it.each([
    [404, 'Report not found'],
    [401, 'Your session has expired'],
    [403, 'You cannot view this report'],
    [500, 'We could not load the report'],
  ])('distinguishes a %s report failure', (status, expectedTitle) => {
    const retry = vi.fn()
    render(
      <LocaleProvider>
        <MemoryRouter>
          <ReportLoadError error={{ message: 'server prose', code: 'FAILURE', status }} retry={retry} />
        </MemoryRouter>
      </LocaleProvider>,
    )

    expect(screen.getByRole('heading', { name: expectedTitle })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders raw evidence and human controls without assessment scores when assessment is unavailable', async () => {
    mocks.api.mockResolvedValue({
      ...availableReport,
      assessmentStatus: 'unavailable',
      overallScore: null,
      recommendation: null,
    })
    renderReport()

    expect(await screen.findByRole('heading', { name: 'AI assessment is unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('Overall evidence score')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Competency evidence' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Question and answer evidence' })).toBeInTheDocument()
    expect(screen.getByText('I reviewed the logs and isolated the failing dependency.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shortlist' })).toBeInTheDocument()
  })

  it('announces a failed decision as an error rather than success', async () => {
    mocks.api.mockImplementation((_path: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') return Promise.reject(new Error('offline'))
      return Promise.resolve(availableReport)
    })
    renderReport()

    fireEvent.click(await screen.findByRole('button', { name: 'Shortlist' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('The decision could not be saved')
    expect(error).toHaveClass('decision-message-error')
    expect(screen.queryByText('Decision saved')).not.toBeInTheDocument()
  })
})

function renderReport() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/app/reports/22222222-2222-4222-8222-222222222222']}>
          <Routes>
            <Route path="/app/reports/:reportId" element={<ReportPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  )
}
