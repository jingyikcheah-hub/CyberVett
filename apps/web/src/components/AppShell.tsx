import { BriefcaseBusiness, ChevronDown, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 800px)').matches === true)
  const [accountOpen, setAccountOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuCloseRef = useRef<HTMLButtonElement>(null)
  const restoreMenuFocus = useRef(false)
  const { user, logout } = useAuth()
  const { t } = useLocale()

  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(max-width: 800px)')
    const update = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches)
      if (!event.matches) {
        restoreMenuFocus.current = false
        setMenuOpen(false)
      }
    }
    update(query)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (isMobile && menuOpen) {
      menuCloseRef.current?.focus()
    } else if (!menuOpen && restoreMenuFocus.current) {
      restoreMenuFocus.current = false
      menuTriggerRef.current?.focus()
    }
  }, [isMobile, menuOpen])

  useEffect(() => {
    if (!isMobile || !menuOpen) return
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isMobile, menuOpen])

  function openMenu() {
    restoreMenuFocus.current = false
    setMenuOpen(true)
  }

  function closeMenu(restoreFocus = true) {
    restoreMenuFocus.current = restoreFocus
    setMenuOpen(false)
  }

  function containMenuFocus(event: KeyboardEvent<HTMLElement>) {
    if (!isMobile || !menuOpen || event.key !== 'Tab') return
    const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => !element.hasAttribute('inert'))
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">{t('nav.skip')}</a>
      <aside
        id="primary-navigation"
        ref={sidebarRef}
        className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
        aria-label={t('nav.primary')}
        aria-hidden={isMobile && !menuOpen ? true : undefined}
        aria-modal={isMobile && menuOpen ? true : undefined}
        role={isMobile && menuOpen ? 'dialog' : undefined}
        inert={isMobile && !menuOpen ? true : undefined}
        onKeyDown={containMenuFocus}
      >
        <div className="sidebar-brand">
          <Logo />
          <button ref={menuCloseRef} className="icon-button mobile-only" onClick={() => closeMenu()} aria-label={t('nav.close')}><X /></button>
        </div>
        <nav className="nav-list">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} {...(end ? { end: true } : {})} onClick={() => closeMenu(false)}>
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
      {isMobile && menuOpen && <button className="sidebar-scrim" tabIndex={-1} aria-hidden="true" onClick={() => closeMenu()} />}
      <div className="app-main-column" inert={isMobile && menuOpen ? true : undefined}>
        <header className="app-topbar">
          <button ref={menuTriggerRef} className="icon-button mobile-only" onClick={openMenu} aria-label={t('nav.open')} aria-expanded={isMobile ? menuOpen : undefined} aria-controls="primary-navigation"><Menu /></button>
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
