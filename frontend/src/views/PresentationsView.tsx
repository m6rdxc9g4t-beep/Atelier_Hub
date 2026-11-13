// Présentations d'une fiche : liste, création (plan proposé par le Hub ou présentation vide), renommage, suppression.

import { ArrowLeft, Pencil, Plus, Presentation, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { NewPresentationDialog, RenamePresentationDialog } from '../components/PresentationDialogs.tsx'
import { ReadError } from '../components/ReadState.tsx'
import { useUi } from '../components/ui.tsx'
import { presentationMeta } from '../lib/deck.ts'
import { api } from '../lib/hub-api.ts'
import { deckPath, href, navigate, onLinkClick, projectPath } from '../lib/router.ts'
import { askWriteOnOpen } from '../lib/writing.ts'
import type { HubProject, PresentationSummary } from '../lib/types.ts'

/** Aperçu : ce qui écrit est désactivé, avec cette explication. */
export const READ_ONLY = 'Aperçu : lecture seule'

type DialogState = { kind: 'new' } | { kind: 'rename'; presentation: PresentationSummary } | null

export function PresentationsView({ project, today, onRead }: { project: HubProject; today: string; onRead: () => void }) {
  const { toast, confirm } = useUi()
  const [list, setList] = useState<PresentationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const [focusCreate, setFocusCreate] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setError(null)
    try {
      const read = await api.listPresentations(project.id)
      if (mine !== seq.current) return
      setList(read)
      onRead()
    } catch (failure) {
      if (mine === seq.current) setError((failure as Error).message)
    }
  }, [project.id, onRead])

  useEffect(() => {
    void load()
    return () => {
      seq.current++
    }
  }, [load])

  const remove = async (presentation: PresentationSummary) => {
    const ok = await confirm({
      title: `Supprimer « ${presentation.title} » ?`,
      text: 'La présentation et ses textes rédigés disparaissent. Rien n’est supprimé dans les apps.',
      confirmLabel: 'Supprimer la présentation',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deletePresentation(presentation.id)
      setList((current) => current?.filter((p) => p.id !== presentation.id) ?? null)
      toast(`Présentation « ${presentation.title} » supprimée`)
      setFocusCreate(true)
    } catch (failure) {
      toast((failure as Error).message, 'danger')
    }
  }

  // La ligne supprimée (et son bouton, qui avait le focus) a disparu : le focus va au bouton principal de l'écran,
  // une fois la liste rendue (il change de place quand la liste devient vide).
  useEffect(() => {
    if (!focusCreate) return
    createButton.current?.focus()
    setFocusCreate(false)
  }, [focusCreate])

  const fiche = projectPath(project.slug)
  const empty = list !== null && list.length === 0 && error === null
  // Un seul bouton principal par écran : dans l'en-tête, ou au milieu de l'écran tant que la liste est vide.
  const create = (
    <button type="button" className="btn btn--primary" ref={createButton} onClick={() => setDialog({ kind: 'new' })} disabled={api.demo} title={api.demo ? READ_ONLY : undefined}>
      <Plus aria-hidden />
      Nouvelle présentation
    </button>
  )

  return (
    <div className="project presentations">
      <header className="project__head">
        <div className="project__titles">
          <a className="back-link" href={href(fiche)} onClick={(e) => onLinkClick(e, fiche)}>
            <ArrowLeft aria-hidden />
            Fiche
          </a>
          <h1 className="project__name">Présentations</h1>
          <p className="project__desc">{project.name}</p>
        </div>
        <div className="project__actions">
          {api.demo && <span className="read-only-note">{READ_ONLY}</span>}
          {!empty && create}
        </div>
      </header>

      {error !== null ? (
        <ReadError text={error} onRetry={() => void load()} />
      ) : list === null ? (
        <div className="panel" aria-busy="true" aria-label="Lecture des présentations…">
          <div className="presentations__loading">
            <div className="skeleton skeleton--short" />
            <div className="skeleton" />
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="panel presentations__empty">
          <span className="empty-state__icon" aria-hidden="true">
            <Presentation />
          </span>
          <p className="presentations__empty-title">Aucune présentation pour cette fiche.</p>
          <p className="presentations__empty-text">Le Hub en propose une à partir de ce qu’il lit : avancement, documentation, rapports, tables.</p>
          {create}
        </div>
      ) : (
        <section className="panel" aria-label={`Présentations de ${project.name}`}>
          <ul className="rows">
            {list.map((p) => {
              const to = deckPath(project.slug, p.id)
              return (
                <li key={p.id} className="row">
                  <a className="row__link" href={href(to)} onClick={(e) => onLinkClick(e, to)}>
                    <span className="row__icon">
                      <Presentation aria-hidden />
                    </span>
                    <span className="row__body">
                      <span className="row__title">{p.title}</span>
                      <span className="row__sub">{presentationMeta(p, today)}</span>
                    </span>
                  </a>
                  {!api.demo && (
                    <>
                      <button type="button" className="row__action btn btn--ghost btn--icon btn--sm" aria-label={`Renommer « ${p.title} »`} title="Renommer" onClick={() => setDialog({ kind: 'rename', presentation: p })}>
                        <Pencil />
                      </button>
                      <button type="button" className="row__action btn btn--ghost btn--icon btn--sm" aria-label={`Supprimer « ${p.title} »`} title="Supprimer" onClick={() => void remove(p)}>
                        <Trash2 />
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {dialog?.kind === 'new' && (
        <NewPresentationDialog
          project={project}
          today={today}
          onClose={() => setDialog(null)}
          onCreated={(created, write) => {
            setDialog(null)
            if (write) askWriteOnOpen(created.id)
            navigate(deckPath(project.slug, created.id))
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenamePresentationDialog
          presentation={dialog.presentation}
          onClose={() => setDialog(null)}
          onRenamed={(renamed) => {
            setDialog(null)
            setList((current) => current?.map((p) => (p.id === renamed.id ? renamed : p)) ?? null)
            toast('Présentation renommée')
          }}
        />
      )}
    </div>
  )
}
