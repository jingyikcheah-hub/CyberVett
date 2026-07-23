import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RegistrationInput, User } from '@cybervett/contracts'
import { api, setCsrfToken } from '../lib/api'

type AuthResponse = { user: User; csrfToken: string }
type AuthContextValue = {
  user: User | null
  loading: boolean
  login(email: string, password: string): Promise<User>
  register(input: RegistrationInput): Promise<User>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<AuthResponse>('/auth/session')
      .then((response) => {
        setUser(response.user)
        setCsrfToken(response.csrfToken)
      })
      .catch(() => {
        setUser(null)
        setCsrfToken(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const response = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setUser(response.user)
      setCsrfToken(response.csrfToken)
      return response.user
    },
    async register(input) {
      const response = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setUser(response.user)
      setCsrfToken(response.csrfToken)
      return response.user
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setCsrfToken(null)
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
