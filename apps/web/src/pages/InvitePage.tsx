import { BrainCircuit, CheckCircle2, Clock3, FileText, LockKeyhole, ShieldCheck, VideoOff } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { LoadingState } from '../components/LoadingState'
import { Logo } from '../components/Logo'
import { useLocale } from '../context/LocaleContext'
import { api, ApiClientError } from '../lib/api'
import {
  type CandidateInterviewSession,
  getBrowserSessionStorage,
  prepareInterviewCredential,
  readInterviewCredential,
  setInterviewHandoff,
} from '../lib/interview-storage'

type Invitation = {
  sessionId: string
  organizationName: string
  job: { title: string; department: string; location: string; durationMinutes: number; questionCount: number }
  status: string
  expiresAt: string
  privacy: { cameraRequired: boolean; emotionAnalysis: boolean; notice: string }
}

type CandidateStartResponse = Omit<CandidateInterviewSession, 'resumeToken'> & {
  resumeToken?: string
}

type StartAttempt = {
  sessionId: string
  resumeToken: string
}

export function InvitePage() {
  const { token = '' } = useParams()
  const { t } = useLocale()
  const navigate = useNavigate()
  const storage = useMemo(getBrowserSessionStorage, [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const invitation = useQuery({ queryKey: ['invitation', token], queryFn: () => api<Invitation>(`/public/invitations/${token}`), retry: false })
  const resumableSessionId = ['in_progress', 'completed'].includes(invitation.data?.status ?? '')
    && invitation.data?.sessionId
    ? invitation.data.sessionId
    : null
  const resumableCredential = useMemo(() => {
    if (!storage || !resumableSessionId) return null
    const result = readInterviewCredential(
      storage,
      `cybervett_interview_${resumableSessionId}`,
      resumableSessionId,
    )
    return result.kind === 'ready' ? result.credential : null
  }, [resumableSessionId, storage])

  useEffect(() => {
    if (!resumableSessionId || !resumableCredential) return
    navigate(`/interview/${resumableSessionId}`, { replace: true })
  }, [navigate, resumableCredential, resumableSessionId])

  const start = useMutation({
    mutationFn: (attempt: StartAttempt) => api<CandidateStartResponse>(`/public/invitations/${token}/start`, {
      method: 'POST',
      body: JSON.stringify({ name, email, consent, resumeToken: attempt.resumeToken }),
    }),
    onSuccess: (data, attempt) => {
      if (data.sessionId !== attempt.sessionId) {
        setError(t('invite.unavailableCopy'))
        void invitation.refetch()
        return
      }
      setInterviewHandoff({ ...data, resumeToken: attempt.resumeToken })
      navigate(`/interview/${data.sessionId}`, { state: { storageAvailable: true } })
    },
    onError: (reason) => {
      setError(invitationError(reason, t))
      void invitation.refetch()
    },
  })

  if (invitation.isPending) return <div className="candidate-page"><LoadingState label={t('common.loading')} /></div>
  if (invitation.isError || !invitation.data) {
    return <div className="candidate-page centered-message"><Logo /><h1>{t('invite.unavailable')}</h1><p>{invitationError(invitation.error, t)}</p><button className="button button-primary" onClick={() => void invitation.refetch()}>{t('common.retry')}</button></div>
  }
  const data = invitation.data
  if (resumableSessionId && resumableCredential) {
    return <div className="candidate-page"><LoadingState label={t('interview.restoring')} /></div>
  }
  if (data.status === 'completed') {
    return <div className="candidate-page centered-message"><Logo /><h1>{t('invite.processingTitle')}</h1><p>{t('invite.processingCopy')}</p></div>
  }
  if (data.status !== 'invited') {
    return <div className="candidate-page centered-message"><Logo /><h1>{t('invite.alreadyStarted')}</h1><p>{t('invite.alreadyStartedCopy')}</p></div>
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!storage || !data.sessionId) {
      setError(t('invite.storageRequired'))
      return
    }
    const credential = prepareInterviewCredential(
      storage,
      `cybervett_interview_${data.sessionId}`,
      data.sessionId,
    )
    if (!credential) {
      setError(t('invite.storageRequired'))
      return
    }
    start.mutate({
      sessionId: data.sessionId,
      resumeToken: credential.resumeToken,
    })
  }

  return (
    <div className="candidate-page">
      <header className="candidate-header"><Logo /><LanguageSwitcher /></header>
      <main className="invite-shell">
        <section className="invite-intro"><span className="eyebrow"><LockKeyhole size={15} /> {t('invite.secure')}</span><h1>{t('invite.invitedBy', { organization: data.organizationName })}</h1><p className="invite-role">{t('invite.forRole', { role: data.job.title })}</p><div className="invite-company-meta"><span>{data.job.department}</span><i /> <span>{data.job.location}</span></div>
          <div className="expect-card"><h2>{t('invite.about')}</h2><ul><li><FileText /><span>{t('invite.questions', { count: data.job.questionCount })}</span></li><li><Clock3 /><span>{t('invite.duration', { count: data.job.durationMinutes })}</span></li><li><VideoOff /><span>{t('invite.camera')}</span></li><li><BrainCircuit /><span>{t('invite.ai')}</span></li></ul></div>
          <div className="privacy-card"><ShieldCheck /><div><strong>{t('invite.privacyTitle')}</strong><p>{t('invite.privacyCopy')}</p></div></div>
        </section>
        <section className="invite-form-card"><div><span className="step-kicker">{t('invite.before')}</span><h2>{t('invite.confirm')}</h2><p>{t('invite.detailsCopy')}</p></div><form onSubmit={(event) => submit(event)}><label>{t('invite.name')}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} /></label><label>{t('invite.email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label className="checkbox-field"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>{t('invite.consent')}</span></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary button-full button-large" disabled={start.isPending || !consent}>{start.isPending ? t('invite.starting') : <>{t('invite.start')} <CheckCircle2 size={18} /></>}</button></form></section>
      </main>
    </div>
  )
}

function invitationError(
  reason: unknown,
  t: ReturnType<typeof useLocale>['t'],
): string {
  if (!(reason instanceof ApiClientError)) return t('invite.unavailableCopy')
  if (reason.code === 'INVITATION_EXPIRED') return t('invite.expired')
  if (reason.code === 'INVITATION_REVOKED') return t('invite.revoked')
  if (reason.code === 'INVITATION_COMPLETED') return t('invite.completed')
  if (reason.code === 'INVITATION_ALREADY_STARTED') return t('invite.alreadyStartedCopy')
  if (reason.code === 'API_UNAVAILABLE') return t('invite.apiUnavailable')
  return t('invite.unavailableCopy')
}
