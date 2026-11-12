// Fenêtres des présentations : nouvelle présentation, renommer. Une fenêtre dit elle-même ce qui s'y passe : un échec
// s'affiche au-dessus de ses boutons (une notification passerait sous la fenêtre).

import { useId, useState, type FormEvent } from 'react'

import { api } from '../lib/hub-api.ts'
import { defaultTitle } from '../lib/deck.ts'
import type { HubProject, PresentationSummary } from '../lib/types.ts'
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
  const [title, setTitle] = useState(() => defaultTitle(project.name, today).slice(0, TITLE_MAX))
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
