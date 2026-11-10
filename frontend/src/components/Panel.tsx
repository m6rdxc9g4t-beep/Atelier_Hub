// Panneau d'une app dans la fiche : icône et nom de l'app, compteur, « Lier » et « Ouvrir ».
// Une app arrêtée garde son panneau : icône éteinte (traitement .is-down de la suite), message en rouge, éléments épinglés.

import { ArrowUpRight, Pin, Plus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { appName, type SuiteAppId } from '../lib/suite.ts'
import type { PanelState } from '../lib/types.ts'
import { AppTile } from './AppGlyph.tsx'
import { ExtLink } from './ExtLink.tsx'

export function Panel({
  id,
  app,
  icon,
  title,
  count,
  state = 'ok',
  message,
  url,
  onLink,
  linkLabel,
  className,
  tools,
  children,
}: {
  id: string
  app?: SuiteAppId
  icon?: ReactNode
  title: string
  count?: number
  state?: PanelState
  message?: string | null
  url?: string
  onLink?: () => void
  linkLabel?: string
  className?: string
  tools?: ReactNode
  children: ReactNode
}) {
  const titleId = `${id}-title`
  return (
    <section className={`panel${state === 'down' ? ' is-down' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={titleId}>
      <header className="panel__head">
        {app ? <AppTile id={app} /> : <span className="panel__glyph" aria-hidden="true">{icon}</span>}
        <h2 id={titleId} className="panel__title">
          {title}
        </h2>
        {count !== undefined && count > 0 && <span className="panel__count">{count}</span>}
        <span className="panel__spacer" />
        {tools}
        {onLink && (
          <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={linkLabel ?? `Lier depuis ${title}`} title={linkLabel ?? 'Lier'} onClick={onLink}>
            <Plus />
          </button>
        )}
        {url && app && (
          <ExtLink href={url} className="btn btn--ghost btn--sm panel__open" label={appName(app)} title={`Ouvrir dans ${appName(app)}`}>
            Ouvrir
            <ArrowUpRight aria-hidden />
          </ExtLink>
        )}
      </header>
      {state === 'down' && message && (
        <p className="panel__down" role="status">
          {message}
        </p>
      )}
      {children}
    </section>
  )
}

/** Liste dense de lignes : les `initial` premières, puis « Tout afficher ». */
export function RowList<T>({ items, initial, render, empty }: { items: readonly T[]; initial: number; render: (item: T) => ReactNode; empty?: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return <>{empty}</>
  const shown = expanded ? items : items.slice(0, initial)
  return (
    <>
      <ul className="rows">{shown.map(render)}</ul>
      {items.length > initial && (
        <button type="button" className="rows__more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? 'Réduire' : `Tout afficher (${items.length})`}
        </button>
      )}
    </>
  )
}

/** Une ligne : lien vers l'élément dans son app, et retrait si l'élément est épinglé. */
export function Row({
  href,
  appLabel,
  icon,
  title,
  sub,
  side,
  pinned,
  onUnpin,
}: {
  href: string
  appLabel: string
  icon?: ReactNode
  title: string
  sub?: ReactNode
  side?: ReactNode
  pinned?: boolean
  onUnpin?: () => void
}) {
  return (
    <li className="row">
      <ExtLink href={href} className="row__link" label={`${appLabel} › ${title}`}>
        {icon && <span className="row__icon">{icon}</span>}
        <span className="row__body">
          <span className="row__title">
            {pinned && <Pin className="row__pin" aria-label="Épinglé" />}
            {title}
          </span>
          {sub && <span className="row__sub">{sub}</span>}
        </span>
        {side && <span className="row__side">{side}</span>}
      </ExtLink>
      {onUnpin && (
        <button type="button" className="row__action btn btn--ghost btn--icon btn--sm" aria-label={`Retirer « ${title} » de la fiche`} title="Retirer de la fiche" onClick={onUnpin}>
          <X />
        </button>
      )}
    </li>
  )
}

/** État vide d'un panneau : une phrase, et l'action qui le remplit. */
export function PanelEmpty({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="panel__empty">
      <p>{text}</p>
      {action && (
        <button type="button" className="btn btn--sm" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  )
}
