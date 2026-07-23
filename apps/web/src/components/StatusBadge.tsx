import type { CandidateSummary, Job } from '@cybervett/contracts'
import { useLocale } from '../context/LocaleContext'

const labelKeys = {
  active: 'status.active',
  closed: 'status.closed',
  draft: 'status.draft',
  invited: 'status.invited',
  in_progress: 'status.in_progress',
  completed: 'status.completed',
  review: 'status.review',
  shortlisted: 'status.shortlisted',
  declined: 'status.declined',
  revoked: 'status.revoked',
} as const satisfies Record<CandidateSummary['status'] | Job['status'], string>

export function StatusBadge({ status }: { status: CandidateSummary['status'] | Job['status'] }) {
  const { t } = useLocale()
  return <span className={`status status-${status}`}>{t(labelKeys[status])}</span>
}
