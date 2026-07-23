import { ArrowRight, Bot, CheckCircle2, Cloud, Mic, ShieldCheck, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { LoadingState } from '../components/LoadingState'
import { Logo } from '../components/Logo'
import { useLocale } from '../context/LocaleContext'
import { api, candidateApi, ApiClientError } from '../lib/api'
import {
  type CandidateInterviewSession,
  type CandidateCompletionResult,
  type InterviewAnswer,
  getBrowserSessionStorage,
  hasDurableInterviewReport,
  isPermanentResumeFailure,
  nextInterviewStep,
  readInterviewCredential,
  safelyRemoveInterviewCredential,
  takeInterviewHandoff,
  writeInterviewCredential,
} from '../lib/interview-storage'

type InterviewLocationState = {
  storageAvailable?: boolean
}

export function InterviewPage() {
  const { sessionId = '' } = useParams()
  const location = useLocation()
  const { t, locale, localeTag } = useLocale()
  const storageKey = `cybervett_interview_${sessionId}`
  const storage = useMemo(getBrowserSessionStorage, [])
  const routeState = location.state as InterviewLocationState | null
  const routeInterview = useMemo(() => takeInterviewHandoff(sessionId), [sessionId])
  const stored = useMemo(
    () => storage ? readInterviewCredential(storage, storageKey, sessionId) : { kind: 'unavailable' as const },
    [sessionId, storage, storageKey],
  )
  const [interview, setInterview] = useState<CandidateInterviewSession | null>(routeInterview)
  const initialStep = routeInterview ? nextInterviewStep(routeInterview) : null
  const [index, setIndex] = useState(initialStep?.index ?? 0)
  const [phase, setPhase] = useState<'primary' | 'follow_up'>(initialStep?.phase ?? 'primary')
  const [draft, setDraft] = useState(initialStep?.draft ?? '')
  const [readyToComplete, setReadyToComplete] = useState(initialStep?.ready ?? false)
  const [loading, setLoading] = useState(!routeInterview && stored.kind === 'ready')
  const [resumeFailure, setResumeFailure] = useState<'permanent' | 'transient' | null>(null)
  const [resumeAttempt, setResumeAttempt] = useState(0)
  const [storageWarning, setStorageWarning] = useState(routeState?.storageAvailable === false)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [assessmentUnavailable, setAssessmentUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const resumeStarted = useRef<number | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const answerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (
      routeInterview
      || stored.kind !== 'ready'
      || resumeStarted.current === resumeAttempt
    ) return
    resumeStarted.current = resumeAttempt
    setResumeFailure(null)
    setLoading(true)
    void api<CandidateInterviewSession>(`/public/interviews/${sessionId}/resume`, {
      method: 'POST',
      body: JSON.stringify({ resumeToken: stored.credential.resumeToken }),
    }).then((resumed) => {
      const saved = storage
        ? writeInterviewCredential(storage, storageKey, {
            version: 1,
            sessionId: resumed.sessionId,
            resumeToken: resumed.resumeToken,
          })
        : false
      setStorageWarning(!saved)
      setResumeFailure(null)
      activateInterview(resumed)
    }).catch((reason: unknown) => {
      const permanent = isPermanentResumeFailure(reason)
      if (permanent && storage) safelyRemoveInterviewCredential(storage, storageKey)
      setResumeFailure(permanent ? 'permanent' : 'transient')
    }).finally(() => {
      setLoading(false)
    })
  }, [resumeAttempt, routeInterview, sessionId, storage, storageKey, stored])

  useEffect(() => {
    if (interview && !readyToComplete) answerRef.current?.focus()
  }, [index, interview, phase, readyToComplete])

  useEffect(() => () => {
    try { recognitionRef.current?.stop() } catch { /* Already stopped. */ }
  }, [])

  function activateInterview(next: CandidateInterviewSession) {
    const step = nextInterviewStep(next)
    setInterview(next)
    setIndex(step.index)
    setPhase(step.phase)
    setDraft(step.draft)
    setReadyToComplete(step.ready)
  }

  function retryResume() {
    setLoading(true)
    setResumeFailure(null)
    setResumeAttempt((attempt) => attempt + 1)
  }

  if (loading) return <div className="candidate-page"><LoadingState label={t('interview.restoring')} /></div>
  if (!interview) {
    const reason = resumeFailure === 'permanent'
      ? t('interview.resumeExpired')
      : resumeFailure === 'transient'
        ? t('interview.resumeTemporary')
        : stored.kind === 'corrupt'
          ? t('interview.storageCorrupt')
          : stored.kind === 'unavailable'
            ? t('interview.storageUnavailable')
            : t('interview.resumeMissing')
    return <RecoveryState reason={reason} {...(resumeFailure === 'transient' ? { onRetry: retryResume } : {})} />
  }
  if (completed) return <Completion assessmentUnavailable={assessmentUnavailable} />

  const question = interview.questions[index]
  if (readyToComplete || !question) {
    return (
      <div className="candidate-page centered-message">
        <Logo />
        <h1>{t('interview.readyTitle')}</h1>
        <p>{t('interview.readyCopy')}</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary" disabled={saving} onClick={() => void completeInterview(interview)}>
          {saving ? t('interview.submitting') : t('interview.submit')}
        </button>
      </div>
    )
  }

  const savedAnswer = interview.answers.find((answer) => answer.questionId === question.id)
  const isLast = index === interview.questions.length - 1

  async function completeInterview(current: CandidateInterviewSession) {
    setSaving(true)
    setError('')
    try {
      const result = await candidateApi<CandidateCompletionResult>(
        `/public/interviews/${sessionId}/complete`,
        current.accessToken,
        { method: 'POST', body: JSON.stringify({ locale }) },
      )
      if (!hasDurableInterviewReport(result)) {
        setReadyToComplete(true)
        setError(t('interview.processing'))
        return
      }
      if (storage) safelyRemoveInterviewCredential(storage, storageKey)
      setAssessmentUnavailable(result.assessmentStatus === 'unavailable')
      setCompleted(true)
    } catch (reason) {
      setReadyToComplete(true)
      setError(candidateError(reason, t('interview.saveError')))
    } finally {
      setSaving(false)
    }
  }

  async function submitTurn() {
    const currentInterview = interview
    const currentQuestion = question
    if (!currentInterview || !currentQuestion) return
    if (draft.trim().length < 20) { setError(t('interview.min')); return }
    setSaving(true)
    setError('')
    try {
      if (phase === 'primary') {
        const result = await candidateApi<{ followUpPrompt: string }>(
          `/public/interviews/${sessionId}/answers`,
          currentInterview.accessToken,
          {
            method: 'PUT',
            body: JSON.stringify({ questionId: currentQuestion.id, answer: draft, locale }),
          },
        )
        const nextAnswer: InterviewAnswer = {
          questionId: currentQuestion.id,
          answer: draft,
          followUpPrompt: result.followUpPrompt,
          followUpAnswer: null,
          followUpPending: false,
        }
        setInterview({
          ...currentInterview,
          answers: [
            ...currentInterview.answers.filter((answer) => answer.questionId !== currentQuestion.id),
            nextAnswer,
          ],
        })
        setDraft('')
        setPhase('follow_up')
      } else {
        await candidateApi(`/public/interviews/${sessionId}/follow-up`, currentInterview.accessToken, {
          method: 'PUT',
          body: JSON.stringify({ questionId: currentQuestion.id, answer: draft }),
        })
        const next: CandidateInterviewSession = {
          ...currentInterview,
          answers: currentInterview.answers.map((answer) => answer.questionId === currentQuestion.id
            ? { ...answer, followUpAnswer: draft }
            : answer),
        }
        setInterview(next)
        if (isLast) {
          setReadyToComplete(true)
          await completeInterview(next)
        } else {
          const step = nextInterviewStep(next)
          setIndex(step.index)
          setPhase(step.phase)
          setDraft(step.draft)
          setReadyToComplete(step.ready)
        }
      }
    } catch (reason) {
      setError(candidateError(reason, t('interview.saveError')))
    } finally {
      setSaving(false)
    }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setError(t('interview.readUnavailable'))
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = localeTag
    window.speechSynthesis.speak(utterance)
  }

  function toggleDictation() {
    if (listening) {
      try { recognitionRef.current?.stop() } catch { /* Already stopped. */ }
      return
    }
    const policy = document as Document & {
      permissionsPolicy?: { allowsFeature(name: string): boolean }
      featurePolicy?: { allowsFeature(name: string): boolean }
    }
    if ((policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature('microphone') === false) {
      setError(t('interview.voicePolicyBlocked'))
      return
    }
    const Recognition = (window as SpeechWindow).SpeechRecognition
      ?? (window as SpeechWindow).webkitSpeechRecognition
    if (!Recognition) { setError(t('interview.voiceUnavailable')); return }
    try {
      const recognition = new Recognition()
      recognition.lang = localeTag
      recognition.interimResults = false
      recognition.onstart = () => setListening(true)
      recognition.onend = () => setListening(false)
      recognition.onresult = (event) => setDraft((current) => `${current}${current ? ' ' : ''}${event.results[0]?.[0]?.transcript ?? ''}`)
      recognition.onerror = (event) => {
        setListening(false)
        setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? t('interview.voiceDenied')
          : event.error === 'network'
            ? t('interview.voiceNetwork')
            : t('interview.voiceUnavailable'))
      }
      recognitionRef.current = recognition
      recognition.start()
    } catch {
      setListening(false)
      setError(t('interview.voiceUnavailable'))
    }
  }

  return (
    <div className="interview-page live-candidate-interview">
      <header className="interview-header"><Logo /><div className="interview-save-state"><Cloud size={16} /> {t('interview.autosave')}</div><LanguageSwitcher /></header>
      <main className="live-interview-shell">
        <h1 className="sr-only">{t('interview.pageTitle')}</h1>
        <aside className="live-progress"><span className="live-status"><i /> {t('interview.live')}</span><h2>{interview.candidateName}</h2><p>{t('interview.progress', { current: index + 1, total: interview.questions.length })}</p><div className="progress-track"><i style={{ width: `${((index + 1) / interview.questions.length) * 100}%` }} /></div><ol>{interview.questions.map((item, questionIndex) => <li className={questionIndex === index ? 'current' : questionIndex < index ? 'complete' : ''} key={item.id}><span>{questionIndex < index ? <CheckCircle2 /> : questionIndex + 1}</span>{item.competency}</li>)}</ol><div className="interview-trust"><ShieldCheck /><p><strong>{t('interview.trustTitle')}</strong><span>{t('interview.trustCopy')}</span></p></div></aside>
        <section className="conversation-card">
          <div className="conversation-heading"><span className="ai-avatar"><Bot /></span><div><strong>{t('interview.aiInterviewer')}</strong><small>{t('interview.jobRelated')}</small></div></div>
          {storageWarning && <div className="form-error" role="status">{t('interview.storageWarning')}</div>}
          <div className="chat-thread"><article className="chat-message assistant"><span>{question.competency}</span><p>{question.prompt}</p>{question.guidance && <small>{question.guidance}</small>}<button className="speak-button" onClick={() => speak(question.prompt)}><Volume2 /> {t('interview.readAloud')}</button></article>{phase === 'follow_up' && <><article className="chat-message candidate"><span>{t('interview.you')}</span><p>{savedAnswer?.answer}</p></article><article className="chat-message assistant follow-up"><span>{t('interview.followUp')}</span><p>{savedAnswer?.followUpPrompt}</p><button className="speak-button" onClick={() => speak(savedAnswer?.followUpPrompt ?? '')}><Volume2 /> {t('interview.readAloud')}</button></article></>}</div>
          <label className="answer-field">{phase === 'primary' ? t('interview.answer') : t('interview.followUpAnswer')}<textarea ref={answerRef} rows={7} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('interview.placeholder')} aria-describedby="answer-help" /><small id="answer-help">{t('interview.characterCount', { count: draft.trim().length })}</small></label>
          <div className="voice-note"><button type="button" className="button button-secondary" aria-pressed={listening} onClick={toggleDictation}><Mic /> {listening ? t('interview.stopDictation') : t('interview.dictate')}</button><span>{t('interview.voicePrivacyRemote')}</span></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="conversation-actions"><button className="button button-primary" disabled={saving} onClick={() => void submitTurn()}>{saving ? t('interview.thinking') : phase === 'primary' ? t('interview.answerAndFollowUp') : isLast ? t('interview.submit') : t('interview.next')} <ArrowRight /></button></div>
        </section>
      </main>
    </div>
  )
}

function candidateError(reason: unknown, fallback: string): string {
  return reason instanceof ApiClientError ? reason.message : fallback
}

function RecoveryState({ reason, onRetry }: { reason: string; onRetry?: () => void }) {
  const { t } = useLocale()
  return <div className="candidate-page centered-message"><Logo /><h1>{t('interview.resumeTitle')}</h1><p>{reason}</p><div className="error-actions">{onRetry && <button className="button button-primary" onClick={onRetry}>{t('common.retry')}</button>}<Link className={`button ${onRetry ? 'button-secondary' : 'button-primary'}`} to="/">{t('interview.returnHome')}</Link></div></div>
}

function Completion({ assessmentUnavailable }: { assessmentUnavailable: boolean }) {
  const { t } = useLocale()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return <div className="candidate-page centered-message completion-message"><Logo /><span className="completion-icon"><CheckCircle2 /></span><h1 ref={heading} tabIndex={-1}>{t('interview.doneTitle')}</h1><p>{t('interview.doneCopy')}</p>{assessmentUnavailable && <div className="form-error" role="status">{t('interview.assessmentUnavailable')}</div>}<div className="privacy-card"><ShieldCheck /><div><strong>{t('interview.whatNext')}</strong><p>{t('interview.whatNextCopy')}</p></div></div></div>
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onstart: () => void
  onend: () => void
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onerror: (event: { error: string }) => void
  start(): void
  stop(): void
}

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}
