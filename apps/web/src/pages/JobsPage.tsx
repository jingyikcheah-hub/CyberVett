import { BriefcaseBusiness, Clock3, Copy, Link2, ListChecks, Plus, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Job } from '@cybervett/contracts'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { StatusBadge } from '../components/StatusBadge'
import { useLocale } from '../context/LocaleContext'
import { api, ApiClientError } from '../lib/api'

export function JobsPage() {
  const { t } = useLocale()
  const [copiedJob, setCopiedJob] = useState<string | null>(null)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<Job[]>('/jobs') })
  const invite = useMutation({
    mutationFn: (jobId: string) => api<{ inviteUrl: string }>(`/jobs/${jobId}/invitations`, { method: 'POST' }),
    onSuccess: async (result, jobId) => {
      await navigator.clipboard.writeText(result.inviteUrl)
      setCopiedJob(jobId)
      setTimeout(() => setCopiedJob(null), 2500)
      await queryClient.invalidateQueries({ queryKey: ['jobs'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (reason) => setError(reason instanceof ApiClientError ? reason.message : 'Could not create an invitation.'),
  })

  if (jobs.isPending) return <LoadingState label={t('common.loading')} />

  return (
    <div className="page-stack">
      <div className="page-heading heading-with-action"><div><span className="eyebrow">{t('jobs.eyebrow')}</span><h1>{t('jobs.title')}</h1><p>{t('jobs.subtitle')}</p></div><Link className="button button-primary" to="/app/jobs/new"><Plus size={17} /> {t('jobs.new')}</Link></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {jobs.data?.length ? (
        <div className="job-card-grid">
          {jobs.data.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="job-card-top"><span className="role-icon"><BriefcaseBusiness /></span><StatusBadge status={job.status} /></div>
              <h2>{job.title}</h2><p>{job.department} · {job.location}</p>
              <div className="job-meta"><span><Users /> {t('jobs.candidates', { count: job.candidateCount })}</span><span><ListChecks /> {t('jobs.questions', { count: job.questions.length })}</span><span><Clock3 /> {t('jobs.duration', { count: job.durationMinutes })}</span></div>
              <button className="button button-secondary button-full" disabled={invite.isPending} onClick={() => invite.mutate(job.id)}>{copiedJob === job.id ? <><Copy size={17} /> {t('common.copied')}</> : <><Link2 size={17} /> {t('jobs.invite')}</>}</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state panel"><BriefcaseBusiness /><h2>{t('jobs.empty')}</h2><p>{t('jobs.emptyCopy')}</p><Link className="button button-primary" to="/app/jobs/new"><Plus size={17} /> {t('jobs.new')}</Link></div>
      )}
    </div>
  )
}
