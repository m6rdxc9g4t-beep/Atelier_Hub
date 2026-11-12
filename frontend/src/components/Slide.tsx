// Une diapositive : le même composant pour la lecture, le plein écran et l'impression. Elle n'invente rien : titre et
// texte rédigés dans le Hub (sinon ceux que le Hub calcule), et la partie vivante (`live`) telle que le backend vient
// de la relire dans les apps — cartes de chiffres, lignes, lien, état. La couleur d'une app ne sort pas de son icône.

import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { longDay, moreText, shownText, shownTitle } from '../lib/deck.ts'
import { shortDate, STATUS_LABELS, STATUS_VARS } from '../lib/format.ts'
import { parseSlideText } from '../lib/slide-text.ts'
import { appName } from '../lib/suite.ts'
import type { DeckSlide, HubProject, SlideRow } from '../lib/types.ts'
import { AppTile } from './AppGlyph.tsx'
import { ExtLink } from './ExtLink.tsx'

/** Paragraphes et listes « - » d'un texte. Ni HTML ni Markdown : le texte est rendu tel quel. */
export function SlideText({ text }: { text: string }) {
  const blocks = parseSlideText(text)
  if (blocks.length === 0) return null
  return (
    <div className="slide-text">
      {blocks.map((block, i) =>
        block.type === 'p' ? (
          <p key={i}>{block.text}</p>
        ) : (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

function Status({ status }: { status: string }) {
  // Couleur officielle du statut (une donnée, pas un décor), toujours doublée de son libellé.
  return (
    <span className="slide-row__status">
      <span className="status-dot" style={{ ['--c' as string]: `var(${STATUS_VARS[status] ?? '--status-open'})` }} aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function Slide({
  slide,
  index,
  count,
  project,
  today,
  onPreview,
}: {
  slide: DeckSlide
  /** Rang de la diapositive, à partir de 0. */
  index: number
  count: number
  project: HubProject
  today: string
  /** Aperçu, dans une fenêtre : reçoit la phrase « ouvrirait … » au lieu de la notification (voir `ExtLink`). */
  onPreview?: (text: string) => void
}) {
  const { live } = slide
  const titleId = `slide-${slide.id}-title`
  const title = shownTitle(slide)
  const app = live.app ? appName(live.app) : null
  const withStatus = live.rows.some((row) => row.status !== null)
  const more = moreText(live.more)

  const rowLabel = (row: SlideRow): ReactNode =>
    row.url ? (
      <ExtLink href={row.url} className="slide-row__link" label={app ? `${app} › ${row.label}` : row.label} onPreview={onPreview}>
        {row.label}
      </ExtLink>
    ) : (
      row.label
    )

  return (
    <section className="slide" aria-roledescription="diapositive" aria-labelledby={titleId} data-kind={slide.kind} data-state={live.state}>
      <div className="slide__inner">
        <header className="slide__head">
          {live.app && <AppTile id={live.app} small={false} />}
          <h2 id={titleId} className="slide__title">
            {title}
          </h2>
        </header>

        <div className="slide__body">
          <SlideText text={shownText(slide)} />

          {live.figures.length > 0 && (
            <div className="slide-kpis" role="list" aria-label="Chiffres">
              {live.figures.map((figure) => (
                <div key={figure.label} className="atelier-kpi" role="listitem">
                  <span className="atelier-kpi__label">{figure.label}</span>
                  <span className="atelier-kpi__value">{figure.value}</span>
                  {figure.note && <span className={`atelier-kpi__note${figure.warn ? ' is-warn' : ''}`}>{figure.note}</span>}
                </div>
              ))}
            </div>
          )}

          {live.message && live.state !== 'ok' && <p className="slide__message">{live.message}</p>}

          {live.rows.length > 0 && (
            <div className="slide-list">
              <ul className="slide-rows" data-status={withStatus ? '' : undefined}>
                {live.rows.map((row) => (
                  <li key={row.id} className="slide-row">
                    {withStatus && (row.status ? <Status status={row.status} /> : <span />)}
                    <span className="slide-row__label">{rowLabel(row)}</span>
                    <span className="slide-row__detail">{row.detail}</span>
                    <span className="slide-row__date">{shortDate(row.date, today)}</span>
                  </li>
                ))}
              </ul>
              {more && <p className="slide-rows__more">{more}</p>}
            </div>
          )}
        </div>

        <footer className="slide__foot">
          {live.url && live.url_label ? (
            <ExtLink href={live.url} className="slide__open" label={app ?? undefined} onPreview={onPreview}>
              {live.url_label}
              <ArrowUpRight aria-hidden />
            </ExtLink>
          ) : (
            slide.kind === 'title' && <span>Chiffres lus le {longDay(today)}</span>
          )}
          {/* Fiche et rang restent ensemble, à droite : sur un écran étroit ils passent d'un bloc sous le lien. */}
          <span className="slide__where">
            <span className="slide__project">{project.name}</span>
            <span className="slide__page">
              <span aria-hidden="true">
                {index + 1} / {count}
              </span>
              <span className="sr-only">
                Diapositive {index + 1} sur {count}
              </span>
            </span>
          </span>
        </footer>
      </div>
    </section>
  )
}
