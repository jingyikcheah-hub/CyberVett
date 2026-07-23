import { useLocale } from '../context/LocaleContext'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { t } = useLocale()
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label === 'Loading…' ? t('common.loading') : label}</span>
    </div>
  )
}
