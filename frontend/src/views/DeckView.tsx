// Une présentation de la fiche : le Hub la rend résolue (ce qui est enregistré + les chiffres relus dans les apps).

import { ArrowLeft, FileDown, Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Presenter } from '../components/Presenter.tsx'
import { ReadError, ReadMissing } from '../components/ReadState.tsx'
import { Slide } from '../components/Slide.tsx'
import { useUi } from '../components/ui.tsx'
import { ApiError } from '../lib/api.ts'
import { plural } from '../lib/format.ts'
import { clockTime, shouldRefresh } from '../lib/freshness.ts'
import { api } from '../lib/hub-api.ts'
import { printDeck, printSession, printTitle, type PrintSession } from '../lib/print.ts'
import { failureFeedback, refreshFailure } from '../lib/refresh.ts'
import { href, onLinkClick, presentationsPath } from '../lib/router.ts'
import type { Deck, HubProject } from '../lib/types.ts'

type ReadFailure = { missing: boolean; text: string }

export function DeckView({
  project,
  presentationId,
  today,
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
  const loadedAt = useRef<number | null>(null)
  const loading = useRef(false)
  const [presenting, setPresenting] = useState(false)
  const print = useRef<PrintSession | null>(null)
  const printName = useRef('')
  printName.current = deck ? printTitle(deck.presentation.title, deck.project.name) : ''

  /** `quiet` : la présentation reste affichée pendant la relecture, un échec se dit par un message (`failureFeedback`). */
  const load = useCallback(
    async (quiet = false, silent = false) => {
      const mine = ++seq.current
      loading.current = true
      if (quiet) setRefreshing(true)
      else setFailure(null)
      try {
        const read = await api.deck(presentationId)
        if (mine !== seq.current) return
        loadedAt.current = Date.now()
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
        if (mine === seq.current) {
          loading.current = false
          setRefreshing(false)
        }
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

  // Retour sur l'onglet (on revient d'une app ouverte depuis une diapositive) : relecture discrète si la lecture date.
  useEffect(() => {
    if (api.demo) return
    const onReturn = () => {
      const state = { visible: document.visibilityState === 'visible', busy: loading.current, loadedAt: loadedAt.current }
      if (shouldRefresh(state, Date.now())) void load(true, true)
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [load])

  // Impression : en clair, sous le nom « Titre — Fiche », que l'impression vienne du bouton ou du raccourci du
  // navigateur (`beforeprint`) ; `afterprint` remet le thème et le titre de l'écran.
  useEffect(() => {
    const session = printSession(document, () => printName.current)
    print.current = session
    window.addEventListener('beforeprint', session.begin)
    window.addEventListener('afterprint', session.end)
    return () => {
      window.removeEventListener('beforeprint', session.begin)
      window.removeEventListener('afterprint', session.end)
      session.end()
      print.current = null
    }
  }, [])

  const present = () => {
    // Dans le geste du clic, et sur la page (jamais sur la fenêtre, jamais après une attente) : c'est le seul moment
    // où le navigateur accorde le plein écran. S'il le refuse ou ne le connaît pas (iPhone), la présentation couvre
    // quand même toute la page.
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    } catch {
      // Navigateur sans plein écran : rien à faire.
    }
    setPresenting(true)
  }
  const closePresenter = useCallback(() => setPresenting(false), [])

  const exportPdf = () => {
    if (print.current) printDeck(print.current, window)
  }

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
  const empty = deck.slides.length === 0
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
          <button type="button" className="btn" onClick={exportPdf} disabled={empty} title="Ouvre l’impression du navigateur : choisis « Enregistrer au format PDF », en paysage.">
            <FileDown aria-hidden />
            Exporter en PDF
          </button>
          <button type="button" className="btn btn--primary" onClick={present} disabled={empty}>
            <Play aria-hidden />
            Présenter
          </button>
        </div>
      </header>

      <ol className="deck" aria-label="Diapositives">
        {deck.slides.map((slide, index) => (
          <li key={slide.id} className="deck__item">
            <Slide slide={slide} index={index} count={deck.slides.length} project={deck.project} today={today} />
          </li>
        ))}
      </ol>

      {presenting && <Presenter deck={deck} startIndex={0} today={today} onClose={closePresenter} />}
    </div>
  )
}
