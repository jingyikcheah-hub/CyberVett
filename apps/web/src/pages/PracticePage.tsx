import { ArrowRight, Bot, CheckCircle2, GraduationCap, LogOut, Mic, ShieldCheck, Sparkles, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useLocale, type Locale } from '../context/LocaleContext'
import { api, ApiClientError } from '../lib/api'

type PracticeQuestion = { questionId: string; competency: string; question: string }
type PracticeTurn = PracticeQuestion & { answer: string; followUpPrompt: string | null; followUpAnswer: string | null }
type PracticeFeedback = {
  overallScore: number
  summary: string
  strengths: string[]
  developmentAreas: string[]
  dimensions: Array<{ name: string; score: number; evidence: string[] }>
}

type PracticeRole = { title: string; questions: PracticeQuestion[] }

const practiceRoles: Record<Locale, Record<string, PracticeRole>> = {
  en: {
    intern: { title: 'Software Engineering Intern', questions: [
      { questionId: 'intern-1', competency: 'Problem solving', question: 'Tell me about a technical problem you solved. How did you decide what to try first?' },
      { questionId: 'intern-2', competency: 'Learning', question: 'Describe a time you had to learn a new tool or concept quickly. What did you do?' },
      { questionId: 'intern-3', competency: 'Collaboration', question: 'Tell me about a team project and one contribution you are proud of.' },
    ] },
    frontend: { title: 'Frontend Engineer', questions: [
      { questionId: 'frontend-1', competency: 'Web fundamentals', question: 'How would you investigate and improve a page that becomes slow with a large list?' },
      { questionId: 'frontend-2', competency: 'User experience', question: 'Describe how you turn a design into an accessible, responsive interface.' },
      { questionId: 'frontend-3', competency: 'Quality', question: 'How do you decide what to test before releasing a frontend change?' },
    ] },
    backend: { title: 'Backend Engineer', questions: [
      { questionId: 'backend-1', competency: 'API design', question: 'How would you design an API operation that is safe to retry?' },
      { questionId: 'backend-2', competency: 'Reliability', question: 'How would you investigate an intermittent production failure?' },
      { questionId: 'backend-3', competency: 'Data integrity', question: 'Tell me how you would protect data consistency across multiple updates.' },
    ] },
    data: { title: 'Data Analyst', questions: [
      { questionId: 'data-1', competency: 'Analysis', question: 'How do you turn an unclear business question into an analysis plan?' },
      { questionId: 'data-2', competency: 'Data quality', question: 'Describe how you check whether a dataset is trustworthy before using it.' },
      { questionId: 'data-3', competency: 'Communication', question: 'How would you explain a surprising result to a non-technical stakeholder?' },
    ] },
  },
  ms: {
    intern: { title: 'Pelatih Kejuruteraan Perisian', questions: [
      { questionId: 'intern-1', competency: 'Penyelesaian masalah', question: 'Ceritakan masalah teknikal yang pernah anda selesaikan. Bagaimanakah anda menentukan langkah pertama?' },
      { questionId: 'intern-2', competency: 'Pembelajaran', question: 'Huraikan situasi apabila anda perlu mempelajari alat atau konsep baharu dengan cepat. Apakah yang anda lakukan?' },
      { questionId: 'intern-3', competency: 'Kerjasama', question: 'Ceritakan satu projek berkumpulan dan satu sumbangan yang anda banggakan.' },
    ] },
    frontend: { title: 'Jurutera Frontend', questions: [
      { questionId: 'frontend-1', competency: 'Asas web', question: 'Bagaimanakah anda menyiasat dan menambah baik halaman yang menjadi perlahan apabila memaparkan senarai besar?' },
      { questionId: 'frontend-2', competency: 'Pengalaman pengguna', question: 'Huraikan cara anda menukar reka bentuk kepada antara muka yang mudah dicapai dan responsif.' },
      { questionId: 'frontend-3', competency: 'Kualiti', question: 'Bagaimanakah anda menentukan perkara yang perlu diuji sebelum perubahan frontend dilancarkan?' },
    ] },
    backend: { title: 'Jurutera Backend', questions: [
      { questionId: 'backend-1', competency: 'Reka bentuk API', question: 'Bagaimanakah anda mereka bentuk operasi API yang selamat untuk dicuba semula?' },
      { questionId: 'backend-2', competency: 'Kebolehpercayaan', question: 'Bagaimanakah anda menyiasat kegagalan production yang berlaku sekali-sekala?' },
      { questionId: 'backend-3', competency: 'Integriti data', question: 'Terangkan cara anda melindungi konsistensi data merentas beberapa kemas kini.' },
    ] },
    data: { title: 'Penganalisis Data', questions: [
      { questionId: 'data-1', competency: 'Analisis', question: 'Bagaimanakah anda menukar soalan perniagaan yang tidak jelas kepada pelan analisis?' },
      { questionId: 'data-2', competency: 'Kualiti data', question: 'Huraikan cara anda memastikan sesuatu set data boleh dipercayai sebelum digunakan.' },
      { questionId: 'data-3', competency: 'Komunikasi', question: 'Bagaimanakah anda menerangkan hasil yang mengejutkan kepada pihak berkepentingan bukan teknikal?' },
    ] },
  },
  'zh-CN': {
    intern: { title: '软件工程实习生', questions: [
      { questionId: 'intern-1', competency: '问题解决', question: '请讲述一个您解决过的技术问题。您如何决定先尝试什么？' },
      { questionId: 'intern-2', competency: '学习能力', question: '请描述一次您必须快速学习新工具或概念的经历。您是怎么做的？' },
      { questionId: 'intern-3', competency: '团队协作', question: '请介绍一个团队项目，以及您最自豪的一项贡献。' },
    ] },
    frontend: { title: '前端工程师', questions: [
      { questionId: 'frontend-1', competency: 'Web 基础', question: '如果页面因显示大型列表而变慢，您会如何调查并改善？' },
      { questionId: 'frontend-2', competency: '用户体验', question: '请说明您如何将设计转化为无障碍且响应式的界面。' },
      { questionId: 'frontend-3', competency: '质量保障', question: '发布前端更改前，您如何决定需要测试哪些内容？' },
    ] },
    backend: { title: '后端工程师', questions: [
      { questionId: 'backend-1', competency: 'API 设计', question: '您会如何设计一个可安全重试的 API 操作？' },
      { questionId: 'backend-2', competency: '可靠性', question: '您会如何调查间歇性出现的生产环境故障？' },
      { questionId: 'backend-3', competency: '数据完整性', question: '请说明您如何在多项更新中保护数据一致性。' },
    ] },
    data: { title: '数据分析师', questions: [
      { questionId: 'data-1', competency: '分析能力', question: '您如何将不明确的业务问题转化为分析计划？' },
      { questionId: 'data-2', competency: '数据质量', question: '使用数据集之前，您如何检查它是否值得信赖？' },
      { questionId: 'data-3', competency: '沟通能力', question: '您会如何向非技术利益相关者解释一个出乎意料的结果？' },
    ] },
  },
}

export function PracticePage() {
  const { user, logout } = useAuth()
  const { t, locale, localeTag } = useLocale()
  const [roleKey, setRoleKey] = useState('intern')
  const role = useMemo(() => practiceRoles[locale][roleKey] ?? practiceRoles[locale].intern!, [locale, roleKey])
  const roleTitle = role.title
  const questions = role.questions
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [turns, setTurns] = useState<PracticeTurn[]>([])
  const [phase, setPhase] = useState<'primary' | 'follow_up'>('primary')
  const [draft, setDraft] = useState('')
  const [followUpPrompt, setFollowUpPrompt] = useState('')
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const answerRef = useRef<HTMLTextAreaElement>(null)
  const question = questions[index]

  useEffect(() => {
    if (started && !feedback) answerRef.current?.focus()
  }, [feedback, index, phase, started])

  useEffect(() => () => {
    try { recognitionRef.current?.stop() } catch { /* Already stopped. */ }
  }, [])

  async function submitTurn() {
    if (!question || draft.trim().length < 20) { setError(t('interview.min')); return }
    setBusy(true); setError('')
    try {
      if (phase === 'primary') {
        const response = await api<{ followUpPrompt: string }>('/practice/follow-up', {
          method: 'POST',
          body: JSON.stringify({ roleTitle, competency: question.competency, question: question.question, answer: draft, locale }),
        })
        setTurns((current) => [...current, { ...question, answer: draft, followUpPrompt: response.followUpPrompt, followUpAnswer: null }])
        setFollowUpPrompt(response.followUpPrompt)
        setDraft('')
        setPhase('follow_up')
      } else {
        const completedTurns = turns.map((turn) => turn.questionId === question.questionId ? { ...turn, followUpAnswer: draft } : turn)
        setTurns(completedTurns)
        if (index === questions.length - 1) {
          const result = await api<PracticeFeedback>('/practice/evaluate', {
            method: 'POST',
            body: JSON.stringify({ roleTitle, turns: completedTurns, locale }),
          })
          setFeedback(result)
        } else {
          setIndex((current) => current + 1)
          setPhase('primary')
          setFollowUpPrompt('')
          setDraft('')
        }
      }
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : t('practice.error'))
    } finally { setBusy(false) }
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

  function dictate() {
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
    if (!Recognition) { setError(t('practice.voiceUnavailable')); return }
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
            : t('practice.voiceUnavailable'))
      }
      recognitionRef.current = recognition
      recognition.start()
    } catch {
      setListening(false)
      setError(t('practice.voiceUnavailable'))
    }
  }

  function restart() {
    setStarted(false); setIndex(0); setTurns([]); setPhase('primary'); setDraft(''); setFollowUpPrompt(''); setFeedback(null); setError('')
  }

  return (
    <div className="practice-page">
      <header className="practice-header"><Logo /><nav><LanguageSwitcher /><span className="mode-chip"><GraduationCap /> {t('practice.mode')}</span><button className="icon-text-button" onClick={() => void logout()}><LogOut /> {t('common.signOut')}</button></nav></header>
      {!started ? (
        <main className="practice-welcome">
          <section><span className="eyebrow"><Sparkles /> {t('practice.eyebrow')}</span><h1>{t('practice.title', { name: user?.name.split(' ')[0] ?? '' })}</h1><p>{t('practice.subtitle')}</p>
            <div className="practice-explainer"><div><Bot /><strong>{t('practice.step1')}</strong><span>{t('practice.step1Copy')}</span></div><div><Mic /><strong>{t('practice.step2')}</strong><span>{t('practice.step2Copy')}</span></div><div><CheckCircle2 /><strong>{t('practice.step3')}</strong><span>{t('practice.step3Copy')}</span></div></div>
          </section>
          <section className="practice-setup-card"><h2>{t('practice.chooseRole')}</h2><p>{t('practice.chooseRoleCopy')}</p><label>{t('practice.roleLabel')}<select value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>{Object.entries(practiceRoles[locale]).map(([key, option]) => <option value={key} key={key}>{option.title}</option>)}</select></label><div className="privacy-inline"><ShieldCheck /><span>{t('practice.private')}</span></div><button className="button button-primary button-full button-large" onClick={() => setStarted(true)}>{t('practice.start')} <ArrowRight /></button></section>
        </main>
      ) : feedback ? (
        <main className="practice-feedback"><span className="eyebrow">{t('practice.feedbackEyebrow')}</span><h1>{t('practice.feedbackTitle')}</h1><div className="feedback-score"><strong>{feedback.overallScore}</strong><span>/100<br />{t('practice.evidenceScore')}</span></div><p className="feedback-summary">{feedback.summary}</p><div className="feedback-grid"><section><h2>{t('practice.strengths')}</h2><ul>{feedback.strengths.length ? feedback.strengths.map((item) => <li key={item}>{item}</li>) : <li>{t('practice.noStrengths')}</li>}</ul></section><section><h2>{t('practice.improve')}</h2><ul>{feedback.developmentAreas.length ? feedback.developmentAreas.map((item) => <li key={item}>{item}</li>) : <li>{t('practice.keepPractising')}</li>}</ul></section></div><p className="advisory-note"><ShieldCheck /> {t('practice.advisory')}</p><button className="button button-primary" onClick={restart}>{t('practice.again')}</button></main>
      ) : (
        <main className="live-interview-shell">
          <h1 className="sr-only">{t('practice.interviewer')} — {roleTitle}</h1>
          <aside className="live-progress"><span className="live-status"><i /> {t('practice.live')}</span><h2>{roleTitle}</h2><p>{t('interview.progress', { current: index + 1, total: questions.length })}</p><div className="progress-track"><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><ol>{questions.map((item, itemIndex) => <li key={item.questionId} className={itemIndex === index ? 'current' : itemIndex < index ? 'complete' : ''}><span>{itemIndex < index ? <CheckCircle2 /> : itemIndex + 1}</span>{item.competency}</li>)}</ol><div className="interview-trust"><ShieldCheck /><p><strong>{t('interview.trustTitle')}</strong><span>{t('interview.trustCopy')}</span></p></div></aside>
          <section className="conversation-card">
            <div className="conversation-heading"><span className="ai-avatar"><Bot /></span><div><strong>{t('practice.interviewer')}</strong><small>{t('practice.jobRelated')}</small></div></div>
            <div className="chat-thread"><article className="chat-message assistant"><span>{question?.competency}</span><p>{question?.question}</p><button className="speak-button" onClick={() => speak(question?.question ?? '')}><Volume2 /> {t('practice.readAloud')}</button></article>{phase === 'follow_up' && <><article className="chat-message candidate"><span>{t('practice.you')}</span><p>{turns.find((turn) => turn.questionId === question?.questionId)?.answer}</p></article><article className="chat-message assistant follow-up"><span>{t('practice.followUp')}</span><p>{followUpPrompt}</p><button className="speak-button" onClick={() => speak(followUpPrompt)}><Volume2 /> {t('practice.readAloud')}</button></article></>}</div>
            <label className="answer-field">{phase === 'primary' ? t('interview.answer') : t('practice.followUpAnswer')}<textarea ref={answerRef} rows={7} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('interview.placeholder')} /><small>{t('interview.characterCount', { count: draft.trim().length })}</small></label><div className="voice-note"><button type="button" className="button button-secondary" aria-pressed={listening} onClick={dictate}><Mic /> {listening ? t('interview.stopDictation') : t('practice.dictate')}</button><span>{t('interview.voicePrivacyRemote')}</span></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="conversation-actions"><button className="button button-primary" disabled={busy} onClick={() => void submitTurn()}>{busy ? t('practice.thinking') : phase === 'primary' ? t('practice.answer') : index === questions.length - 1 ? t('practice.finish') : t('practice.continue')} <ArrowRight /></button></div>
          </section>
        </main>
      )}
    </div>
  )
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
