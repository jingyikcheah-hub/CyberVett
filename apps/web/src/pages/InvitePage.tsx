import { BrainCircuit, CheckCircle2, Clock3, FileText, LockKeyhole, ShieldCheck, VideoOff } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Question } from '@cybervett/contracts'
import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { LoadingState } from '../components/LoadingState'
import { Logo } from '../components/Logo'
import { useLocale } from '../context/LocaleContext'
import { api, ApiClientError } from '../lib/api'

type Invitation = {
  organizationName: string
  job: { title: string; department: string; location: string; durationMinutes: number; questionCount: number }
  status: string
  privacy: { cameraRequired: boolean; emotionAnalysis: boolean; notice: string }
}
type StartResponse = { sessionId: string; accessToken: string; questions: Question[]; answers: Array<{ questionId: string; answer: string; followUpPrompt: string | null; followUpAnswer: string | null }> }

export function InvitePage() {
  const { token = '' } = useParams()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const invitation = useQuery({ queryKey: ['invitation', token], queryFn: () => api<Invitation>(`/public/invitations/${token}`), retry: false })
  const start = useMutation({
    mutationFn: () => api<StartResponse>(`/public/invitations/${token}/start`, { method: 'POST', body: JSON.stringify({ name, email, consent }) }),
    onSuccess: (data) => {
      sessionStorage.setItem(`cybervett_interview_${data.sessionId}`, JSON.stringify({ ...data, candidateName: name }))
      navigate(`/interview/${data.sessionId}`)
    },
    onError: (reason) => setError(reason instanceof ApiClientError ? reason.message : 'The interview could not be started.'),
  })

  if (invitation.isPending) return <div className="candidate-page"><LoadingState label={t('common.loading')} /></div>
  if (!invitation.data) return <div className="candidate-page centered-message"><Logo /><h1>{t('invite.unavailable')}</h1><p>{invitation.error instanceof Error ? invitation.error.message : t('invite.unavailableCopy')}</p></div>
  const data = invitation.data

  function submit(event: FormEvent) { event.preventDefault(); setError(''); start.mutate() }

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
