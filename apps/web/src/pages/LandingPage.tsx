import { ArrowRight, BarChart3, Check, FileCheck2, Scale, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useLocale } from '../context/LocaleContext'

export function LandingPage() {
  const { t } = useLocale()
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">{t('landing.nav.how')}</a>
          <a href="#responsible-ai">{t('landing.nav.responsible')}</a>
          <LanguageSwitcher />
          <Link className="button button-secondary" to="/login">{t('landing.nav.signin')}</Link>
          <Link className="button button-primary" to="/register">{t('landing.nav.getStarted')} <ArrowRight size={16} /></Link>
        </nav>
      </header>

      <main>
        <section className="hero section-shell">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={15} /> {t('landing.eyebrow')}</span>
            <h1>{t('landing.title1')}<br /><span>{t('landing.title2')}</span></h1>
            <p className="hero-lead">{t('landing.lead')}</p>
            <div className="hero-actions">
              <Link className="button button-primary button-large" to="/register">{t('landing.getStarted')} <ArrowRight size={18} /></Link>
              <Link className="button button-quiet button-large" to="/invite/demo-invite">{t('landing.candidateDemo')}</Link>
            </div>
            <ul className="hero-checks" aria-label="Product principles">
              <li><Check /> {t('landing.check1')}</li>
              <li><Check /> {t('landing.check2')}</li>
              <li><Check /> {t('landing.check3')}</li>
            </ul>
          </div>
          <div className="hero-product" aria-label="Example CyberVett report">
            <div className="product-window">
              <div className="window-bar"><span /><span /><span /><small>{t('landing.mockReview')}</small></div>
              <div className="mock-report-head">
                <div><span className="mock-avatar">AR</span><div><strong>Aisha Rahman</strong><small>Frontend Engineer</small></div></div>
                <span className="status status-review">{t('landing.mockNeedsReview')}</span>
              </div>
              <div className="mock-score-grid">
                <div className="mock-score"><strong>82</strong><span>{t('landing.mockScore')}</span></div>
                <div className="mock-summary"><span>{t('landing.mockStrong')}</span><p>{t('landing.mockSummary')}</p></div>
              </div>
              <div className="mock-bars">
                {[['Problem solving', 84], ['Web fundamentals', 82], ['Collaboration', 80]].map(([label, score]) => (
                  <div key={label}><span>{label}</span><div><i style={{ width: `${score}%` }} /></div><strong>{score}</strong></div>
                ))}
              </div>
              <div className="human-callout"><ShieldCheck /><span><strong>{t('landing.mockCheckpoint')}</strong>{t('landing.mockCheckpointCopy')}</span></div>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Key benefits">
          <div><strong>{t('landing.proof1Title')}</strong><span>{t('landing.proof1Copy')}</span></div>
          <div><strong>{t('landing.proof2Title')}</strong><span>{t('landing.proof2Copy')}</span></div>
          <div><strong>{t('landing.proof3Title')}</strong><span>{t('landing.proof3Copy')}</span></div>
        </section>

        <section id="how-it-works" className="section-shell content-section">
          <div className="section-heading"><span className="eyebrow">{t('landing.stepsEyebrow')}</span><h2>{t('landing.stepsTitle')}</h2><p>{t('landing.stepsCopy')}</p></div>
          <div className="step-grid">
            {[
              ['01', t('landing.step1Title'), t('landing.step1Copy')],
              ['02', t('landing.step2Title'), t('landing.step2Copy')],
              ['03', t('landing.step3Title'), t('landing.step3Copy')],
              ['04', t('landing.step4Title'), t('landing.step4Copy')],
            ].map(([number, title, copy]) => <article className="step-card" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
        </section>

        <section id="responsible-ai" className="responsible-section">
          <div className="section-shell responsible-grid">
            <div>
              <span className="eyebrow eyebrow-light"><Scale size={16} /> {t('landing.responsibleEyebrow')}</span>
              <h2>{t('landing.responsibleTitle')}</h2>
              <p>{t('landing.responsibleCopy')}</p>
              <Link to="/login" className="text-link">{t('landing.reportLink')} <ArrowRight size={16} /></Link>
            </div>
            <div className="principle-grid">
              <article><FileCheck2 /><h3>{t('landing.principle1Title')}</h3><p>{t('landing.principle1Copy')}</p></article>
              <article><ShieldCheck /><h3>{t('landing.principle2Title')}</h3><p>{t('landing.principle2Copy')}</p></article>
              <article><BarChart3 /><h3>{t('landing.principle3Title')}</h3><p>{t('landing.principle3Copy')}</p></article>
              <article><Scale /><h3>{t('landing.principle4Title')}</h3><p>{t('landing.principle4Copy')}</p></article>
            </div>
          </div>
        </section>
      </main>

      <footer className="marketing-footer section-shell"><Logo /><span>{t('landing.footer')}</span><span>© 2026 CyberVett</span></footer>
    </div>
  )
}
