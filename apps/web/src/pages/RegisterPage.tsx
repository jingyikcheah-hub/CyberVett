import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, GraduationCap, ShieldCheck } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import type { AccountMode } from '@cybervett/contracts'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { ApiClientError } from '../lib/api'

export function RegisterPage() {
  const { user, register } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [mode, setMode] = useState<AccountMode>('trainer')
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={user.mode === 'trainee' ? '/practice' : '/app'} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const created = await register({ mode, name, organizationName, email, password, acceptTerms: true })
      navigate(created.mode === 'trainee' ? '/practice' : '/app', { replace: true })
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : t('register.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page auth-page-register">
      <div className="auth-panel">
        <div className="auth-top"><Logo /><LanguageSwitcher /><Link to="/" className="text-link"><ArrowLeft size={16} /> {t('common.back')}</Link></div>
        <div className="auth-card register-card">
          <span className="eyebrow">{t('register.eyebrow')}</span>
          <h1>{t('register.title')}</h1>
          <p>{t('register.subtitle')}</p>

          <fieldset className="mode-selector">
            <legend>{t('register.modeLabel')}</legend>
            <button type="button" className={mode === 'trainer' ? 'mode-option selected' : 'mode-option'} onClick={() => setMode('trainer')} aria-pressed={mode === 'trainer'}>
              <Building2 /><span><strong>{t('register.trainer')}</strong><small>{t('register.trainerCopy')}</small></span>
            </button>
            <button type="button" className={mode === 'trainee' ? 'mode-option selected' : 'mode-option'} onClick={() => setMode('trainee')} aria-pressed={mode === 'trainee'}>
              <GraduationCap /><span><strong>{t('register.trainee')}</strong><small>{t('register.traineeCopy')}</small></span>
            </button>
          </fieldset>

          <form onSubmit={(event) => void submit(event)}>
            <label>{t('register.name')}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} required /></label>
            {mode === 'trainer' && <label>{t('register.organization')}<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" minLength={2} required /></label>}
            <label>{t('login.email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>{t('login.password')}<span className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></span><small className="field-help">{t('register.passwordHelp')}</small></label>
            <label className="checkbox-field"><input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required /><span>{t('register.terms')}</span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary button-full" disabled={submitting || !acceptTerms}>{submitting ? t('register.submitting') : <>{t('register.submit')} <ArrowRight size={17} /></>}</button>
          </form>
          <p className="auth-switch">{t('register.hasAccount')} <Link to="/login">{t('register.signIn')}</Link></p>
          <small className="auth-security"><ShieldCheck /> {t('register.security')}</small>
        </div>
      </div>
      <div className="auth-story"><div><span className="eyebrow eyebrow-light">{mode === 'trainer' ? t('register.trainer') : t('register.trainee')}</span><blockquote>{mode === 'trainer' ? t('register.trainerStory') : t('register.traineeStory')}</blockquote><p>{t('register.storySource')}</p></div></div>
    </div>
  )
}
