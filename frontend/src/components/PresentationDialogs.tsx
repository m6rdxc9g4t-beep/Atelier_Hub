// Fenêtres des présentations : nouvelle présentation, renommer, ajouter une diapositive. Une fenêtre dit elle-même ce qui s'y passe : un échec
// s'affiche au-dessus de ses boutons (une notification passerait sous la fenêtre).

import { useEffect, useId, useState, type FormEvent } from 'react'

import { api } from '../lib/hub-api.ts'
import { defaultTitle, elementChoices, KIND_CHOICES } from '../lib/deck.ts'
import { appName } from '../lib/suite.ts'
import type { HubProject, Overview, PresentationSummary, SlideKind, SlideRecord } from '../lib/types.ts'
import { Modal } from './ui.tsx'

/** Borne du titre d'une présentation (celle du Hub, `LIMITS.title`). */
const TITLE_MAX = 120

const PLAN_HELP = 'Le Hub lit la fiche et propose les diapositives : synthèse, avancement, documentation, rapports, tables. Les chiffres sont relus à chaque ouverture.'
const EMPTY_HELP = 'Une seule diapositive, celle du titre.'

export function NewPresentationDialog({
  project,
  today,
  onClose,
  onCreated,
}: {
  project: HubProject
  today: string
  onClose: () => void
  onCreated: (presentation: PresentationSummary) => void
}) {
  const [title, setTitle] = useState(() => defaultTitle(project.name, today, TITLE_MAX))
  const [plan, setPlan] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { title: useId(), help: useId() }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onCreated(await api.createPresentation(project.id, { title: title.trim(), plan }))
    } catch (failure) {
      setError(`La présentation n’a pas été créée : ${(failure as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <Modal title="Nouvelle présentation" onClose={onClose} labelId="presentation-new-title">
      <form onSubmit={submit}>
        <div className="dialog__body">
          <div className="form-row">
            <label className="label" htmlFor={ids.title}>
              Titre
            </label>
            <input id={ids.title} className="field" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={TITLE_MAX} data-autofocus />
          </div>
          <div className="form-row">
            <span className="label">Contenu</span>
            <div className="segmented segmented--wrap" role="group" aria-label="Contenu de la présentation" aria-describedby={ids.help}>
              <button type="button" aria-pressed={plan} onClick={() => setPlan(true)}>
                Plan proposé à partir de la fiche
              </button>
              <button type="button" aria-pressed={!plan} onClick={() => setPlan(false)}>
                Vide
              </button>
            </div>
            <p id={ids.help} className="field-help">
              {plan ? PLAN_HELP : EMPTY_HELP}
            </p>
          </div>
        </div>
        <div className="dialog__actions">
          <p className="dialog-message" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !title.trim()}>
            {saving ? 'Lecture de la fiche…' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function RenamePresentationDialog({
  presentation,
  onClose,
  onRenamed,
}: {
  presentation: PresentationSummary
  onClose: () => void
  onRenamed: (presentation: PresentationSummary) => void
}) {
  const [title, setTitle] = useState(presentation.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onRenamed(await api.renamePresentation(presentation.id, title.trim()))
    } catch (failure) {
      setError(`La présentation n’a pas été renommée : ${(failure as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <Modal title="Renommer la présentation" onClose={onClose} labelId="presentation-rename-title" width={460}>
      <form onSubmit={submit}>
        <div className="dialog__body">
          <div className="form-row">
            <label className="label" htmlFor={id}>
              Titre
            </label>
            <input id={id} className="field" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={TITLE_MAX} data-autofocus />
            <p className="field-help">La diapositive de titre le reprend.</p>
          </div>
        </div>
        <div className="dialog__actions">
          <p className="dialog-message" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !title.trim()}>
            Renommer
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * « Ajouter une diapositive » : sa sorte, et pour une sorte qui lit une liste (pages, rapports, tables…), toute la
 * liste ou un seul élément. Les éléments sont ceux que la fiche montre, lus une fois à l'ouverture. La diapositive
 * arrive à la fin ; elle ne garde que la sorte et la référence de l'élément (son identifiant, son libellé du moment).
 */
export function AddSlideDialog({
  project,
  presentationId,
  onClose,
  onAdded,
}: {
  project: HubProject
  presentationId: number
  onClose: () => void
  onAdded: (slide: SlideRecord) => void
}) {
  const [kind, setKind] = useState<SlideKind>('text')
  const [ref, setRef] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [unread, setUnread] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { kind: useId(), kindHelp: useId(), element: useId(), elementHelp: useId() }

  useEffect(() => {
    const controller = new AbortController()
    api.overview(project.id, controller.signal).then(setOverview, (failure: Error) => {
      if (failure.name !== 'AbortError') setUnread(failure.message)
    })
    return () => controller.abort()
  }, [project.id])

  const choice = KIND_CHOICES.find((c) => c.kind === kind) ?? KIND_CHOICES[0]!
  const panel = choice.element
  const elements = panel && overview ? elementChoices(overview, panel) : []
  const chosen = elements.find((element) => element.ref === ref) ?? null

  let elementHelp = 'Toute la liste : la diapositive suit ce que la fiche rassemble. Un élément : elle ne montre que lui.'
  if (panel && unread !== null) elementHelp = `La fiche n’a pas pu être lue (${unread}) : seule la liste entière est proposée.`
  else if (panel && overview === null) elementHelp = 'Lecture de la fiche…'
  else if (panel && overview && overview[panel].state === 'down') elementHelp = `${appName(panel)} ne répond pas : seule la liste entière est proposée.`
  else if (panel && elements.length === 0) elementHelp = 'Rien à viser pour l’instant : la diapositive montrera toute la liste.'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onAdded(await api.addSlide(presentationId, chosen ? { kind, ref: chosen.ref, ref_label: chosen.label } : { kind }))
    } catch (failure) {
      setError(`La diapositive n’a pas été ajoutée : ${(failure as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <Modal title="Ajouter une diapositive" onClose={onClose} labelId="slide-add-title" width={480}>
      <form onSubmit={submit} className="slide-add">
        <div className="dialog__body">
          <div className="form-row">
            <label className="label" htmlFor={ids.kind}>
              Sorte
            </label>
            <select
              id={ids.kind}
              className="field"
              value={kind}
              aria-describedby={ids.kindHelp}
              data-autofocus
              onChange={(e) => {
                setKind(e.target.value as SlideKind)
                setRef('')
              }}
            >
              {KIND_CHOICES.map((c) => (
                <option key={c.kind} value={c.kind}>
                  {c.label}
                </option>
              ))}
            </select>
            <p id={ids.kindHelp} className="field-help">
              {kind === 'text' ? 'Un titre et un texte que tu écris.' : 'Chiffres et listes sont relus dans les apps à chaque ouverture ; tu peux en écrire le titre et le texte.'}
            </p>
          </div>
          {panel && (
            <div className="form-row">
              <label className="label" htmlFor={ids.element}>
                {choice.elementLabel}
              </label>
              <select id={ids.element} className="field" value={chosen ? ref : ''} aria-describedby={ids.elementHelp} disabled={elements.length === 0} onChange={(e) => setRef(e.target.value)}>
                <option value="">Toute la liste</option>
                {elements.map((element) => (
                  <option key={element.ref} value={element.ref}>
                    {element.label}
                  </option>
                ))}
              </select>
              <p id={ids.elementHelp} className="field-help">
                {elementHelp}
              </p>
            </div>
          )}
        </div>
        <div className="dialog__actions">
          <p className="dialog-message" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            Ajouter
          </button>
        </div>
      </form>
    </Modal>
  )
}
