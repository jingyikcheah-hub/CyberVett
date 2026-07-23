import { ArrowLeft, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateJobInput, Question } from '@cybervett/contracts'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocale } from '../context/LocaleContext'
import { api, ApiClientError } from '../lib/api'

const initialQuestions: Question[] = [
  { id: 'problem-solving', competency: 'Problem solving', prompt: 'Tell us about a difficult technical problem you solved. What options did you consider, and why did you choose your final approach?' },
  { id: 'role-fundamentals', competency: 'Role fundamentals', prompt: 'Describe how you would investigate a production issue that users report as intermittent.' },
  { id: 'collaboration', competency: 'Collaboration', prompt: 'Describe a disagreement about a technical decision. How did you help the team reach a decision?' },
]

export function NewJobPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ title: '', department: '', location: 'Hybrid · Kuala Lumpur', durationMinutes: 30 })
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: (input: CreateJobInput) => api<Job>('/jobs', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['jobs'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/app/jobs')
    },
    onError: (reason) => setError(reason instanceof ApiClientError ? reason.message : 'Could not create the role.'),
  })

  function updateQuestion(index: number, field: 'competency' | 'prompt', value: string) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, [field]: value } : question))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (questions.some((question) => question.competency.trim().length < 2 || question.prompt.trim().length < 10)) {
      setError('Every question needs a competency and a clear prompt.')
      return
    }
    create.mutate({ ...form, questions })
  }

  return (
    <div className="narrow-page page-stack">
      <Link className="text-link" to="/app/jobs"><ArrowLeft size={16} /> {t('common.back')}</Link>
      <div className="page-heading"><span className="eyebrow">{t('jobNew.eyebrow')}</span><h1>{t('jobNew.title')}</h1><p>{t('jobNew.subtitle')}</p></div>
      <form className="page-stack" onSubmit={(event) => submit(event)}>
        <section className="panel form-section"><div className="panel-heading"><div><h2>{t('jobNew.details')}</h2><p>{t('jobNew.detailsCopy')}</p></div></div><div className="form-grid two-columns">
          <label>{t('jobNew.titleLabel')}<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('jobNew.exampleTitle')} required minLength={2} /></label>
          <label>{t('jobNew.department')}<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder={t('jobNew.exampleDepartment')} required minLength={2} /></label>
          <label>{t('jobNew.location')}<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} required minLength={2} /></label>
          <label>{t('jobNew.duration')}<select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}><option value={20}>20 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></label>
        </div></section>
        <section className="panel form-section"><div className="panel-heading"><div><h2>{t('jobNew.questionsTitle')}</h2><p>{t('jobNew.questionsCopy')}</p></div><span className="question-count">{questions.length} / 12</span></div>
          <div className="question-list">{questions.map((question, index) => <div className="question-editor" key={question.id}><span className="question-number">{index + 1}</span><div><label>{t('jobNew.competency')}<input value={question.competency} onChange={(event) => updateQuestion(index, 'competency', event.target.value)} required /></label><label>{t('jobNew.question')}<textarea value={question.prompt} onChange={(event) => updateQuestion(index, 'prompt', event.target.value)} rows={3} required /></label></div><button type="button" className="icon-button danger-button" aria-label={t('jobNew.removeQuestion')} disabled={questions.length <= 3} onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}><Trash2 /></button></div>)}</div>
          <button className="button button-secondary" type="button" disabled={questions.length >= 12} onClick={() => setQuestions((current) => [...current, { id: crypto.randomUUID(), competency: '', prompt: '' }])}><Plus size={17} /> {t('jobNew.addQuestion')}</button>
        </section>
        <div className="responsible-inline"><ShieldCheck /><p><strong>{t('jobNew.responsibleTitle')}</strong><span>{t('jobNew.responsibleCopy')}</span></p></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions"><Link className="button button-secondary" to="/app/jobs">{t('common.cancel')}</Link><button className="button button-primary" disabled={create.isPending}>{create.isPending ? t('jobNew.submitting') : t('jobNew.submit')}</button></div>
      </form>
    </div>
  )
}

type Job = { id: string }
