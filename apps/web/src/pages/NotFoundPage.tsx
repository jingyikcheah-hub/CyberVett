import { Link } from 'react-router-dom'
import { useLocale } from '../context/LocaleContext'

export function NotFoundPage() {
  const { t } = useLocale()
  return <div className="centered-message"><span className="eyebrow">404</span><h1>{t('notFound.title')}</h1><p>{t('notFound.copy')}</p><Link className="button button-primary" to="/">{t('notFound.home')}</Link></div>
}
