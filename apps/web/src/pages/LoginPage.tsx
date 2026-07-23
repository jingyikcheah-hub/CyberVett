import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { ApiClientError } from '../lib/api'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLocale()

  if (user) return <Navigate to="/app" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const authenticatedUser = await login(email, password)
      const destination = (location.state as { from?: string } | null)?.from ?? (authenticatedUser.mode === 'trainee' ? '/practice' : '/app')
      navigate(destination, { replace: true })
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : 'Sign in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-top"><Logo /><LanguageSwitcher /><Link to="/" className="text-link"><ArrowLeft size={16} /> {t('common.back')}</Link></div>
        <div className="auth-card">
          <span className="eyebrow">{t('login.eyebrow')}</span>
          <h1>{t('login.title')}</h1>
          <p>{t('login.subtitle')}</p>
          <form onSubmit={(event) => void submit(event)}>
            <label>{t('login.email')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>{t('login.password')}<span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary button-full" disabled={submitting}>{submitting ? t('login.submitting') : <>{t('login.submit')} <ArrowRight size={17} /></>}</button>
          </form>
          <p className="auth-switch">{t('login.noAccount')} <Link to="/register">{t('login.createAccount')}</Link></p>
          <div className="demo-credentials"><strong><CheckCircle2 /> {t('login.demoTitle')}</strong><span>{t('login.demoCopy')}</span><button type="button" className="text-button" onClick={() => { setEmail('maya@northstarlabs.test'); setPassword('Demo123!') }}>{t('login.useDemo')}</button></div>
          <small className="auth-security"><ShieldCheck /> {t('login.security')}</small>
        </div>
      </div>
      <div className="auth-story"><div><span className="eyebrow eyebrow-light">{t('login.storyEyebrow')}</span><blockquote>{t('login.storyQuote')}</blockquote><p>{t('login.storySource')}</p></div></div>
    </div>
  )
}
