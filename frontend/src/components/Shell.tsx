// Coquille (charte v2 « Linear ») : marque « Atelier Hub » et « À propos », sélecteur de la suite, liste des fiches,
// « Exemples de la suite » et choix du thème (préférence commune à la suite) au pied, barre haute.

import { BookOpen, Check, LayoutGrid, Menu, Monitor, Moon, Plus, Sun } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { href, onLinkClick, projectPath } from '../lib/router.ts'
import { checkHealth, CURRENT_APP, PORTAL_URL, SUITE_APPS, type SuiteAppId } from '../lib/suite.ts'
import { useTheme, type ThemePreference } from '../lib/theme.ts'
import type { HubProject } from '../lib/types.ts'
import { AppGlyph } from './AppGlyph.tsx'
import { useDismiss } from './ui.tsx'

const ABOUT_ID = 'atelier-about'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={`atelier-brand side-brand${compact ? ' side-brand--compact' : ''}`}
      aria-haspopup="dialog"
      title="À propos d’Atelier Hub"
      onClick={() => document.querySelector<HTMLDialogElement>(`#${ABOUT_ID}`)?.showModal()}
    >
      <span className={`atelier-brand__tile${compact ? ' atelier-brand__tile--sm' : ''}`} aria-hidden="true">
        <AppGlyph id="hub" />
      </span>
      <span className="atelier-brand__name">
        <span className="atelier-brand__prefix">Atelier </span>Hub
      </span>
    </button>
  )
}

export function AboutDialog() {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <dialog
      ref={dialog}
      id={ABOUT_ID}
      className="atelier-about"
      aria-labelledby="about-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="atelier-about__panel">
        <button type="button" className="atelier-about__close" aria-label="Fermer" onClick={() => dialog.current?.close()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <span className="atelier-about__icon atelier-brand__tile" aria-hidden="true">
          <AppGlyph id="hub" />
        </span>
        <h2 id="about-title" className="atelier-about__name">
          <span className="atelier-brand__prefix">Atelier </span>Hub
        </h2>
        <p className="atelier-about__tagline">
          Une fiche par projet : l’avancement dans Projets, la documentation du Wiki, les tables, rapports, conversions, sources et agents
          qui le concernent, à un clic de chaque app.
        </p>
        <p className="atelier-about__suite">Suite Atelier · hébergé chez toi</p>
      </div>
    </dialog>
  )
}

type Health = 'up' | 'down' | 'checking'
const HEALTH_TEXT: Record<Health, string> = { up: 'En marche', down: 'Arrêtée', checking: 'Vérification…' }

export function SuiteSwitcher() {
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<Partial<Record<SuiteAppId, Health>>>({})
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const close = useCallback((restore: boolean) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }, [])
  useDismiss(open, close, root)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    for (const app of SUITE_APPS) {
      if (app.id === CURRENT_APP || !app.healthUrl) continue
      setHealth((h) => ({ ...h, [app.id]: 'checking' }))
      void checkHealth(app.healthUrl).then((ok) => {
        if (!cancelled) setHealth((h) => ({ ...h, [app.id]: ok ? 'up' : 'down' }))
      })
    }
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => {
      cancelled = true
    }
  }, [open])

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }
    if (e.key in moves) {
      e.preventDefault()
      items[(moves[e.key]! + items.length) % items.length]?.focus()
    } else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="pop-anchor" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label="Suite Atelier : changer d’application"
        title="Suite Atelier"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <LayoutGrid />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Suite Atelier" className="popover suite-menu" onKeyDown={onMenuKey}>
          <div className="menu-heading">Suite Atelier</div>
          {SUITE_APPS.map((app) => {
            const current = app.id === CURRENT_APP
            const state: Health = current ? 'up' : (health[app.id] ?? 'checking')
            return (
              <a
                key={app.id}
                role="menuitem"
                className="menu-item suite-menu__item"
                href={current ? href('/') : app.url}
                target={current ? undefined : '_blank'}
                rel={current ? undefined : 'noreferrer'}
                aria-current={current ? 'page' : undefined}
                onClick={(e) => {
                  if (current) {
                    e.preventDefault()
                    close(true)
                  } else close(false)
                }}
              >
                <span className="atelier-brand__tile atelier-brand__tile--sm" data-atelier-app={app.id} aria-hidden="true">
                  <AppGlyph id={app.id} />
                </span>
                <span className="menu-item__body">
                  <span className="atelier-brand__name atelier-brand__name--sm">
                    <span className="atelier-brand__prefix">Atelier </span>
                    {app.short}
                  </span>
                  <span className="menu-item__sub">{app.description}</span>
                </span>
                {current ? (
                  <Check className="suite-menu__check" aria-label="Application ouverte" />
                ) : (
                  <span className="state" data-s={state} aria-label={HEALTH_TEXT[state]} title={HEALTH_TEXT[state]}>
                    {state === 'checking' ? '' : HEALTH_TEXT[state]}
                  </span>
                )}
              </a>
            )
          })}
          {PORTAL_URL && (
            <>
              <div className="menu-sep" />
              <a role="menuitem" className="menu-item" href={PORTAL_URL}>
                <LayoutGrid aria-hidden />
                <span className="menu-item__body">Portail de la suite</span>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const THEMES: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'Système', icon: <Monitor aria-hidden /> },
  { value: 'light', label: 'Clair', icon: <Sun aria-hidden /> },
  { value: 'dark', label: 'Sombre', icon: <Moon aria-hidden /> },
]

export function ThemeSwitch() {
  const [preference, setPreference] = useTheme()
  return (
    <div className="segmented segmented--icons" role="group" aria-label="Thème">
      {THEMES.map((t) => (
        <button key={t.value} type="button" aria-pressed={t.value === preference} aria-label={`Thème : ${t.label}`} title={t.label} onClick={() => setPreference(t.value)}>
          {t.icon}
        </button>
      ))}
    </div>
  )
}

export function Sidebar({
  projects,
  currentSlug,
  loading,
  onNewProject,
  onExamples,
  onNavigate,
}: {
  projects: HubProject[]
  currentSlug: string | null
  loading: boolean
  onNewProject: () => void
  /** Ouvre « Exemples de la suite » (histoires fictives à suivre d'une app à l'autre). */
  onExamples: () => void
  onNavigate: () => void
}) {
  return (
    <aside className="sidebar" aria-label="Fiches projet">
      <div className="side-head">
        <Brand />
        <div className="topbar__spacer" />
        <SuiteSwitcher />
      </div>
      <div className="side-section">
        <span className="side-section__title">Fiches projet</span>
        <span className="side-section__count">{projects.length > 0 ? projects.length : ''}</span>
        <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Nouvelle fiche projet" title="Nouvelle fiche projet" onClick={onNewProject}>
          <Plus />
        </button>
      </div>
      <nav className="sidebar__scroll side-nav" aria-label="Fiches">
        {loading && projects.length === 0 && (
          <>
            <div className="skeleton" />
            <div className="skeleton skeleton--short" />
          </>
        )}
        {projects.map((p) => {
          const to = projectPath(p.slug)
          return (
            <a
              key={p.id}
              className="nav-link"
              href={href(to)}
              aria-current={p.slug === currentSlug ? 'page' : undefined}
              onClick={(e) => {
                onLinkClick(e, to)
                onNavigate()
              }}
            >
              <span className="nav-link__mark" aria-hidden="true">
                {p.name.slice(0, 1)}
              </span>
              <span className="nav-link__text">{p.name}</span>
            </a>
          )
        })}
        {!loading && projects.length === 0 && <p className="side-note">Aucune fiche pour l’instant.</p>}
      </nav>
      <div className="sidebar__tools">
        <button type="button" className="nav-link nav-link--quiet" aria-haspopup="dialog" onClick={onExamples}>
          <BookOpen aria-hidden />
          <span className="nav-link__text">Exemples de la suite</span>
        </button>
      </div>
      <div className="sidebar__foot">
        <ThemeSwitch />
      </div>
    </aside>
  )
}

export function Topbar({ title, onToggleNav, navOpen, children }: { title: string; onToggleNav: () => void; navOpen: boolean; children?: ReactNode }) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn--ghost btn--icon topbar__mobile"
        aria-label={navOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={navOpen}
        onClick={onToggleNav}
      >
        <Menu />
      </button>
      <span className="topbar__mobile">
        <Brand compact />
      </span>
      <p className="topbar__title">{title}</p>
      <div className="topbar__spacer" />
      {children}
    </header>
  )
}
