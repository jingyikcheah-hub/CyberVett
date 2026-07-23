import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Dashboard } from '@cybervett/contracts'
import { useState } from 'react'
import { CandidateTable } from './DashboardPage'
import { LoadingState } from '../components/LoadingState'
import { PageErrorState } from '../components/PageErrorState'
import { useLocale } from '../context/LocaleContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export function CandidatesPage() {
  const { t } = useLocale()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') })
  const revoke = useMutation({
    mutationFn: (sessionId: string) => api(`/invitations/${sessionId}`, { method: 'DELETE' }),
    onMutate: () => setMessage(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setMessage({ kind: 'success', text: t('candidates.revoked') })
    },
    onError: () => setMessage({ kind: 'error', text: t('candidates.revokeError') }),
  })
  if (dashboard.isPending) return <LoadingState label={t('common.loading')} />
  if (dashboard.isError) {
    return <PageErrorState title={t('candidates.loadError')} copy={t('candidates.loadErrorCopy')} onRetry={() => void dashboard.refetch()} />
  }
  const canRevoke = Boolean(user && ['admin', 'recruiter'].includes(user.role))
  const revokeCandidate = (candidate: Dashboard['candidates'][number]) => {
    if (window.confirm(t('candidates.revokeConfirm', { name: candidate.name }))) revoke.mutate(candidate.id)
  }
  return <div className="page-stack"><div className="page-heading"><span className="eyebrow">{t('candidates.eyebrow')}</span><h1>{t('candidates.title')}</h1><p>{t('candidates.subtitle')}</p></div>{message && <div className={message.kind === 'error' ? 'form-error' : 'decision-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div>}<section className="panel"><CandidateTable candidates={dashboard.data.candidates} revokingId={revoke.isPending ? revoke.variables : null} {...(canRevoke ? { onRevoke: revokeCandidate } : {})} /></section></div>
}
