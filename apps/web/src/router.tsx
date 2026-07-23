import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoadingState } from './components/LoadingState'
import { useAuth } from './context/AuthContext'
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
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="Restoring your workspace…" />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.mode !== 'trainer') return <Navigate to="/practice" replace />
  return <Outlet />
}

function TraineeRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="Restoring your workspace…" />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.mode !== 'trainee') return <Navigate to="/app" replace />
  return <PracticePage />
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
