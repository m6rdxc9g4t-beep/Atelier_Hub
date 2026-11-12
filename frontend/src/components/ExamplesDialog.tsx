// « Exemples de la suite » vus du Hub. Les histoires d'exemple vivent dans les apps : le Hub les y lit (lecture
// seule), dit où chacune est chargée, ouvre l'app là où on la charge, et crée la fiche qui rassemble ce qui l'est.
// Retirer l'exemple du Hub = supprimer cette fiche, comme une autre. Règles dans `lib/examples.ts`.
// Ce que la fenêtre a à dire (échec de la fiche, lien de l'aperçu) s'affiche en elle, jamais en notification.

import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { focusOnOpen } from '../lib/dialogs.ts'
import { APP_SHORT, appLine, noticeAfter, pickStory, projectAction, projectNote, STORY_KEY, type WindowNotice } from '../lib/examples.ts'
import { api } from '../lib/hub-api.ts'
import type { ExampleCatalog, HubProject } from '../lib/types.ts'
import { AppTile } from './AppGlyph.tsx'
import { ExtLink } from './ExtLink.tsx'
import { Modal } from './ui.tsx'

function remembered(): string | null {
  try {
    return localStorage.getItem(STORY_KEY)
  } catch {
    return null
  }
}

export function ExamplesDialog({
  onClose,
  onOpen,
  onSaved,
}: {
  onClose: () => void
  /** Ouvre une fiche qui existe déjà (rien n'est écrit). */
  onOpen: (slug: string) => void
  /** La fiche de l'histoire vient d'être créée (`created`) ou rattachée à ce que les apps ont chargé depuis. */
  onSaved: (project: HubProject, created: boolean) => void
}) {
  const [catalog, setCatalog] = useState<ExampleCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(remembered)
  const [busy, setBusy] = useState(false)
  // Échec de la fiche, lien de l'aperçu : dit dans la fenêtre (une notification passerait dessous au téléphone).
  const [notice, setNotice] = useState<WindowNotice | null>(null)
  const reading = useRef(false)
  const body = useRef<HTMLDivElement>(null)
  const selectId = useId()

  /** `quiet` : relecture au retour d'une app ; la liste reste affichée et un échec ne la remplace pas. */
  const load = useCallback(async (quiet = false) => {
    if (reading.current) return
    reading.current = true
    if (!quiet) {
      setCatalog(null)
      setError(null)
    }
    try {
      setCatalog(await api.examples())
      setError(null)
    } catch (e) {
      if (!quiet) setError((e as Error).message)
    } finally {
      reading.current = false
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // On part charger l'histoire dans une app, puis on revient : la fenêtre relit où elle est chargée.
  useEffect(() => {
    if (api.demo) return
    const onReturn = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [load])

  const stories = catalog?.state === 'ok' ? catalog.stories : []
  const story = pickStory(stories, selected)
  const action = story ? projectAction(story, api.demo) : null

  // Les histoires arrivent après l'ouverture : le champ marqué `data-autofocus` n'existait pas quand la fenêtre a
  // posé le focus. Il le reprend à leur arrivée, sauf si tu l'as déjà déplacé dans la fenêtre (ou au doigt).
  const ready = story !== null
  useEffect(() => {
    const dialog = body.current?.closest('dialog')
    if (!ready || !dialog) return
    const active = document.activeElement
    const untouched = active === null || active === document.body || active === dialog || active.closest('.dialog__head') !== null
    if (untouched) focusOnOpen<HTMLElement>(dialog, window.matchMedia('(pointer: coarse)').matches)?.focus()
  }, [ready])

  const choose = (id: string) => {
    setSelected(id)
    setNotice(noticeAfter({ kind: 'story' }))
    try {
      localStorage.setItem(STORY_KEY, id)
    } catch {
      /* stockage indisponible : le choix n'est simplement pas gardé */
    }
  }

  const run = async () => {
    if (!story || !action || action.blocked) return
    if (action.kind === 'open') {
      if (story.project) onOpen(story.project.slug)
      return
    }
    setBusy(true)
    setNotice(noticeAfter({ kind: 'attempt' }))
    try {
      onSaved(await api.openExampleProject(story.id), action.kind === 'create')
    } catch (e) {
      setNotice(noticeAfter({ kind: 'failed', action: action.kind, message: (e as Error).message }))
      setBusy(false)
    }
  }

  return (
    <Modal title="Exemples de la suite" onClose={onClose} width={600} labelId="examples-title">
      <div className="dialog__body" ref={body}>
        <p className="dialog__text">
          Des histoires fictives qui traversent toute la suite. Elles se chargent dans chaque app ; le Hub les y lit et rassemble ce qui est chargé dans une
          fiche.
        </p>
        {!catalog && !error && (
          <div aria-busy="true" aria-label="Lecture des apps de la suite…">
            <div className="skeleton" />
            <div className="skeleton skeleton--short" />
          </div>
        )}
        {error && (
          <div className="examples__notice" role="alert">
            <p className="examples__down">{error}</p>
            <button type="button" className="btn btn--sm" onClick={() => void load()}>
              Réessayer
            </button>
          </div>
        )}
        {catalog && catalog.state !== 'ok' && (
          <div className="examples__notice">
            <p className={catalog.state === 'down' ? 'examples__down' : 'examples__off'}>{catalog.message}</p>
            <button type="button" className="btn btn--sm" onClick={() => void load()}>
              Relire les apps
            </button>
          </div>
        )}
        {story && (
          <>
            <label className="label" htmlFor={selectId}>
              Histoire
            </label>
            <select id={selectId} className="field" value={story.id} onChange={(e) => choose(e.target.value)} data-autofocus="">
              {stories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sector ? `${s.sector} · ${s.title}` : s.title}
                </option>
              ))}
            </select>
            <p className="example__title">
              {story.title}
              {story.subtitle && <span className="example__subtitle"> — {story.subtitle}</span>}
            </p>
            {story.summary && <p className="example__summary">{story.summary}</p>}
            <ul className="example-apps" aria-label="Où l’histoire est chargée">
              {story.apps.map((a) => {
                const line = appLine(a)
                return (
                  <li key={a.app} className="example-app" data-state={a.state}>
                    <AppTile id={a.app} />
                    <span className="example-app__body">
                      <span className="example-app__name">{APP_SHORT[a.app]}</span>
                      <span className="example-app__status">{line.status}</span>
                    </span>
                    {line.link && (
                      <ExtLink
                        href={a.url}
                        className="link-btn example-app__link"
                        label={`Atelier ${APP_SHORT[a.app]}`}
                        title={line.link.title}
                        onPreview={(text) => setNotice(noticeAfter({ kind: 'preview', text }))}
                      >
                        {line.link.label}
                        <span className="sr-only"> dans Atelier {APP_SHORT[a.app]}</span>
                        <ExternalLink aria-hidden />
                      </ExtLink>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="field-help" aria-live="polite">
              {projectNote(story, api.demo)}
            </p>
          </>
        )}
      </div>
      <div className="dialog__actions dialog__actions--pinned">
        {/* Toujours présent (zone d'annonce), vide tant qu'il n'y a rien à dire. */}
        <p className="examples__message" data-tone={notice?.tone} role="status" aria-live={notice?.tone === 'danger' ? 'assertive' : 'polite'}>
          {notice?.text}
        </p>
        <button type="button" className="btn" onClick={onClose}>
          Fermer
        </button>
        {action && (
          <button type="button" className="btn btn--primary" disabled={action.blocked || busy} onClick={() => void run()}>
            {action.label}
          </button>
        )}
      </div>
    </Modal>
  )
}
