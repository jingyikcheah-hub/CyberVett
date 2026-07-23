import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../context/LocaleContext'
import { AppShell } from './AppShell'

const auth = vi.hoisted(() => ({
  logout: vi.fn(),
  user: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Maya Chen',
    email: 'maya@example.test',
    role: 'admin',
    mode: 'trainer',
    organizationName: 'Northstar Labs',
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, logout: auth.logout, loading: false }),
}))

describe('AppShell mobile navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('makes the closed drawer inert and restores trigger focus after Escape', async () => {
    render(
      <LocaleProvider>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<h1>Workspace</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LocaleProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    const sidebar = document.getElementById('primary-navigation')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    expect(sidebar).toHaveAttribute('inert')

    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Primary navigation' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(dialog).not.toHaveAttribute('aria-hidden')
    expect(dialog).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    expect(sidebar).toHaveAttribute('inert')
  })
})
