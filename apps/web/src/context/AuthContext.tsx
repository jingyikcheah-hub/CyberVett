import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RegistrationInput, User } from '@cybervett/contracts'
import { api, ApiClientError, setCsrfToken } from '../lib/api'

type AuthResponse = { user: User; csrfToken: string }
type AuthContextValue = {
  user: User | null
  loading: boolean
  unavailable: boolean
  retrySession(): Promise<void>
  login(email: string, password: string): Promise<User>
  register(input: RegistrationInput): Promise<User>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const restoreSession = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api<AuthResponse>('/auth/session')
      setUser(response.user)
      setCsrfToken(response.csrfToken)
      setUnavailable(false)
    } catch (reason) {
      if (reason instanceof ApiClientError && [401, 403].includes(reason.status)) {
        setUser(null)
        setCsrfToken(null)
        setUnavailable(false)
      } else {
        setUnavailable(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    unavailable,
    retrySession: restoreSession,
    async login(email, password) {
      const response = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setUser(response.user)
      setCsrfToken(response.csrfToken)
      setUnavailable(false)
      return response.user
    },
    async register(input) {
      const response = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setUser(response.user)
      setCsrfToken(response.csrfToken)
      setUnavailable(false)
      return response.user
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setCsrfToken(null)
    },
  }), [loading, restoreSession, unavailable, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
