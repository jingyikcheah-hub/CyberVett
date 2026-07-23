import { ArrowRight, BriefcaseBusiness, CalendarCheck2, ClipboardCheck, Plus, TrendingUp, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { Dashboard } from '@cybervett/contracts'
import { Link } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { PageErrorState } from '../components/PageErrorState'
import { StatusBadge } from '../components/StatusBadge'
import { api } from '../lib/api'
import { useLocale } from '../context/LocaleContext'
import { useAuth } from '../context/AuthContext'

export function DashboardPage() {
  const { t } = useLocale()
  const { user } = useAuth()
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') })
  if (dashboard.isPending) return <LoadingState label={t('dashboard.loading')} />
  if (dashboard.isError) {
    return <PageErrorState title={t('dashboard.loadError')} copy={t('dashboard.loadErrorCopy')} onRetry={() => void dashboard.refetch()} />
  }
  const data = dashboard.data

  return (
    <div className="page-stack">
      <div className="page-heading heading-with-action"><div><span className="eyebrow">{t('dashboard.eyebrow')}</span><h1>{t('dashboard.greeting', { name: user?.name.split(' ')[0] ?? '' })}</h1><p>{t('dashboard.subtitle')}</p></div><Link className="button button-primary" to="/app/jobs/new"><Plus size={17} /> {t('dashboard.createRole')}</Link></div>
      <section className="metric-grid" aria-label={t('dashboard.metricsLabel')}>
        <Metric icon={<BriefcaseBusiness />} label={t('dashboard.activeRoles')} value={data.activeJobs} note={t('dashboard.activeRolesNote')} />
        <Metric icon={<ClipboardCheck />} label={t('dashboard.awaiting')} value={data.awaitingReview} note={t('dashboard.awaitingNote')} accent />
        <Metric icon={<CalendarCheck2 />} label={t('dashboard.completed')} value={data.completedThisWeek} note={t('dashboard.completedNote')} />
        <Metric icon={<TrendingUp />} label={t('dashboard.median')} value={data.medianScore ?? '—'} note={t('dashboard.medianNote')} />
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>{t('dashboard.recent')}</h2><p>{t('dashboard.recentCopy')}</p></div><Link className="text-link" to="/app/candidates">{t('dashboard.viewAll')} <ArrowRight size={16} /></Link></div>
        <CandidateTable candidates={data.candidates.slice(0, 5)} />
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>{t('dashboard.activeRoles')}</h2><p>{t('dashboard.rolesCopy')}</p></div><Link className="text-link" to="/app/jobs">{t('dashboard.manageRoles')} <ArrowRight size={16} /></Link></div>
        <div className="role-list">
          {data.jobs.map((job) => <div className="role-row" key={job.id}><div className="role-icon"><Users /></div><div><strong>{job.title}</strong><span>{job.department} · {job.location}</span></div><StatusBadge status={job.status} /><span>{t('dashboard.candidateCount', { count: job.candidateCount })}</span><Link className="button button-secondary button-small" to="/app/jobs">{t('common.manage')}</Link></div>)}
        </div>
      </section>
    </div>
  )
}

export function CandidateTable({
  candidates,
  onRevoke,
  revokingId,
}: {
  candidates: Dashboard['candidates']
  onRevoke?: (candidate: Dashboard['candidates'][number]) => void
  revokingId?: string | null
}) {
  const { t } = useLocale()
  if (candidates.length === 0) return <div className="empty-state"><Users /><h3>{t('dashboard.emptyCandidates')}</h3><p>{t('dashboard.emptyCandidatesCopy')}</p></div>
  return (
    <div className="table-wrap"><table><thead><tr><th>{t('dashboard.table.candidate')}</th><th>{t('dashboard.table.role')}</th><th>{t('dashboard.table.status')}</th><th>{t('dashboard.table.score')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead><tbody>
      {candidates.map((candidate) => <tr key={candidate.id}><td><div className="candidate-cell"><span className="avatar">{candidate.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{candidate.name}</strong><small>{candidate.email}</small></span></div></td><td>{candidate.jobTitle}</td><td><StatusBadge status={candidate.status} /></td><td>{candidate.score === null ? <span className="muted">{t('common.pending')}</span> : <strong>{candidate.score}<small className="score-max"> / 100</small></strong>}</td><td><div className="table-actions">{candidate.reportId ? <Link className="text-link" to={`/app/reports/${candidate.reportId}`}>{t('common.review')} <ArrowRight size={15} /></Link> : null}{onRevoke && ['invited', 'in_progress'].includes(candidate.status) ? <button className="button button-quiet danger-text button-small" disabled={revokingId === candidate.id} onClick={() => onRevoke(candidate)}>{revokingId === candidate.id ? t('candidates.revoking') : t('candidates.revoke')}</button> : !candidate.reportId ? <span className="muted">—</span> : null}</div></td></tr>)}
    </tbody></table></div>
  )
}

function Metric({ icon, label, value, note, accent = false }: { icon: React.ReactNode; label: string; value: string | number; note: string; accent?: boolean }) {
  return <article className={`metric-card ${accent ? 'metric-accent' : ''}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}
