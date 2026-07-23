import { BriefcaseBusiness, Clock3, Copy, Link2, ListChecks, Plus, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Job } from '@cybervett/contracts'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { PageErrorState } from '../components/PageErrorState'
import { StatusBadge } from '../components/StatusBadge'
import { useLocale } from '../context/LocaleContext'
import { api } from '../lib/api'

type CreatedInvitation = {
  jobId: string
  inviteUrl: string
  copyState: 'ready' | 'copied' | 'failed'
}

export function JobsPage() {
  const { t } = useLocale()
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<Job[]>('/jobs') })
  const invite = useMutation({
    mutationFn: (jobId: string) => api<{ inviteUrl: string }>(`/jobs/${jobId}/invitations`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: (result, jobId) => {
      setCreatedInvitation({ jobId, inviteUrl: result.inviteUrl, copyState: 'ready' })
      void copyInvitation(result.inviteUrl)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => setError(t('jobs.inviteError')),
  })

  if (jobs.isPending) return <LoadingState label={t('common.loading')} />
  if (jobs.isError) {
    return <PageErrorState title={t('jobs.loadError')} copy={t('jobs.loadErrorCopy')} onRetry={() => void jobs.refetch()} />
  }

  async function copyInvitation(inviteUrl: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(inviteUrl)
      setCreatedInvitation((current) => current?.inviteUrl === inviteUrl ? { ...current, copyState: 'copied' } : current)
    } catch {
      setCreatedInvitation((current) => current?.inviteUrl === inviteUrl ? { ...current, copyState: 'failed' } : current)
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading heading-with-action"><div><span className="eyebrow">{t('jobs.eyebrow')}</span><h1>{t('jobs.title')}</h1><p>{t('jobs.subtitle')}</p></div><Link className="button button-primary" to="/app/jobs/new"><Plus size={17} /> {t('jobs.new')}</Link></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {createdInvitation && (
        <section className="panel invitation-result" aria-labelledby="invitation-result-title">
          <div>
            <span className="role-icon"><Link2 /></span>
            <div>
              <h2 id="invitation-result-title">{t('jobs.inviteReadyTitle')}</h2>
              <p>{t('jobs.inviteReadyCopy')}</p>
            </div>
          </div>
          <label htmlFor="created-invitation-url">{t('jobs.inviteUrlLabel')}</label>
          <div className="invitation-url-row">
            <input id="created-invitation-url" readOnly value={createdInvitation.inviteUrl} onFocus={(event) => event.currentTarget.select()} />
            <button className="button button-secondary" type="button" onClick={() => void copyInvitation(createdInvitation.inviteUrl)}>
              <Copy size={17} /> {createdInvitation.copyState === 'copied' ? t('common.copied') : createdInvitation.copyState === 'failed' ? t('jobs.copyRetry') : t('common.copy')}
            </button>
          </div>
          {createdInvitation.copyState === 'failed' && <div className="copy-message copy-message-error" role="alert">{t('jobs.copyFailed')}</div>}
          {createdInvitation.copyState === 'copied' && <div className="copy-message" role="status">{t('common.copied')}</div>}
        </section>
      )}
      {jobs.data?.length ? (
        <div className="job-card-grid">
          {jobs.data.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="job-card-top"><span className="role-icon"><BriefcaseBusiness /></span><StatusBadge status={job.status} /></div>
              <h2>{job.title}</h2><p>{job.department} · {job.location}</p>
              <div className="job-meta"><span><Users /> {t('jobs.candidates', { count: job.candidateCount })}</span><span><ListChecks /> {t('jobs.questions', { count: job.questions.length })}</span><span><Clock3 /> {t('jobs.duration', { count: job.durationMinutes })}</span></div>
              <button className="button button-secondary button-full" disabled={invite.isPending} onClick={() => invite.mutate(job.id)}><Link2 size={17} /> {t('jobs.invite')}</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state panel"><BriefcaseBusiness /><h2>{t('jobs.empty')}</h2><p>{t('jobs.emptyCopy')}</p><Link className="button button-primary" to="/app/jobs/new"><Plus size={17} /> {t('jobs.new')}</Link></div>
      )}
    </div>
  )
}
