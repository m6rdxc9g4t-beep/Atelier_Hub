// Atelier Hub : coquille, liste des fiches, fiche courante et ses fenêtres.

import { CircleAlert, LayoutDashboard, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { LinkDialog, ProjectDialog, SourceDialog } from './components/Dialogs.tsx'
import { ExamplesDialog } from './components/ExamplesDialog.tsx'
import { AboutDialog, Sidebar, Topbar } from './components/Shell.tsx'
import { UiProvider, useUi } from './components/ui.tsx'
import { localToday } from './lib/format.ts'
import { shouldRefresh } from './lib/freshness.ts'
import { api } from './lib/hub-api.ts'
import { failureFeedback, refreshFailure, refreshProject, type ListRead } from './lib/refresh.ts'
import { href, navigate, onLinkClick, projectPath, useRoute } from './lib/router.ts'
import type { AppId, HubLink, HubProject, Overview } from './lib/types.ts'
import { DeckView } from './views/DeckView.tsx'
import { PresentationsView } from './views/PresentationsView.tsx'
import { ProjectView, type ProjectActions } from './views/ProjectView.tsx'

/** L'aperçu est figé au 10 novembre 2026 (date des données d'exemple). */
const currentDay = () => (api.demo ? '2026-11-10' : localToday())

const LAST_KEY = 'atelier-hub:derniere-fiche'
function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}
function writeLast(slug: string): void {
  try {
    localStorage.setItem(LAST_KEY, slug)
  } catch {
    /* stockage indisponible : on rouvrira la première fiche */
  }
}

type DialogState = { kind: 'link'; app: AppId } | { kind: 'source' } | { kind: 'project'; project: HubProject | null } | { kind: 'examples' } | null

function Hub() {
  const route = useRoute()
  const { toast, confirm } = useUi()
  const [projects, setProjects] = useState<HubProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Date du jour relevée à chaque lecture : un onglet gardé ouvert plusieurs jours ne décale pas les échéances.
  const [today, setToday] = useState(currentDay)
  const loadedAt = useRef<number | null>(null)
  const loading = useRef(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [navOpen, setNavOpen] = useState(false)
  const loadSeq = useRef(0)

  const loadProjects = useCallback(async (): Promise<ListRead<HubProject>> => {
    try {
      const list = await api.listProjects()
      setProjects(list)
      setProjectsError(null)
      return { ok: true, list }
    } catch (error) {
      const message = (error as Error).message
      setProjectsError(message)
      return { ok: false, message }
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  // La fiche courante vaut aussi pour ses présentations (la barre latérale la garde sélectionnée).
  const slug = route.name === 'project' || route.name === 'presentations' || route.name === 'deck' ? route.slug : null
  // La vue d'ensemble n'est lue que pour l'écran de la fiche : une présentation fait sa propre lecture de la suite.
  const onProject = route.name === 'project'
  const deckId = route.name === 'deck' ? route.id : null
  const current = useMemo(() => projects.find((p) => p.slug === slug) ?? null, [projects, slug])

  // Accueil : la dernière fiche ouverte (sinon la première) s'ouvre directement : le Hub est un aiguillage.
  useEffect(() => {
    if (route.name !== 'home' || projects.length === 0) return
    const last = projects.find((p) => p.slug === readLast()) ?? projects[0]!
    navigate(projectPath(last.slug), { replace: true })
  }, [route.name, projects])

  /**
   * `quiet` : la fiche reste affichée pendant la relecture. Un échec est alors dit par un message (la fiche à l'écran
   * masquerait l'erreur), sauf pour la relecture automatique (`silent`), qui réessaiera au prochain retour : voir
   * `failureFeedback`. Une lecture à l'écran (ouverture, « Réessayer ») repart sans erreur : le chargement s'affiche,
   * jamais l'échec d'une lecture précédente.
   */
  const loadOverview = useCallback(async (projectId: number, quiet = false, silent = false) => {
    const seq = ++loadSeq.current
    loading.current = true
    if (quiet) setRefreshing(true)
    else setOverviewError(null)
    try {
      const data = await api.overview(projectId)
      if (seq !== loadSeq.current) return
      loadedAt.current = Date.now()
      setToday(currentDay())
      setOverview(data)
      setOverviewError(null)
    } catch (error) {
      if (seq !== loadSeq.current) return
      const message = (error as Error).message
      const feedback = failureFeedback(quiet, silent)
      if (feedback.screen) setOverviewError(message)
      if (feedback.toast) toast(refreshFailure(message), 'danger')
    } finally {
      if (seq === loadSeq.current) {
        loading.current = false
        setRefreshing(false)
      }
    }
  }, [toast])

  // Par identifiant, pas par objet : recharger la liste des fiches (actualisation, épinglage) ne relit pas les apps
  // une seconde fois. Une fiche modifiée est relue par celui qui l'a modifiée (`refresh`, `onSaved`).
  const currentId = current?.id ?? null
  const currentSlug = current?.slug ?? null
  useEffect(() => {
    if (currentSlug !== null) writeLast(currentSlug)
  }, [currentSlug])
  const shown = useRef<Overview | null>(null)
  shown.current = overview
  useEffect(() => {
    if (currentId === null || !onProject) return
    // Retour des présentations : la fiche déjà lue reste affichée pendant sa relecture (un échec se dit par un message).
    const kept = shown.current?.project.id === currentId
    if (!kept) setOverview(null)
    void loadOverview(currentId, kept)
  }, [currentId, onProject, loadOverview])

  // Retour sur l'onglet (on revient d'une app ouverte depuis la fiche) : relecture discrète si la lecture date.
  useEffect(() => {
    if (currentId === null || !onProject || api.demo) return
    const onReturn = () => {
      const state = { visible: document.visibilityState === 'visible', busy: loading.current, loadedAt: loadedAt.current }
      if (shouldRefresh(state, Date.now())) void loadOverview(currentId, true, true)
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [currentId, onProject, loadOverview])

  const refresh = useCallback(async () => {
    if (currentId === null) return
    await refreshProject(currentId, {
      readList: loadProjects,
      readOverview: (id) => loadOverview(id, true),
      notify: (text) => toast(text, 'danger'),
    })
  }, [currentId, loadProjects, loadOverview, toast])

  const actions: ProjectActions = {
    link: (app) => setDialog({ kind: 'link', app }),
    addSource: () => setDialog({ kind: 'source' }),
    edit: () => current && setDialog({ kind: 'project', project: current }),
    refresh: () => void refresh(),
    unpin: (link: HubLink) => {
      if (!current) return
      void (async () => {
        const ok = await confirm({ title: `Retirer « ${link.label} » de la fiche ?`, text: 'L’élément reste dans son app ; seul le lien avec la fiche disparaît.', confirmLabel: 'Retirer' })
        if (!ok) return
        try {
          await api.removeLink(current.id, link.id)
          toast(`« ${link.label} » retiré de la fiche`)
          await loadOverview(current.id, true)
        } catch (error) {
          toast((error as Error).message, 'danger')
        }
      })()
    },
  }

  // Titre de la présentation ouverte, dit par son écran une fois lue.
  const [deckTitle, setDeckTitle] = useState<string | null>(null)
  useEffect(() => setDeckTitle(null), [deckId])
  const touchToday = useCallback(() => setToday(currentDay()), [])

  const section = current === null ? null : route.name === 'deck' ? (deckTitle ?? `${current.name} · Présentations`) : route.name === 'presentations' ? `${current.name} · Présentations` : current.name
  const title = section ?? (route.name === 'notFound' ? 'Page introuvable' : 'Atelier Hub')
  useEffect(() => {
    document.title = section ? `${section} · Atelier Hub` : 'Atelier Hub'
  }, [section])

  let main: ReactNode
  if (projectsError && projects.length === 0) {
    main = <ErrorState text={projectsError} onRetry={() => void loadProjects()} />
  } else if (route.name === 'notFound' || (slug !== null && !projectsLoading && !current)) {
    main = (
      <div className="empty-state">
        <h1 className="empty-state__title">Fiche introuvable</h1>
        <p className="empty-state__text">Cette adresse ne correspond à aucune fiche projet.</p>
        <a className="btn" href={href('/')} onClick={(e) => onLinkClick(e, '/')}>
          Revenir aux fiches
        </a>
      </div>
    )
  } else if (!projectsLoading && projects.length === 0) {
    main = (
      <div className="empty-state">
        <span className="empty-state__icon" aria-hidden="true">
          <LayoutDashboard />
        </span>
        <h1 className="empty-state__title">Une fiche par projet</h1>
        <p className="empty-state__text">
          Crée la fiche d’un projet, rattache-le à Atelier Projets, au Wiki et à Tab : son avancement, sa documentation, ses tables, ses rapports, ses
          sources et les agents utiles se retrouvent sur un seul écran.
        </p>
        <div className="empty-state__actions">
          <button type="button" className="btn" onClick={() => setDialog({ kind: 'examples' })}>
            Exemples de la suite
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'project', project: null })}>
            <Plus aria-hidden />
            Créer une fiche
          </button>
        </div>
      </div>
    )
  } else if (current && route.name === 'presentations') {
    main = <PresentationsView key={current.id} project={current} today={today} onRead={touchToday} />
  } else if (current && route.name === 'deck') {
    main = <DeckView key={`${current.id}:${route.id}`} project={current} presentationId={route.id} today={today} onRead={touchToday} onTitle={setDeckTitle} />
  } else if (overview && current && overview.project.id === current.id) {
    main = <ProjectView overview={overview} today={today} actions={actions} refreshing={refreshing} />
  } else if (overviewError) {
    main = <ErrorState text={overviewError} onRetry={() => current && void loadOverview(current.id)} />
  } else {
    main = <LoadingState />
  }

  return (
    <div className="shell" data-nav={navOpen ? 'open' : undefined}>
      <a className="sr-only" href="#contenu">
        Aller au contenu
      </a>
      <Sidebar projects={projects} currentSlug={slug} loading={projectsLoading} onNewProject={() => setDialog({ kind: 'project', project: null })}
        onExamples={() => {
          setNavOpen(false)
          setDialog({ kind: 'examples' })
        }}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <div className="main-col">
        <Topbar title={title} navOpen={navOpen} onToggleNav={() => setNavOpen((o) => !o)}>
          {api.demo && <span className="demo-badge" title="Données d’exemple : rien n’est enregistré">Aperçu</span>}
        </Topbar>
        <main id="contenu" className="main">
          {main}
        </main>
      </div>
      <AboutDialog />

      {dialog?.kind === 'link' && overview && (
        <LinkDialog overview={overview} initialApp={dialog.app} onClose={() => setDialog(null)} onChanged={() => void refresh()} />
      )}
      {dialog?.kind === 'source' && current && <SourceDialog projectId={current.id} onClose={() => setDialog(null)} onChanged={() => void refresh()} />}
      {dialog?.kind === 'examples' && (
        <ExamplesDialog
          onClose={() => setDialog(null)}
          onOpen={(target) => {
            setDialog(null)
            navigate(projectPath(target))
            // La fiche peut avoir été créée ailleurs (autre onglet) : la liste est relue pour la trouver.
            void loadProjects()
          }}
          onSaved={(saved, created) => {
            flushSync(() => {
              setDialog(null)
              setProjects((list) => (list.some((p) => p.id === saved.id) ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved]))
              navigate(projectPath(saved.slug))
            })
            // Une fiche qu'on ouvre est lue à son ouverture ; celle déjà à l'écran garde son identifiant : on la relit ici.
            if (saved.id === currentId) void loadOverview(saved.id, true)
            void loadProjects()
            toast(created ? `Fiche « ${saved.name} » créée` : `Fiche « ${saved.name} » rattachée à ce que les apps ont chargé`)
          }}
        />
      )}
      {dialog?.kind === 'project' && (
        <ProjectDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            const edited = dialog.project !== null
            // La liste et l'adresse changent dans le même rendu : pas de « Fiche introuvable » le temps de relire la liste
            // quand le nom (donc l'adresse) a changé.
            flushSync(() => {
              setProjects((list) => (edited ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved]))
              navigate(projectPath(saved.slug), { replace: edited })
            })
            // Une nouvelle fiche est lue à son ouverture ; une fiche modifiée garde son identifiant : on la relit ici.
            if (edited) void loadOverview(saved.id, true)
            void loadProjects()
            toast(dialog.project ? 'Fiche enregistrée' : `Fiche « ${saved.name} » créée`)
          }}
          onDeleted={() => {
            const removed = dialog.project?.id
            toast('Fiche supprimée')
            flushSync(() => {
              setOverview(null)
              setProjects((list) => list.filter((p) => p.id !== removed))
              navigate('/', { replace: true })
            })
            void loadProjects()
          }}
        />
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="project" aria-busy="true" aria-label="Lecture des apps de la suite…">
      <div className="skeleton skeleton--title" />
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="atelier-kpi skeleton-card" />
        ))}
      </div>
      <div className="board">
        {['wiki', 'projets', 'sources'].map((k) => (
          <div key={k} className={`panel panel--${k} skeleton-card skeleton-card--tall`} />
        ))}
      </div>
    </div>
  )
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state__icon empty-state__icon--danger" aria-hidden="true">
        <CircleAlert />
      </span>
      <h1 className="empty-state__title">Lecture impossible</h1>
      <p className="empty-state__text">{text}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  )
}

export function App() {
  return (
    <UiProvider>
      <Hub />
    </UiProvider>
  )
}
