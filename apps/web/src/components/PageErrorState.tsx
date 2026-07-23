import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocale } from '../context/LocaleContext'

type PageErrorStateProps = {
  title: string
  copy: string
  onRetry?: () => void
  actions?: ReactNode
}

export function PageErrorState({ title, copy, onRetry, actions }: PageErrorStateProps) {
  const { t } = useLocale()
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    containerRef.current?.focus()
  }, [])

  return (
    <div className="error-state" role="alert" tabIndex={-1} ref={containerRef}>
      <h1>{title}</h1>
      <p>{copy}</p>
      {(onRetry || actions) && (
        <div className="error-actions">
          {onRetry && <button className="button button-primary" onClick={onRetry}>{t('common.retry')}</button>}
          {actions}
        </div>
      )}
    </div>
  )
}
