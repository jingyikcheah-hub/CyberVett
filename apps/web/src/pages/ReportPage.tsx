import { ArrowLeft, Check, ChevronDown, ChevronUp, CircleAlert, Scale, ShieldCheck, Sparkles } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Report } from '@cybervett/contracts'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { StatusBadge } from '../components/StatusBadge'
import { useLocale } from '../context/LocaleContext'
import { api, ApiClientError } from '../lib/api'

export function ReportPage() {
  const { reportId = '' } = useParams()
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const report = useQuery({ queryKey: ['report', reportId], queryFn: () => api<Report>(`/reports/${reportId}`) })
  const [note, setNote] = useState('')
  const [expandedAnswer, setExpandedAnswer] = useState<number | null>(0)
  const [message, setMessage] = useState('')
  const decision = useMutation({
    mutationFn: (value: 'review' | 'shortlisted' | 'declined') => api<Report>(`/reports/${reportId}/decision`, { method: 'PATCH', body: JSON.stringify({ decision: value, note: note || undefined }) }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['report', reportId], updated)
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setMessage(t('report.saved'))
    },
    onError: (reason) => setMessage(reason instanceof ApiClientError ? reason.message : 'The decision could not be saved.'),
  })
  if (report.isPending) return <LoadingState label={t('common.loading')} />
  if (!report.data) return <div className="error-state"><h2>{t('report.notFound')}</h2><Link className="button button-primary" to="/app/candidates">{t('report.back')}</Link></div>
  const data = report.data
  const recommendationLabel = data.recommendation === 'strong_evidence' ? 'Strong evidence' : data.recommendation === 'mixed_evidence' ? 'Mixed evidence' : 'Limited evidence'

  return (
    <div className="report-page page-stack">
      <Link className="text-link" to="/app/candidates"><ArrowLeft size={16} /> {t('report.back')}</Link>
      <div className="page-heading heading-with-action"><div><span className="eyebrow">{t('report.eyebrow')}</span><h1>{t('report.title')}</h1><p>Completed {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))}</p></div><StatusBadge status={data.candidate.status} /></div>
      <section className="report-hero panel"><div className="report-candidate"><span className="avatar avatar-large">{data.candidate.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><h2>{data.candidate.name}</h2><p>{data.candidate.email}</p><span>{data.candidate.jobTitle}</span></div></div><div className="report-score"><div className="score-ring" style={{ '--score': data.overallScore } as React.CSSProperties}><strong>{data.overallScore}</strong><small>/ 100</small></div><div><span>{t('report.score')}</span><strong>{recommendationLabel}</strong><small><Scale /> {t('report.advisory')}</small></div></div></section>
      <div className="report-grid">
        <div className="report-main page-stack">
          <section className="panel report-section"><div className="report-section-title"><Sparkles /><div><h2>{t('report.summary')}</h2><p>{data.generatedBy}</p></div></div><p className="report-summary">{data.summary}</p><div className="ai-boundary"><ShieldCheck /><span><strong>{t('report.humanRequired')}</strong>{t('report.humanRequiredCopy')}</span></div></section>
          <section className="panel report-section"><div className="report-section-title"><Scale /><div><h2>{t('report.competencies')}</h2><p>{t('report.evidenceSupport')}</p></div></div><div className="dimension-list">{data.dimensions.map((dimension) => <article key={dimension.name}><div className="dimension-heading"><strong>{dimension.name}</strong><span>{dimension.score} / 100</span></div><div className="dimension-bar"><i style={{ width: `${dimension.score}%` }} /></div><ul>{dimension.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></article>)}</div></section>
          <section className="two-panel-grid"><div className="panel report-section"><div className="report-section-title positive"><Check /><h2>{t('report.strengths')}</h2></div><ul className="insight-list">{data.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul></div><div className="panel report-section"><div className="report-section-title warning"><CircleAlert /><h2>{t('report.development')}</h2></div><ul className="insight-list">{data.developmentAreas.map((area) => <li key={area}>{area}</li>)}</ul></div></section>
          <section className="panel report-section"><div className="report-section-title"><div><h2>{t('report.answers')}</h2><p>{t('report.answersCopy')}</p></div></div><div className="answer-accordion">{data.answers.map((answer, index) => <article key={`${answer.competency}-${index}`}><button onClick={() => setExpandedAnswer(expandedAnswer === index ? null : index)} aria-expanded={expandedAnswer === index}><span><small>{answer.competency}</small><strong>{answer.question}</strong></span>{expandedAnswer === index ? <ChevronUp /> : <ChevronDown />}</button>{expandedAnswer === index && <div><p>{answer.answer}</p></div>}</article>)}</div></section>
        </div>
        <aside className="decision-card panel"><span className="eyebrow">{t('report.decision')}</span><h2>{t('report.decision')}</h2><p>{t('report.decisionCopy')}</p><label>{t('report.note')}<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('report.notePlaceholder')} /></label><div className="decision-actions"><button className="button button-secondary" onClick={() => decision.mutate('review')} disabled={decision.isPending}>{t('report.keepReview')}</button><button className="button button-success" onClick={() => decision.mutate('shortlisted')} disabled={decision.isPending}>{t('report.shortlist')}</button><button className="button button-quiet danger-text" onClick={() => decision.mutate('declined')} disabled={decision.isPending}>{t('report.decline')}</button></div>{message && <div className="decision-message" role="status">{message}</div>}<small><ShieldCheck /> {t('report.auditCopy')}</small></aside>
      </div>
    </div>
  )
}
