// Fenêtres de la fiche : « Lier » (rattacher ou épingler depuis une app), « Ajouter une source », fiche (créer / modifier).

import { Check, Search } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react'

import { SOURCE_LABELS } from '../lib/format.ts'
import { api } from '../lib/hub-api.ts'
import type { ProjectInput } from '../lib/api.ts'
import { appName } from '../lib/suite.ts'
import type { AppId, Candidate, Catalog, HubProject, Overview, SourceKind } from '../lib/types.ts'
import { AppTile } from './AppGlyph.tsx'
import { Modal, useUi } from './ui.tsx'

const LINK_APPS: AppId[] = ['projets', 'wiki', 'tab', 'viz', 'convert', 'nexus']
const SHORT: Record<AppId, string> = { projets: 'Projets', wiki: 'Wiki', tab: 'Tab', viz: 'Viz', convert: 'Convert', nexus: 'Nexus' }

const HINTS: Record<AppId, string> = {
  projets: 'Rattache le projet d’Atelier Projets : features, éléments en cours, jalons et temps passé.',
  wiki: 'Rattache un espace (ses pages s’affichent, les plus récentes d’abord) ou cherche une page à épingler.',
  tab: 'Rattache un projet de Tab (toutes ses tables) ou épingle une table.',
  viz: 'Épingle un rapport, ou un jeu de données qui s’ajoutera aux sources.',
  convert: 'Épingle une conversion. Celles envoyées dans le projet Tab rattaché apparaissent déjà.',
  nexus: 'Épingle un agent pour qu’il passe en tête des agents proposés.',
}

/** Le candidat est-il déjà rattaché ou épinglé ? */
export function isLinked(candidate: Candidate, overview: Overview): boolean {
  const p = overview.project
  if (candidate.bind) {
    if (candidate.app === 'projets') return p.projets_id === candidate.ref
    if (candidate.app === 'wiki') return p.wiki_space_id === candidate.ref
    if (candidate.app === 'tab') return p.tab_project === candidate.ref
    return false
  }
  return overview.links.some((l) => l.app === candidate.app && l.kind === candidate.kind && l.ref === candidate.ref)
}

function bindInput(candidate: Candidate): ProjectInput {
  if (candidate.app === 'projets') return { projets_id: candidate.ref, projets_name: candidate.label }
  if (candidate.app === 'wiki') return { wiki_space_id: candidate.ref, wiki_space: candidate.label }
  return { tab_project: candidate.ref }
}

function unbindInput(app: AppId): ProjectInput {
  if (app === 'projets') return { projets_id: null }
  if (app === 'wiki') return { wiki_space_id: null }
  return { tab_project: null }
}

export function LinkDialog({ overview, initialApp, onClose, onChanged }: { overview: Overview; initialApp: AppId; onClose: () => void; onChanged: () => void }) {
  const { toast } = useUi()
  const [app, setApp] = useState<AppId>(initialApp)
  const [q, setQ] = useState('')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const searchId = useId()
  const tabsId = useId()
  const projectId = overview.project.id

  const selectApp = (next: AppId) => {
    setApp(next)
    setQ('')
  }
  /** Onglets au clavier : ← → changent d'app, Début / Fin vont aux extrémités ; Tab passe à la recherche. */
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = LINK_APPS.indexOf(app)
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: LINK_APPS.length - 1 }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = LINK_APPS[(target + LINK_APPS.length) % LINK_APPS.length]!
    selectApp(next)
    document.getElementById(`${tabsId}-${next}`)?.focus()
  }

  useEffect(() => {
    const controller = new AbortController()
    setCatalog(null)
    const timer = setTimeout(() => {
      api
        .catalog(app, q, controller.signal)
        .then(setCatalog)
        .catch((error: Error) => {
          if (error.name !== 'AbortError') setCatalog({ state: 'down', message: error.message, candidates: [] })
        })
    }, q ? 250 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [app, q])

  const choose = async (candidate: Candidate) => {
    const key = `${candidate.kind}:${candidate.ref}`
    setBusy(key)
    try {
      if (candidate.bind) {
        await api.updateProject(projectId, bindInput(candidate))
        toast(`${SHORT[candidate.app as AppId]} : « ${candidate.label} » rattaché`)
      } else {
        await api.addLink(projectId, { app: candidate.app, kind: candidate.kind, ref: candidate.ref, label: candidate.label })
        toast(`« ${candidate.label} » épinglé`)
      }
      onChanged()
    } catch (error) {
      toast((error as Error).message, 'danger')
    } finally {
      setBusy(null)
    }
  }

  const unbind = async () => {
    try {
      await api.updateProject(projectId, unbindInput(app))
      toast('Rattachement retiré')
      onChanged()
    } catch (error) {
      toast((error as Error).message, 'danger')
    }
  }

  const bound = app === 'projets' ? overview.project.projets_id : app === 'wiki' ? overview.project.wiki_space_id : app === 'tab' ? overview.project.tab_project : null
  const binds = catalog?.candidates.filter((c) => c.bind) ?? []
  const pins = catalog?.candidates.filter((c) => !c.bind) ?? []

  const renderCandidate = (c: Candidate) => {
    const linked = isLinked(c, overview)
    const key = `${c.kind}:${c.ref}`
    return (
      <li key={key}>
        <button type="button" className="pick" disabled={linked || busy !== null} onClick={() => void choose(c)} aria-label={`${c.bind ? 'Rattacher' : 'Épingler'} ${c.label}`}>
          <span className="pick__body">
            <span className="pick__label">{c.label}</span>
            {c.detail && <span className="pick__detail">{c.detail}</span>}
          </span>
          <span className="pick__state">{linked ? <Check aria-label="Déjà lié" /> : busy === key ? '…' : c.bind ? 'Rattacher' : 'Épingler'}</span>
        </button>
      </li>
    )
  }

  return (
    <Modal title="Lier à la fiche" onClose={onClose} width={560} labelId="link-title">
      <div className="dialog__body">
        <div className="app-tabs" role="tablist" aria-label="App de la suite" onKeyDown={onTabKey}>
          {LINK_APPS.map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              id={`${tabsId}-${a}`}
              aria-selected={a === app}
              aria-controls={`${tabsId}-panneau`}
              tabIndex={a === app ? 0 : -1}
              className="app-tab"
              onClick={() => selectApp(a)}
            >
              <AppTile id={a} />
              {SHORT[a]}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${tabsId}-panneau`} aria-labelledby={`${tabsId}-${app}`}>
          <p className="dialog__text">{HINTS[app]}</p>
          <label className="search-field" htmlFor={searchId}>
            <Search aria-hidden />
            <input id={searchId} className="search-field__input" type="search" placeholder={`Chercher dans ${appName(app)}…`} value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
          </label>
          <div className="picks" aria-live="polite">
            {catalog === null && (
              <>
                <div className="skeleton" />
                <div className="skeleton skeleton--short" />
              </>
            )}
            {catalog?.state === 'down' && <p className="panel__down">{catalog.message}</p>}
            {catalog?.state === 'ok' && catalog.candidates.length === 0 && <p className="dialog__text">Rien ne correspond.</p>}
            {binds.length > 0 && (
              <>
                <p className="picks__heading">
                  {app === 'wiki' ? 'Espaces' : 'Projets'}
                  {bound && (
                    <button type="button" className="link-btn" onClick={() => void unbind()}>
                      Retirer le rattachement
                    </button>
                  )}
                </p>
                <ul className="picks__list">{binds.map(renderCandidate)}</ul>
              </>
            )}
            {pins.length > 0 && (
              <>
                {binds.length > 0 && <p className="picks__heading">{app === 'wiki' ? 'Pages' : 'Tables'}</p>}
                <ul className="picks__list">{pins.map(renderCandidate)}</ul>
              </>
            )}
            {app === 'wiki' && !q && catalog?.state === 'ok' && <p className="picks__note">Tape un mot pour chercher une page à épingler.</p>}
          </div>
        </div>
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onClose}>
          Terminé
        </button>
      </div>
    </Modal>
  )
}

const KINDS: SourceKind[] = ['database', 'folder', 'repo', 'presentation', 'file', 'link']

export function SourceDialog({ projectId, onClose, onChanged }: { projectId: number; onClose: () => void; onChanged: () => void }) {
  const { toast } = useUi()
  const [kind, setKind] = useState<SourceKind>('database')
  const [label, setLabel] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const ids = { label: useId(), location: useId(), note: useId() }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api.addLink(projectId, { app: 'source', kind, ref: location.trim(), label: label.trim(), ...(note.trim() && { note: note.trim() }) })
      toast(`Source « ${label.trim()} » ajoutée`)
      onChanged()
      onClose()
    } catch (error) {
      toast((error as Error).message, 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Ajouter une source" onClose={onClose} labelId="source-title">
      <form onSubmit={submit}>
        <div className="dialog__body">
          <p className="dialog__text">Un fichier, un dossier ou une base qui sert au projet. Une adresse web s’ouvre d’un clic ; un chemin local se copie.</p>
          <div className="form-row">
            <span className="label">Sorte</span>
            <div className="segmented segmented--wrap" role="group" aria-label="Sorte de source">
              {KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>
                  {SOURCE_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label className="label" htmlFor={ids.label}>
              Nom
            </label>
            <input id={ids.label} className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Extraction mensuelle SAP" required maxLength={200} data-autofocus />
          </div>
          <div className="form-row">
            <label className="label" htmlFor={ids.location}>
              Emplacement
            </label>
            <input id={ids.location} className="field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://… ou ~/Documents/…" required maxLength={1000} />
          </div>
          <div className="form-row">
            <label className="label" htmlFor={ids.note}>
              Note <span className="label__opt">facultatif</span>
            </label>
            <input id={ids.note} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mise à jour le 5 de chaque mois" maxLength={500} />
          </div>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !label.trim() || !location.trim()}>
            Ajouter
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ProjectDialog({
  project,
  onClose,
  onSaved,
  onDeleted,
}: {
  project: HubProject | null
  onClose: () => void
  onSaved: (project: HubProject) => void
  onDeleted?: () => void
}) {
  const { toast, confirm } = useUi()
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [keywords, setKeywords] = useState(project?.keywords ?? '')
  const [from, setFrom] = useState<Candidate | null>(null)
  const [projets, setProjets] = useState<Candidate[] | null>(null)
  const [saving, setSaving] = useState(false)
  const ids = { name: useId(), description: useId(), keywords: useId() }

  useEffect(() => {
    if (project) return
    const controller = new AbortController()
    api
      .catalog('projets', '', controller.signal)
      .then((c) => setProjets(c.state === 'ok' ? c.candidates : []))
      .catch(() => setProjets([]))
    return () => controller.abort()
  }, [project])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const input: ProjectInput = { name: name.trim(), description: description.trim(), keywords: keywords.trim() }
      const saved = project
        ? await api.updateProject(project.id, input)
        : await api.createProject({ ...input, ...(from && { projets_id: from.ref, projets_name: from.label }) })
      onSaved(saved)
      onClose()
    } catch (error) {
      toast((error as Error).message, 'danger')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!project) return
    const ok = await confirm({
      title: `Supprimer la fiche « ${project.name} » ?`,
      text: 'Seule la fiche disparaît (rattachements, sources, éléments épinglés). Rien n’est supprimé dans les autres apps.',
      confirmLabel: 'Supprimer la fiche',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteProject(project.id)
      onDeleted?.()
      onClose()
    } catch (error) {
      toast((error as Error).message, 'danger')
    }
  }

  return (
    <Modal title={project ? 'Modifier la fiche' : 'Nouvelle fiche projet'} onClose={onClose} labelId="project-title">
      <form onSubmit={submit}>
        <div className="dialog__body">
          {!project && projets && projets.length > 0 && (
            <div className="form-row">
              <span className="label">Partir d’un projet d’Atelier Projets</span>
              <ul className="chips">
                {projets.slice(0, 8).map((c) => (
                  <li key={c.ref}>
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={from?.ref === c.ref}
                      onClick={() => {
                        const next = from?.ref === c.ref ? null : c
                        setFrom(next)
                        if (next && (!name.trim() || name === from?.label)) setName(next.label)
                      }}
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-row">
            <label className="label" htmlFor={ids.name}>
              Nom
            </label>
            <input id={ids.name} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="KPI CGO" required maxLength={120} data-autofocus />
          </div>
          <div className="form-row">
            <label className="label" htmlFor={ids.description}>
              Description <span className="label__opt">facultatif</span>
            </label>
            <textarea id={ids.description} className="field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
          <div className="form-row">
            <label className="label" htmlFor={ids.keywords}>
              Mots-clés <span className="label__opt">séparés par des virgules</span>
            </label>
            <input id={ids.keywords} className="field" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={name.trim() || 'Par défaut, le nom de la fiche'} maxLength={500} />
            <p className="field-help">Une table, un rapport ou une conversion dont le nom contient un mot-clé apparaît dans la fiche.</p>
          </div>
        </div>
        <div className="dialog__actions">
          {project && (
            <button type="button" className="btn btn--ghost btn--danger dialog__left" onClick={() => void remove()}>
              Supprimer la fiche
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
            {project ? 'Enregistrer' : 'Créer la fiche'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
