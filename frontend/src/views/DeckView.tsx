// Une présentation de la fiche : le Hub la rend résolue (ce qui est enregistré + les chiffres relus dans les apps).

import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ReadError, ReadMissing } from '../components/ReadState.tsx'
import { useUi } from '../components/ui.tsx'
import { ApiError } from '../lib/api.ts'
import { shownTitle } from '../lib/deck.ts'
import { plural } from '../lib/format.ts'
import { clockTime } from '../lib/freshness.ts'
import { api } from '../lib/hub-api.ts'
import { failureFeedback, refreshFailure } from '../lib/refresh.ts'
import { href, onLinkClick, presentationsPath } from '../lib/router.ts'
import type { Deck, HubProject } from '../lib/types.ts'

type ReadFailure = { missing: boolean; text: string }

export function DeckView({
  project,
  presentationId,
  onRead,
  onTitle,
}: {
  project: HubProject
  presentationId: number
  today: string
  /** Une lecture a abouti : la date du jour est relevée. */
  onRead: () => void
  /** Titre de la présentation, pour la barre haute. */
  onTitle: (title: string) => void
}) {
  const { toast } = useUi()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [failure, setFailure] = useState<ReadFailure | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const seq = useRef(0)

  /** `quiet` : la présentation reste affichée pendant la relecture, un échec se dit par un message (`failureFeedback`). */
  const load = useCallback(
    async (quiet = false, silent = false) => {
      const mine = ++seq.current
      if (quiet) setRefreshing(true)
      else setFailure(null)
      try {
        const read = await api.deck(presentationId)
        if (mine !== seq.current) return
        setDeck(read)
        setFailure(null)
        onRead()
        onTitle(read.presentation.title)
      } catch (error) {
        if (mine !== seq.current) return
        const text = (error as Error).message
        const missing = error instanceof ApiError && error.status === 404
        const feedback = failureFeedback(quiet, silent)
        // Une présentation supprimée ailleurs ne reste pas à l'écran comme si elle existait encore.
        if (feedback.screen || missing) setFailure({ missing, text })
        else if (feedback.toast) toast(refreshFailure(text), 'danger')
      } finally {
        if (mine === seq.current) setRefreshing(false)
      }
    },
    [presentationId, onRead, onTitle, toast],
  )

  useEffect(() => {
    void load()
    return () => {
      seq.current++
    }
  }, [load])

  const list = presentationsPath(project.slug)
  const back = (
    <a className="back-link" href={href(list)} onClick={(e) => onLinkClick(e, list)}>
      <ArrowLeft aria-hidden />
      Présentations
    </a>
  )

  // Une présentation d'une autre fiche n'est pas celle de cette adresse.
  if (failure?.missing || (deck && deck.project.id !== project.id)) {
    return (
      <ReadMissing
        title="Présentation introuvable"
        text="Cette adresse ne correspond à aucune présentation de cette fiche."
        action={
          <a className="btn" href={href(list)} onClick={(e) => onLinkClick(e, list)}>
            Revenir aux présentations
          </a>
        }
      />
    )
  }
  if (failure) return <ReadError text={failure.text} onRetry={() => void load()} />
  if (!deck) {
    return (
      <div className="project deck-page" aria-busy="true" aria-label="Lecture des apps de la suite…">
        <div className="skeleton skeleton--title" />
        <div className="panel skeleton-card skeleton-card--tall" />
      </div>
    )
  }

  const readAt = clockTime(deck.generated_at)
  return (
    <div className="project deck-page">
      <header className="project__head deck__head">
        <div className="project__titles">
          {back}
          <h1 className="project__name">{deck.presentation.title}</h1>
          <p className="project__desc">
            {plural(deck.slides.length, 'diapositive', 'diapositives')}
            {readAt && ` · chiffres lus à ${readAt}`}
          </p>
        </div>
        <div className="project__actions">
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Actualiser" title={readAt ? `Relire les apps (lues à ${readAt})` : 'Relire les apps'} onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'spin' : undefined} />
          </button>
        </div>
      </header>

      <ol className="deck-titles panel">
        {deck.slides.map((slide) => (
          <li key={slide.id}>{shownTitle(slide)}</li>
        ))}
      </ol>
    </div>
  )
}
