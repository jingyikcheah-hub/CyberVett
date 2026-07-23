import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { LocaleProvider } from './context/LocaleContext'
import { router } from './router'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><RouterProvider router={router} /></AuthProvider>
      </QueryClientProvider>
    </LocaleProvider>
  </StrictMode>,
)
