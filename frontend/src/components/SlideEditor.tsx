// Édition d'une diapositive, sous elle en mode « Modifier » : son titre et son texte (enregistrés à la sortie du
// champ), le retour à la phrase automatique, sa place dans la présentation, sa suppression. Tout au clavier : pas de
// glisser-déposer. Rien de vivant n'est modifiable ici : cartes de chiffres et listes sont relues dans les apps.
// Une saisie n'est dite « enregistrée » que quand le Hub l'a : un champ en échec reste annoncé, est retenté à chaque
// enregistrement, et rien de ce qui est tapé n'est remplacé par une réponse arrivée entre-temps (lib/deck.ts).

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import type { SlidePatch } from '../lib/api.ts'
import {
  provenance,
  shownTitle,
  SLIDE_BODY_MAX,
  SLIDE_FIELDS,
  SLIDE_TITLE_MAX,
  syncedDraft,
  unsavedFields,
  unsavedNotice,
  unsavedPatch,
  type SlideDraft,
  type SlideField,
  type SlideSaved,
} from '../lib/deck.ts'
import { clockTime } from '../lib/freshness.ts'
import { api } from '../lib/hub-api.ts'
import type { DeckSlide, SlideRecord } from '../lib/types.ts'
import { useUi } from './ui.tsx'

/** Ce que l'écran demande à l'éditeur d'une diapositive. */
export interface SlideEditorHandle {
  /**
   * Enregistre ce qui attend (saisie encore dans son champ, champ dont l'enregistrement a échoué) et attend les
   * enregistrements partis. Vrai s'il ne reste rien à enregistrer.
   */
  flush: () => Promise<boolean>
  /** La diapositive est supprimée : sa saisie en attente ne s'enregistre plus. */
  discard: () => void
}

export function SlideEditor({
  slide,
  index,
  count,
  today,
  overflowing,
  onSaved,
  onMove,
  onRemove,
  register,
}: {
  slide: DeckSlide
  /** Rang de la diapositive, à partir de 0. */
  index: number
  count: number
  today: string
  /** Le contenu dépasse la boîte 16:9 de la diapositive (mesuré par l'écran). */
  overflowing: boolean
  onSaved: (record: SlideRecord) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  /** L'éditeur se présente à l'écran, qui lui demande d'enregistrer avant de quitter « Modifier » ou d'imprimer. */
  register: (slideId: number, handle: SlideEditorHandle | null) => void
}) {
  const { toast } = useUi()
  const [draft, setDraftState] = useState<SlideDraft>({ title: slide.title ?? '', body: slide.body ?? '' })
  /** Nombre d'enregistrements partis et sans réponse. */
  const [busy, setBusy] = useState(0)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  /** Champs dont l'enregistrement a échoué, avec la raison donnée par le Hub. */
  const [failed, setFailed] = useState<Partial<Record<SlideField, string>>>({})
  const [autoError, setAutoError] = useState<string | null>(null)
  const ids = { title: useId(), titleHelp: useId(), body: useId(), count: useId(), source: useId() }
  const text = useRef<HTMLTextAreaElement>(null)

  // Les mêmes valeurs hors du rendu : un enregistrement se décide aussi à la sortie de l'écran (éditeur démonté) et
  // à la réponse d'une requête, où l'état du dernier rendu peut dater.
  const draftNow = useRef(draft)
  /** Ce que le Hub garde, mis à jour dès la réponse d'un enregistrement (avant que la présentation ne soit rendue). */
  const saved = useRef<SlideSaved>({ title: slide.title, body: slide.body })
  /** Ce que la présentation affichait au rendu précédent. */
  const seen = useRef<SlideSaved>({ title: slide.title, body: slide.body })
  /** Valeurs parties vers le Hub et sans réponse. */
  const sending = useRef<SlidePatch>({})
  // Les enregistrements d'une diapositive partent l'un après l'autre : deux requêtes lancées ensemble (sortie du
  // champ, puis « Phrase automatique ») pourraient arriver au Hub dans l'autre ordre.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const mounted = useRef(true)
  const discarded = useRef(false)
  const rank = useRef(index)
  rank.current = index

  const setField = (field: SlideField, value: string) => {
    if (draftNow.current[field] === value) return
    draftNow.current = { ...draftNow.current, [field]: value }
    setDraftState(draftNow.current)
  }

  // L'enregistré a changé (réponse d'un enregistrement, retour à l'automatique, actualisation) : il ne remplace la
  // saisie que si elle n'a pas bougé depuis (`syncedDraft`). Ce qui a été tapé pendant qu'une réponse était en route
  // et une saisie dont l'enregistrement a échoué restent dans leur champ.
  useEffect(() => {
    const now = { title: slide.title, body: slide.body }
    for (const field of SLIDE_FIELDS) {
      const before = seen.current[field]
      const after = now[field]
      if (before === after) continue
      seen.current[field] = after
      saved.current[field] = after
      setField(field, syncedDraft(draftNow.current[field], before, after))
    }
  }, [slide.title, slide.body])

  /** Une écriture, à son tour dans la file. Elle met à jour ce que l'éditeur sait de l'enregistré, puis la présentation. */
  const write = async (patch: SlidePatch): Promise<SlideRecord> => {
    sending.current = { ...sending.current, ...patch }
    setBusy((n) => n + 1)
    setAutoError(null)
    setFailed((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !(field in patch))))
    const request = queue.current.then(() => api.updateSlide(slide.presentation_id, slide.id, patch))
    queue.current = request.catch(() => undefined)
    try {
      const record = await request
      for (const field of SLIDE_FIELDS) {
        if (!(field in patch)) continue
        saved.current[field] = record[field]
        // Le Hub a pu nettoyer la valeur envoyée : elle ne remplace la saisie que si celle-ci est encore la même.
        setField(field, syncedDraft(draftNow.current[field], patch[field] ?? null, record[field]))
      }
      setSavedAt(clockTime(new Date().toISOString()))
      onSaved(record)
      return record
    } finally {
      for (const field of SLIDE_FIELDS) {
        if (field in patch && sending.current[field] === patch[field]) delete sending.current[field]
      }
      setBusy((n) => n - 1)
    }
  }

  /**
   * Enregistre tout ce qui reste à enregistrer, un champ par requête (un champ refusé n'empêche pas l'autre) : la
   * saisie qu'on vient de quitter, et un champ en échec, retenté à chaque occasion tant qu'il attend.
   */
  const flush = async (): Promise<boolean> => {
    const patch = unsavedPatch(draftNow.current, saved.current, sending.current)
    if (patch) {
      await Promise.all(
        SLIDE_FIELDS.filter((field) => field in patch).map(async (field) => {
          try {
            await write({ [field]: patch[field] })
          } catch (failure) {
            const reason = (failure as Error).message
            if (mounted.current) setFailed((current) => ({ ...current, [field]: reason }))
            // L'éditeur n'est plus à l'écran (on a quitté la présentation) : la saisie est perdue, et c'est dit.
            else toast(`Diapositive ${rank.current + 1}. ${unsavedNotice({ [field]: reason }, [field])} Ta saisie est perdue.`, 'danger')
          }
        }),
      )
    }
    await queue.current
    return unsavedPatch(draftNow.current, saved.current) === null
  }
  const flushNow = useRef(flush)
  flushNow.current = flush

  useEffect(() => {
    register(slide.id, {
      flush: () => flushNow.current(),
      discard: () => {
        discarded.current = true
      },
    })
    return () => register(slide.id, null)
  }, [register, slide.id])

  // L'éditeur quitte l'écran sans que le champ ait été quitté (retour du navigateur, lien de la barre latérale, fin
  // de « Modifier ») : ce qui attend est enregistré.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (!discarded.current) void flushNow.current()
    }
  }, [])

  // Rechargement ou fermeture de l'onglet avec une saisie qui n'est pas dans le Hub : le navigateur demande avant.
  const unsaved = unsavedFields(draft, slide)
  const dirty = unsaved.length > 0
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Chrome et Safari n'affichent leur question que si `returnValue` est posé.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const backToAuto = async () => {
    try {
      await write({ body: null })
    } catch (failure) {
      setAutoError(`Le texte n’a pas été remis à l’automatique : ${(failure as Error).message}`)
      return
    }
    // La phrase automatique remplace aussi une saisie restée dans le champ (un enregistrement en échec).
    setField('body', '')
    // Le bouton disparaît avec le texte rédigé : le focus va au champ (pas au doigt, le clavier de l'écran s'ouvrirait).
    if (!window.matchMedia('(pointer: coarse)').matches) text.current?.focus()
  }

  const commit = () => void flush()

  const notice = unsavedNotice(failed, unsaved)
  const error = notice ? `${notice} Ta saisie est gardée.` : autoError
  const status = busy > 0 ? 'Enregistrement…' : savedAt && !dirty && !error ? `Enregistré à ${savedAt}` : ''

  const name = `la diapositive ${index + 1} : ${shownTitle(slide)}`
  const overflow = !overflowing
    ? null
    : slide.body !== null
      ? 'Le contenu dépasse la diapositive : raccourcis le texte.'
      : slide.title !== null
        ? 'Le contenu dépasse la diapositive : raccourcis le titre.'
        : 'Le contenu dépasse la diapositive.'

  return (
    <div className="slide-editor" role="group" aria-label={`Modifier ${name}`} data-slide-editor={slide.id} data-unsaved={notice ? '' : undefined}>
      <div className="slide-editor__fields">
        <div className="slide-editor__field">
          <label className="label" htmlFor={ids.title}>
            Titre
          </label>
          <input
            id={ids.title}
            className="field"
            value={draft.title}
            maxLength={SLIDE_TITLE_MAX}
            placeholder={slide.live.auto_title}
            aria-describedby={ids.titleHelp}
            data-action="title"
            onChange={(e) => setField('title', e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.repeat) commit()
            }}
          />
          <p id={ids.titleHelp} className="field-help">
            {slide.title === null ? 'Titre automatique. Écris le tien pour le remplacer.' : 'Vide-le pour revenir au titre automatique.'}
          </p>
        </div>

        <div className="slide-editor__field">
          <label className="label" htmlFor={ids.body}>
            Texte
            <span id={ids.count} className="label__opt slide-editor__count">
              {draft.body.length} / {SLIDE_BODY_MAX}
            </span>
          </label>
          <textarea
            id={ids.body}
            ref={text}
            className="field"
            rows={4}
            value={draft.body}
            maxLength={SLIDE_BODY_MAX}
            placeholder={slide.live.auto_text || 'Paragraphes, et listes avec une ligne par « - ».'}
            aria-describedby={`${ids.count} ${ids.source}`}
            onChange={(e) => setField('body', e.target.value)}
            onBlur={commit}
          />
          <p id={ids.source} className="field-help">
            {provenance(slide, today)}
          </p>
        </div>
      </div>

      <div className="slide-editor__bar">
        <div className="slide-editor__messages">
          <p className="slide-editor__error" role="alert">
            {error}
          </p>
          <p className="slide-editor__status" role="status">
            {status}
          </p>
          <p className="slide-editor__overflow" role="status">
            {overflow}
          </p>
        </div>
        <div className="slide-editor__actions">
          {slide.body !== null && slide.kind !== 'text' && (
            <button type="button" className="btn btn--sm" onClick={() => void backToAuto()}>
              Phrase automatique
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Monter ${name}`} title="Monter" data-action="up" disabled={index <= 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </button>
          <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Descendre ${name}`} title="Descendre" data-action="down" disabled={index >= count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </button>
          <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Supprimer ${name}`} title="Supprimer" data-action="remove" onClick={onRemove}>
            <Trash2 />
          </button>
        </div>
      </div>
    </div>
  )
}
