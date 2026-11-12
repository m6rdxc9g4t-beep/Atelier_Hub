// Une présentation de la fiche : le Hub la rend résolue (ce qui est enregistré + les chiffres relus dans les apps).

import { ArrowLeft, FileDown, Pencil, Play, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { AddSlideDialog } from '../components/PresentationDialogs.tsx'
import { Presenter } from '../components/Presenter.tsx'
import { ReadError, ReadMissing } from '../components/ReadState.tsx'
import { Slide } from '../components/Slide.tsx'
import { SlideEditor } from '../components/SlideEditor.tsx'
import { useUi } from '../components/ui.tsx'
import { ApiError } from '../lib/api.ts'
import { applyOrder, applyRecord, moveIds, shownTitle, withoutSlide } from '../lib/deck.ts'
import { plural } from '../lib/format.ts'
import { clockTime, shouldRefresh } from '../lib/freshness.ts'
import { api } from '../lib/hub-api.ts'
import { printDeck, printSession, printTitle, type PrintSession } from '../lib/print.ts'
import { failureFeedback, refreshFailure } from '../lib/refresh.ts'
import { href, onLinkClick, presentationsPath } from '../lib/router.ts'
import type { Deck, DeckSlide, HubProject, SlideRecord } from '../lib/types.ts'
import { READ_ONLY } from './PresentationsView.tsx'

type ReadFailure = { missing: boolean; text: string }

/** Commande d'un éditeur de diapositive qui reçoit le focus après un déplacement, une suppression ou un ajout. */
type EditorAction = 'up' | 'down' | 'remove'
const FALLBACK: Record<EditorAction, EditorAction[]> = { up: ['up', 'down', 'remove'], down: ['down', 'up', 'remove'], remove: ['remove'] }

/** Le contenu d'une diapositive dépasse sa boîte 16:9 (au téléphone, les cartes grandissent : jamais). */
function overflows(root: HTMLElement): boolean {
  return ['.slide__inner', '.slide__body', '.slide-list', '.slide-rows'].some((selector) => {
    const element = root.querySelector<HTMLElement>(selector)
    return element !== null && element.scrollHeight > element.clientHeight + 1
  })
}

/** Une diapositive de la présentation et, en mode « Modifier », son éditeur dessous. */
function DeckItem({
  slide,
  index,
  count,
  project,
  today,
  editing,
  onSaved,
  onMove,
  onRemove,
  track,
}: {
  slide: DeckSlide
  index: number
  count: number
  project: HubProject
  today: string
  editing: boolean
  onSaved: (record: SlideRecord) => void
  onMove: (slide: DeckSlide, direction: -1 | 1) => void
  onRemove: (slide: DeckSlide, index: number) => void
  track: (saving: Promise<unknown>) => void
}) {
  const item = useRef<HTMLLIElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  // Après chaque rendu (le texte vient de changer) et à chaque changement de taille de la diapositive (fenêtre, polices).
  useLayoutEffect(() => {
    if (!editing || !item.current) return
    const root = item.current
    const measure = () => setOverflowing(overflows(root))
    measure()
    const box = root.querySelector('.slide')
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  })
  return (
    <li ref={item} className="deck__item">
      <Slide slide={slide} index={index} count={count} project={project} today={today} />
      {editing && (
        <SlideEditor
          slide={slide}
          index={index}
          count={count}
          today={today}
          overflowing={overflowing}
          onSaved={onSaved}
          onMove={(direction) => onMove(slide, direction)}
          onRemove={() => onRemove(slide, index)}
          track={track}
        />
      )}
    </li>
  )
}

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
  const { toast, confirm } = useUi()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [failure, setFailure] = useState<ReadFailure | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const seq = useRef(0)
  const loadedAt = useRef<number | null>(null)
  const loading = useRef(false)
  const [presenting, setPresenting] = useState(false)
  const [editing, setEditing] = useState(false)
  const editingNow = useRef(false)
  editingNow.current = editing
  const presentingNow = useRef(false)
  presentingNow.current = presenting
  const [adding, setAdding] = useState(false)
  /** Déplacement annoncé au lecteur d'écran (« Diapositive déplacée en position 2 »). */
  const [announcement, setAnnouncement] = useState('')
  const pending = useRef(new Set<Promise<unknown>>())
  const moving = useRef(false)
  const focusAfter = useRef<{ id: number | null; action: EditorAction } | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
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
      // Pas en mode « Modifier » : rien ne bouge sous la saisie (« Actualiser » reste là). Pas en plein écran non
      // plus : les chiffres d'une présentation en cours sont ceux lus à son ouverture.
      if (editingNow.current || presentingNow.current) return
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

  const track = useCallback((saving: Promise<unknown>) => {
    pending.current.add(saving)
    const done = () => pending.current.delete(saving)
    saving.then(done, done)
  }, [])

  const exportPdf = async () => {
    // Le champ en cours est d'abord enregistré, et la page l'affiche avant d'être imprimée.
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('.slide-editor')) active.blur()
    if (pending.current.size > 0) {
      await Promise.allSettled([...pending.current])
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }
    if (print.current) printDeck(print.current, window)
  }

  /** « Actualiser » : après les enregistrements en cours, sinon la relecture pourrait rendre le texte d'avant. */
  const refresh = async () => {
    if (pending.current.size > 0) await Promise.allSettled([...pending.current])
    await load(true)
  }

  const onSaved = useCallback((record: SlideRecord) => setDeck((current) => (current ? applyRecord(current, record) : current)), [])

  const move = async (slide: DeckSlide, direction: -1 | 1) => {
    if (!deck || moving.current) return
    const ids = moveIds(deck.slides.map((s) => s.id), slide.id, direction)
    if (!ids) return
    moving.current = true
    // La diapositive bouge tout de suite ; le Hub confirme l'ordre, ou elle revient à sa place.
    const before = deck.slides
    const byId = new Map(before.map((s) => [s.id, s] as const))
    setDeck(applyOrder(deck, ids.map((id, position) => ({ ...byId.get(id)!, position }))))
    focusAfter.current = { id: slide.id, action: direction < 0 ? 'up' : 'down' }
    setAnnouncement(`Diapositive déplacée en position ${ids.indexOf(slide.id) + 1} sur ${ids.length} : ${shownTitle(slide)}`)
    try {
      const records = await api.reorderSlides(presentationId, ids)
      setDeck((current) => (current ? applyOrder(current, records) : current))
    } catch (error) {
      setDeck((current) => (current ? applyOrder(current, before) : current))
      setAnnouncement('')
      toast(`La diapositive n’a pas été déplacée : ${(error as Error).message}`, 'danger')
    } finally {
      moving.current = false
    }
  }

  const remove = async (slide: DeckSlide, index: number) => {
    const ok = await confirm({
      title: `Supprimer la diapositive ${index + 1} ?`,
      text: `« ${shownTitle(slide)} » quitte la présentation, avec le titre et le texte que tu lui as écrits. Rien n’est supprimé dans les apps.`,
      confirmLabel: 'Supprimer la diapositive',
      danger: true,
    })
    if (!ok) return
    try {
      await api.removeSlide(presentationId, slide.id)
    } catch (error) {
      toast(`La diapositive n’a pas été supprimée : ${(error as Error).message}`, 'danger')
      return
    }
    // Son bouton disparaît avec elle : le focus va à la diapositive qui prend sa place, sinon à la précédente, sinon
    // au bouton d'ajout.
    setDeck((current) => {
      if (!current) return current
      const next = withoutSlide(current, slide.id)
      focusAfter.current = { id: (next.slides[index] ?? next.slides[index - 1])?.id ?? null, action: 'remove' }
      return next
    })
    toast('Diapositive supprimée')
  }

  // Focus après un déplacement, une suppression ou un ajout : React déplace les nœuds (le focus se perd), ou le
  // bouton vient d'être désactivé au bord.
  useEffect(() => {
    const wanted = focusAfter.current
    if (!wanted || !deck) return
    if (wanted.id === null) {
      focusAfter.current = null
      addButton.current?.focus()
      return
    }
    const editor = document.querySelector(`[data-slide-editor="${wanted.id}"]`)
    if (!editor) {
      // La diapositive attendue n'est pas (encore) là : on l'attend seulement pendant la relecture qui l'amène.
      if (!loading.current) focusAfter.current = null
      return
    }
    focusAfter.current = null
    for (const action of FALLBACK[wanted.action]) {
      const button = editor.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
      if (button && !button.disabled) {
        button.focus()
        return
      }
    }
  }, [deck])

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
        <div className="project__actions deck__actions">
          {api.demo && <span className="read-only-note">{READ_ONLY}</span>}
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Actualiser" title={readAt ? `Relire les apps (lues à ${readAt})` : 'Relire les apps'} onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'spin' : undefined} />
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={editing}
            onClick={() => {
              setEditing(!editing)
              setAnnouncement('')
            }}
            disabled={api.demo}
            title={api.demo ? READ_ONLY : undefined}
          >
            <Pencil aria-hidden />
            Modifier
          </button>
          <button type="button" className="btn" onClick={() => void exportPdf()} disabled={empty} title="Ouvre l’impression du navigateur : choisis « Enregistrer au format PDF », en paysage.">
            <FileDown aria-hidden />
            Exporter en PDF
          </button>
          <button type="button" className="btn btn--primary" onClick={present} disabled={empty}>
            <Play aria-hidden />
            Présenter
          </button>
        </div>
        {/* Dans l'en-tête, qui ne s'imprime pas : après la dernière diapositive, il ouvrirait une page blanche. */}
        <p className="sr-only" role="status">
          {announcement}
        </p>
      </header>

      {empty ? (
        <p className="deck__empty">Cette présentation n’a plus de diapositive.{!editing && !api.demo && ' Passe en mode « Modifier » pour en ajouter une.'}</p>
      ) : (
        <ol className="deck" aria-label="Diapositives" data-editing={editing ? '' : undefined}>
          {deck.slides.map((slide, index) => (
            <DeckItem
              key={slide.id}
              slide={slide}
              index={index}
              count={deck.slides.length}
              project={deck.project}
              today={today}
              editing={editing}
              onSaved={onSaved}
              onMove={(moved, direction) => void move(moved, direction)}
              onRemove={(removed, at) => void remove(removed, at)}
              track={track}
            />
          ))}
        </ol>
      )}

      {editing && (
        <div className="deck__add">
          <button type="button" className="btn" ref={addButton} onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Ajouter une diapositive
          </button>
        </div>
      )}
      {adding && (
        <AddSlideDialog
          project={project}
          presentationId={presentationId}
          onClose={() => setAdding(false)}
          onAdded={(added) => {
            setAdding(false)
            // La partie vivante de la nouvelle diapositive se lit dans les apps : la présentation est relue.
            focusAfter.current = { id: added.id, action: 'up' }
            void load(true)
          }}
        />
      )}

      {presenting && <Presenter deck={deck} startIndex={0} today={today} onClose={closePresenter} />}
    </div>
  )
}
