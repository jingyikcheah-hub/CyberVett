import { Languages } from 'lucide-react'
import { useLocale, type Locale } from '../context/LocaleContext'

export function LanguageSwitcher({ inverse = false }: { inverse?: boolean }) {
  const { locale, setLocale, t } = useLocale()
  return (
    <label className={`language-switcher ${inverse ? 'language-inverse' : ''}`}>
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t('common.language')}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('common.language')}>
        <option value="en">{t('language.english')}</option>
        <option value="ms">{t('language.malay')}</option>
        <option value="zh-CN">{t('language.chinese')}</option>
      </select>
    </label>
  )
}
