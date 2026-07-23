import { BriefcaseBusiness, ChevronDown, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useLocale } from '../context/LocaleContext'

const navigation = [
  { to: '/app', label: 'nav.overview', icon: LayoutDashboard, end: true },
  { to: '/app/jobs', label: 'nav.roles', icon: BriefcaseBusiness, end: false },
  { to: '/app/candidates', label: 'nav.candidates', icon: Users, end: false },
] as const

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const { user, logout } = useAuth()
  const { t } = useLocale()

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">{t('nav.skip')}</a>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label={t('nav.overview')}>
        <div className="sidebar-brand">
          <Logo />
          <button className="icon-button mobile-only" onClick={() => setMenuOpen(false)} aria-label={t('nav.close')}><X /></button>
        </div>
        <nav className="nav-list">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} {...(end ? { end: true } : {})} onClick={() => setMenuOpen(false)}>
              <Icon size={19} aria-hidden="true" />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="trust-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <div><strong>{t('nav.aiAssisted')}</strong><span>{t('nav.humanDecision')}</span></div>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label={t('nav.close')} onClick={() => setMenuOpen(false)} />}
      <div className="app-main-column">
        <header className="app-topbar">
          <button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label={t('nav.open')}><Menu /></button>
          <div className="workspace-name">{user?.organizationName}</div>
          <LanguageSwitcher />
          <div className="account-menu">
            <button className="account-trigger" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>
              <span className="avatar" aria-hidden="true">{user?.name.slice(0, 1)}</span>
              <span className="account-copy"><strong>{user?.name}</strong><small>{user?.role}</small></span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {accountOpen && (
              <div className="account-popover">
                <span>{user?.email}</span>
                <button onClick={() => void logout()}><LogOut size={16} /> {t('common.signOut')}</button>
              </div>
            )}
          </div>
        </header>
        <main id="main-content" className="app-content"><Outlet /></main>
      </div>
    </div>
  )
}
