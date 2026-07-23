import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../context/LocaleContext'
import { CandidatesPage } from './CandidatesPage'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock('../lib/api', () => ({ api: mocks.api }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}))

describe('CandidatesPage', () => {
  it('renders a retryable error instead of an empty candidate queue when loading fails', async () => {
    mocks.api.mockRejectedValue(new Error('offline'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter><CandidatesPage /></MemoryRouter>
        </QueryClientProvider>
      </LocaleProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'We could not load the candidates' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No candidates yet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
