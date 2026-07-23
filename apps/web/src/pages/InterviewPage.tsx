import { ArrowRight, Bot, CheckCircle2, Cloud, Mic, ShieldCheck, Volume2 } from 'lucide-react'
import type { Question } from '@cybervett/contracts'
import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { useLocale } from '../context/LocaleContext'
import { candidateApi, ApiClientError } from '../lib/api'

type InterviewAnswer = { questionId: string; answer: string; followUpPrompt: string | null; followUpAnswer: string | null }
type InterviewState = {
  sessionId: string
  accessToken: string
  questions: Question[]
  answers: InterviewAnswer[]
  candidateName: string
}

export function InterviewPage() {
  const { sessionId = '' } = useParams()
  const { t, locale, localeTag } = useLocale()
  const storageKey = `cybervett_interview_${sessionId}`
  const stored = sessionStorage.getItem(storageKey)
  const [interview, setInterview] = useState<InterviewState | null>(() => stored ? JSON.parse(stored) as InterviewState : null)
  const initialIndex = interview ? Math.max(0, interview.questions.findIndex((question) => {
    const answer = interview.answers.find((item) => item.questionId === question.id)
    return !answer || (answer.followUpPrompt && !answer.followUpAnswer)
  })) : 0
  const [index, setIndex] = useState(initialIndex)
  const initialAnswer = interview?.answers.find((item) => item.questionId === interview.questions[initialIndex]?.id)
  const [phase, setPhase] = useState<'primary' | 'follow_up'>(initialAnswer?.followUpPrompt && !initialAnswer.followUpAnswer ? 'follow_up' : 'primary')
  const [draft, setDraft] = useState(initialAnswer?.followUpPrompt && !initialAnswer.followUpAnswer ? '' : initialAnswer?.answer ?? '')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState('')

  if (!interview) return <Navigate to="/" replace />
  if (completed) return <Completion />
  const question = interview.questions[index]
  if (!question) return <Navigate to="/" replace />
  const savedAnswer = interview.answers.find((answer) => answer.questionId === question.id)
  const isLast = index === interview.questions.length - 1

  function persist(next: InterviewState) {
    setInterview(next)
    sessionStorage.setItem(storageKey, JSON.stringify(next))
  }

  async function submitTurn() {
    const currentInterview = interview
    const currentQuestion = question
    if (!currentInterview || !currentQuestion) return
    if (draft.trim().length < 20) { setError(t('interview.min')); return }
    setSaving(true); setError('')
    try {
      if (phase === 'primary') {
        const result = await candidateApi<{ followUpPrompt: string }>(`/public/interviews/${sessionId}/answers`, currentInterview.accessToken, {
          method: 'PUT',
          body: JSON.stringify({ questionId: currentQuestion.id, answer: draft, locale }),
        })
        const nextAnswer: InterviewAnswer = { questionId: currentQuestion.id, answer: draft, followUpPrompt: result.followUpPrompt, followUpAnswer: null }
        const next: InterviewState = { ...currentInterview, answers: [...currentInterview.answers.filter((answer) => answer.questionId !== currentQuestion.id), nextAnswer] }
        persist(next)
        setDraft('')
        setPhase('follow_up')
      } else {
        await candidateApi(`/public/interviews/${sessionId}/follow-up`, currentInterview.accessToken, {
          method: 'PUT',
          body: JSON.stringify({ questionId: currentQuestion.id, answer: draft }),
        })
        const next: InterviewState = { ...currentInterview, answers: currentInterview.answers.map((answer) => answer.questionId === currentQuestion.id ? { ...answer, followUpAnswer: draft } : answer) }
        persist(next)
        if (isLast) {
          await candidateApi(`/public/interviews/${sessionId}/complete`, currentInterview.accessToken, { method: 'POST', body: JSON.stringify({ locale }) })
          sessionStorage.removeItem(storageKey)
          setCompleted(true)
        } else {
          const nextQuestion = currentInterview.questions[index + 1]!
          const nextSaved = next.answers.find((answer) => answer.questionId === nextQuestion.id)
          setIndex((current) => current + 1)
          setPhase(nextSaved?.followUpPrompt && !nextSaved.followUpAnswer ? 'follow_up' : 'primary')
          setDraft(nextSaved?.followUpPrompt && !nextSaved.followUpAnswer ? '' : nextSaved?.answer ?? '')
        }
      }
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : t('interview.saveError'))
    } finally { setSaving(false) }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = localeTag
    window.speechSynthesis.speak(utterance)
  }

  function dictate() {
    const Recognition = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    if (!Recognition) { setError(t('interview.voiceUnavailable')); return }
    const recognition = new Recognition()
    recognition.lang = localeTag
    recognition.interimResults = false
    recognition.onresult = (event) => setDraft((current) => `${current}${current ? ' ' : ''}${event.results[0]?.[0]?.transcript ?? ''}`)
    recognition.onerror = () => setError(t('interview.voiceUnavailable'))
    recognition.start()
  }

  return (
    <div className="interview-page live-candidate-interview">
      <header className="interview-header"><Logo /><div className="interview-save-state"><Cloud size={16} /> {t('interview.autosave')}</div><LanguageSwitcher /></header>
      <main className="live-interview-shell">
        <aside className="live-progress"><span className="live-status"><i /> {t('interview.live')}</span><h2>{interview.candidateName}</h2><p>{t('interview.progress', { current: index + 1, total: interview.questions.length })}</p><div className="progress-track"><i style={{ width: `${((index + 1) / interview.questions.length) * 100}%` }} /></div><ol>{interview.questions.map((item, questionIndex) => <li className={questionIndex === index ? 'current' : questionIndex < index ? 'complete' : ''} key={item.id}><span>{questionIndex < index ? <CheckCircle2 /> : questionIndex + 1}</span>{item.competency}</li>)}</ol><div className="interview-trust"><ShieldCheck /><p><strong>{t('interview.trustTitle')}</strong><span>{t('interview.trustCopy')}</span></p></div></aside>
        <section className="conversation-card">
          <div className="conversation-heading"><span className="ai-avatar"><Bot /></span><div><strong>{t('interview.aiInterviewer')}</strong><small>{t('interview.jobRelated')}</small></div></div>
          <div className="chat-thread"><article className="chat-message assistant"><span>{question.competency}</span><p>{question.prompt}</p>{question.guidance && <small>{question.guidance}</small>}<button className="speak-button" onClick={() => speak(question.prompt)}><Volume2 /> {t('interview.readAloud')}</button></article>{phase === 'follow_up' && <><article className="chat-message candidate"><span>{t('interview.you')}</span><p>{savedAnswer?.answer}</p></article><article className="chat-message assistant follow-up"><span>{t('interview.followUp')}</span><p>{savedAnswer?.followUpPrompt}</p><button className="speak-button" onClick={() => speak(savedAnswer?.followUpPrompt ?? '')}><Volume2 /> {t('interview.readAloud')}</button></article></>}</div>
          <label className="answer-field">{phase === 'primary' ? t('interview.answer') : t('interview.followUpAnswer')}<textarea rows={7} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('interview.placeholder')} aria-describedby="answer-help" /><small id="answer-help">{t('interview.characterCount', { count: draft.trim().length })}</small></label><div className="voice-note"><button type="button" className="button button-secondary" onClick={dictate}><Mic /> {t('interview.dictate')}</button><span>{t('interview.voicePrivacy')}</span></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="conversation-actions"><button className="button button-primary" disabled={saving} onClick={() => void submitTurn()}>{saving ? t('interview.thinking') : phase === 'primary' ? t('interview.answerAndFollowUp') : isLast ? t('interview.submit') : t('interview.next')} <ArrowRight /></button></div>
        </section>
      </main>
    </div>
  )
}

function Completion() {
  const { t } = useLocale()
  return <div className="candidate-page centered-message completion-message"><Logo /><span className="completion-icon"><CheckCircle2 /></span><h1>{t('interview.doneTitle')}</h1><p>{t('interview.doneCopy')}</p><div className="privacy-card"><ShieldCheck /><div><strong>{t('interview.whatNext')}</strong><p>{t('interview.whatNextCopy')}</p></div></div></div>
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onerror: () => void
  start(): void
}
