import { useQuery } from '@tanstack/react-query'
import type { Dashboard } from '@cybervett/contracts'
import { CandidateTable } from './DashboardPage'
import { LoadingState } from '../components/LoadingState'
import { useLocale } from '../context/LocaleContext'
import { api } from '../lib/api'

export function CandidatesPage() {
  const { t } = useLocale()
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') })
  if (dashboard.isPending) return <LoadingState label={t('common.loading')} />
  return <div className="page-stack"><div className="page-heading"><span className="eyebrow">{t('candidates.eyebrow')}</span><h1>{t('candidates.title')}</h1><p>{t('candidates.subtitle')}</p></div><section className="panel"><CandidateTable candidates={dashboard.data?.candidates ?? []} /></section></div>
}
