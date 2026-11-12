// Édition d'une diapositive, sous elle en mode « Modifier » : son titre et son texte (enregistrés à la sortie du
// champ), le retour à la phrase automatique, sa place dans la présentation, sa suppression. Tout au clavier : pas de
// glisser-déposer. Rien de vivant n'est modifiable ici : cartes de chiffres et listes sont relues dans les apps.

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import type { SlidePatch } from '../lib/api.ts'
import { provenance, shownTitle, SLIDE_BODY_MAX, SLIDE_TITLE_MAX } from '../lib/deck.ts'
import { clockTime } from '../lib/freshness.ts'
import { api } from '../lib/hub-api.ts'
import type { DeckSlide, SlideRecord } from '../lib/types.ts'

type SaveState = { kind: 'saving' } | { kind: 'saved'; at: string } | null

export function SlideEditor({
  slide,
  index,
  count,
  today,
  overflowing,
  onSaved,
  onMove,
  onRemove,
  track,
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
  /** Enregistrement en cours : « Exporter en PDF » l'attend avant d'imprimer. */
  track: (saving: Promise<unknown>) => void
}) {
  const [title, setTitle] = useState(slide.title ?? '')
  const [body, setBody] = useState(slide.body ?? '')
  const [state, setState] = useState<SaveState>(null)
  const [error, setError] = useState<string | null>(null)
  const ids = { title: useId(), titleHelp: useId(), body: useId(), count: useId(), source: useId() }
  const text = useRef<HTMLTextAreaElement>(null)
  // Les enregistrements d'une diapositive partent l'un après l'autre : deux requêtes lancées ensemble (sortie du
  // champ, puis « Phrase automatique ») pourraient arriver au Hub dans l'autre ordre.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Ce qui est enregistré fait foi dès qu'il change (enregistrement nettoyé par le Hub, retour à l'automatique,
  // actualisation) ; une saisie en échec, elle, reste dans le champ.
  useEffect(() => setTitle(slide.title ?? ''), [slide.title])
  useEffect(() => setBody(slide.body ?? ''), [slide.body])

  const save = async (patch: SlidePatch, what: string): Promise<boolean> => {
    setState({ kind: 'saving' })
    setError(null)
    const saving = queue.current.catch(() => undefined).then(() => api.updateSlide(slide.presentation_id, slide.id, patch))
    queue.current = saving
    track(saving)
    try {
      onSaved(await saving)
      setState({ kind: 'saved', at: clockTime(new Date().toISOString()) })
      return true
    } catch (failure) {
      setState(null)
      setError(`${what} : ${(failure as Error).message} Ta saisie est gardée.`)
      return false
    }
  }

  const backToAuto = async () => {
    const done = await save({ body: null }, 'Le texte n’a pas été remis à l’automatique')
    // Le bouton disparaît avec le texte rédigé : le focus va au champ (pas au doigt, le clavier de l'écran s'ouvrirait).
    if (done && !window.matchMedia('(pointer: coarse)').matches) text.current?.focus()
  }

  const commitTitle = () => {
    const next = title.trim()
    if (next !== (slide.title ?? '')) void save({ title: next || null }, 'Le titre n’a pas été enregistré')
  }
  const commitBody = () => {
    const next = body.trim()
    if (next !== (slide.body ?? '')) void save({ body: next || null }, 'Le texte n’a pas été enregistré')
  }

  const name = `la diapositive ${index + 1} : ${shownTitle(slide)}`
  const overflow = !overflowing
    ? null
    : slide.body !== null
      ? 'Le contenu dépasse la diapositive : raccourcis le texte.'
      : slide.title !== null
        ? 'Le contenu dépasse la diapositive : raccourcis le titre.'
        : 'Le contenu dépasse la diapositive.'

  return (
    <div className="slide-editor" role="group" aria-label={`Modifier ${name}`} data-slide-editor={slide.id}>
      <div className="slide-editor__fields">
        <div className="slide-editor__field">
          <label className="label" htmlFor={ids.title}>
            Titre
          </label>
          <input
            id={ids.title}
            className="field"
            value={title}
            maxLength={SLIDE_TITLE_MAX}
            placeholder={slide.live.auto_title}
            aria-describedby={ids.titleHelp}
            data-action="title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.repeat) commitTitle()
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
              {body.length} / {SLIDE_BODY_MAX}
            </span>
          </label>
          <textarea
            id={ids.body}
            ref={text}
            className="field"
            rows={4}
            value={body}
            maxLength={SLIDE_BODY_MAX}
            placeholder={slide.live.auto_text || 'Paragraphes, et listes avec une ligne par « - ».'}
            aria-describedby={`${ids.count} ${ids.source}`}
            onChange={(e) => setBody(e.target.value)}
            onBlur={commitBody}
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
            {state?.kind === 'saving' ? 'Enregistrement…' : state?.kind === 'saved' && !error ? `Enregistré à ${state.at}` : ''}
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
