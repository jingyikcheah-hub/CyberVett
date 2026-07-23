import { ArrowLeft, Check, ChevronDown, ChevronUp, CircleAlert, Scale, ShieldCheck, Sparkles } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Report } from '@cybervett/contracts'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { PageErrorState } from '../components/PageErrorState'
import { StatusBadge } from '../components/StatusBadge'
import { useLocale } from '../context/LocaleContext'
import { api } from '../lib/api'

type DecisionMessage = { kind: 'success' | 'error'; text: string } | null

export function ReportPage() {
  const { reportId = '' } = useParams()
  const { t, localeTag } = useLocale()
  const queryClient = useQueryClient()
  const report = useQuery({ queryKey: ['report', reportId], queryFn: () => api<Report>(`/reports/${reportId}`) })
  const [note, setNote] = useState('')
  const [expandedAnswer, setExpandedAnswer] = useState<number | null>(0)
  const [decisionMessage, setDecisionMessage] = useState<DecisionMessage>(null)
  const decision = useMutation({
    mutationFn: (value: 'review' | 'shortlisted' | 'declined') => api<Report>(`/reports/${reportId}/decision`, { method: 'PATCH', body: JSON.stringify({ decision: value, note: note || undefined }) }),
    onMutate: () => setDecisionMessage(null),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['report', reportId], updated)
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setDecisionMessage({ kind: 'success', text: t('report.saved') })
    },
    onError: () => setDecisionMessage({ kind: 'error', text: t('report.decisionError') }),
  })

  if (report.isPending) return <LoadingState label={t('common.loading')} />
  if (report.isError) return <ReportLoadError error={report.error} retry={() => void report.refetch()} />

  const data = report.data
  const assessmentUnavailable = data.assessmentStatus === 'unavailable' || data.overallScore === null || data.recommendation === null
  const recommendationLabel = data.recommendation === 'strong_evidence'
    ? t('report.recommendationStrong')
    : data.recommendation === 'mixed_evidence'
      ? t('report.recommendationMixed')
      : t('report.recommendationLimited')
  const completedDate = new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))

  return (
    <div className="report-page page-stack">
      <Link className="text-link" to="/app/candidates"><ArrowLeft size={16} /> {t('report.back')}</Link>
      <div className="page-heading heading-with-action"><div><span className="eyebrow">{t('report.eyebrow')}</span><h1>{t('report.title')}</h1><p>{t('report.completedOn', { date: completedDate })}</p></div><StatusBadge status={data.candidate.status} /></div>
      <section className="report-hero panel">
        <div className="report-candidate"><span className="avatar avatar-large">{data.candidate.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><h2>{data.candidate.name}</h2><p>{data.candidate.email}</p><span>{data.candidate.jobTitle}</span></div></div>
        {assessmentUnavailable ? (
          <span className="assessment-status assessment-status-unavailable"><CircleAlert /> {t('report.unavailableBadge')}</span>
        ) : (
          <div className="report-score"><div className="score-ring" style={{ '--score': data.overallScore } as React.CSSProperties}><strong>{data.overallScore}</strong><small>/ 100</small></div><div><span>{t('report.score')}</span><strong>{recommendationLabel}</strong><small><Scale /> {t('report.advisory')}</small></div></div>
        )}
      </section>
      {assessmentUnavailable && (
        <section className="panel assessment-unavailable" role="status" aria-labelledby="assessment-unavailable-title">
          <CircleAlert />
          <div>
            <span className="eyebrow">{t('report.unavailableBadge')}</span>
            <h2 id="assessment-unavailable-title">{t('report.unavailableTitle')}</h2>
            <p>{t('report.unavailableCopy')}</p>
          </div>
        </section>
      )}
      <div className="report-grid">
        <div className="report-main page-stack">
          {!assessmentUnavailable && (
            <>
              <section className="panel report-section"><div className="report-section-title"><Sparkles /><div><h2>{t('report.summary')}</h2><p>{data.generatedBy}</p></div></div><p className="report-summary">{data.summary}</p><div className="ai-boundary"><ShieldCheck /><span><strong>{t('report.humanRequired')}</strong>{t('report.humanRequiredCopy')}</span></div></section>
              <section className="panel report-section"><div className="report-section-title"><Scale /><div><h2>{t('report.competencies')}</h2><p>{t('report.evidenceSupport')}</p></div></div><div className="dimension-list">{data.dimensions.map((dimension) => <article key={dimension.name}><div className="dimension-heading"><strong>{dimension.name}</strong><span>{dimension.score} / 100</span></div><div className="dimension-bar"><i style={{ width: `${dimension.score}%` }} /></div><ul>{dimension.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></article>)}</div></section>
              <section className="two-panel-grid"><div className="panel report-section"><div className="report-section-title positive"><Check /><h2>{t('report.strengths')}</h2></div><ul className="insight-list">{data.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul></div><div className="panel report-section"><div className="report-section-title warning"><CircleAlert /><h2>{t('report.development')}</h2></div><ul className="insight-list">{data.developmentAreas.map((area) => <li key={area}>{area}</li>)}</ul></div></section>
            </>
          )}
          <section className="panel report-section"><div className="report-section-title"><div><h2>{t('report.answers')}</h2><p>{t('report.answersCopy')}</p></div></div><div className="answer-accordion">{data.answers.map((answer, index) => {
            const panelId = `report-answer-${index}`
            return <article key={`${answer.competency}-${index}`}><button onClick={() => setExpandedAnswer(expandedAnswer === index ? null : index)} aria-expanded={expandedAnswer === index} aria-controls={panelId}><span><small>{answer.competency}</small><strong>{answer.question}</strong></span>{expandedAnswer === index ? <ChevronUp /> : <ChevronDown />}</button>{expandedAnswer === index && <div id={panelId}><p>{answer.answer}</p></div>}</article>
          })}</div></section>
        </div>
        <aside className="decision-card panel"><span className="eyebrow">{t('report.decision')}</span><h2>{t('report.decision')}</h2><p>{t('report.decisionCopy')}</p><label>{t('report.note')}<textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('report.notePlaceholder')} /></label><div className="decision-actions"><button className="button button-secondary" onClick={() => decision.mutate('review')} disabled={decision.isPending}>{t('report.keepReview')}</button><button className="button button-success" onClick={() => decision.mutate('shortlisted')} disabled={decision.isPending}>{t('report.shortlist')}</button><button className="button button-quiet danger-text" onClick={() => decision.mutate('declined')} disabled={decision.isPending}>{t('report.decline')}</button></div>{decisionMessage && <div className={`decision-message ${decisionMessage.kind === 'error' ? 'decision-message-error' : ''}`} role={decisionMessage.kind === 'error' ? 'alert' : 'status'}>{decisionMessage.text}</div>}<small><ShieldCheck /> {t('report.auditCopy')}</small></aside>
      </div>
    </div>
  )
}

export function ReportLoadError({ error, retry }: { error: unknown; retry(): void }) {
  const { t } = useLocale()
  let title = t('report.loadError')
  let copy = t('report.loadErrorCopy')
  const status = getErrorStatus(error)

  if (status === 404) {
    title = t('report.notFound')
    copy = t('report.notFoundCopy')
  } else if (status === 401) {
    title = t('report.unauthorizedTitle')
    copy = t('report.unauthorizedCopy')
  } else if (status === 403) {
    title = t('report.forbiddenTitle')
    copy = t('report.forbiddenCopy')
  }

  return <PageErrorState title={title} copy={copy} onRetry={retry} actions={<Link className="button button-secondary" to="/app/candidates">{t('report.back')}</Link>} />
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') return error.status
  return undefined
}
