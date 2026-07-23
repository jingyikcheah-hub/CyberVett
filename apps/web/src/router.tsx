import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoadingState } from './components/LoadingState'
import { useAuth } from './context/AuthContext'
import { useLocale } from './context/LocaleContext'
import { CandidatesPage } from './pages/CandidatesPage'
import { DashboardPage } from './pages/DashboardPage'
import { InterviewPage } from './pages/InterviewPage'
import { InvitePage } from './pages/InvitePage'
import { JobsPage } from './pages/JobsPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NewJobPage } from './pages/NewJobPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PracticePage } from './pages/PracticePage'
import { RegisterPage } from './pages/RegisterPage'
import { ReportPage } from './pages/ReportPage'

function TrainerLayout() {
  const { user, loading, unavailable, retrySession } = useAuth()
  const location = useLocation()
  const { t } = useLocale()
  if (loading) return <LoadingState label={t('auth.restoring')} />
  if (unavailable) return <AuthUnavailable retry={() => void retrySession()} />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.mode !== 'trainer') return <Navigate to="/practice" replace />
  return <Outlet />
}

function TraineeRoute() {
  const { user, loading, unavailable, retrySession } = useAuth()
  const location = useLocation()
  const { t } = useLocale()
  if (loading) return <LoadingState label={t('auth.restoring')} />
  if (unavailable) return <AuthUnavailable retry={() => void retrySession()} />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.mode !== 'trainee') return <Navigate to="/app" replace />
  return <PracticePage />
}

function AuthUnavailable({ retry }: { retry(): void }) {
  const { t } = useLocale()
  return <main className="candidate-page centered-message"><h1>{t('auth.unavailable')}</h1><p>{t('auth.unavailableCopy')}</p><button className="button button-primary" onClick={retry}>{t('common.retry')}</button></main>
}

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/practice', element: <TraineeRoute /> },
  { path: '/invite/:token', element: <InvitePage /> },
  { path: '/interview/:sessionId', element: <InterviewPage /> },
  {
    element: <TrainerLayout />,
    children: [{
      path: '/app',
      element: <AppShell />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'jobs', element: <JobsPage /> },
        { path: 'jobs/new', element: <NewJobPage /> },
        { path: 'candidates', element: <CandidatesPage /> },
        { path: 'reports/:reportId', element: <ReportPage /> },
      ],
    }],
  },
  { path: '*', element: <NotFoundPage /> },
])
