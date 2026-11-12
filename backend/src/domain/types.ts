// Formes de l'API du Hub (snake_case, comme les nœuds de la suite). Recopiées dans frontend/src/lib/types.ts.

export type AppId = 'projets' | 'wiki' | 'viz' | 'tab' | 'convert' | 'nexus'
export type LinkApp = AppId | 'source'
/** ok : l'app a répondu · down : injoignable ou en erreur · off : rien de lié ou app non configurée. */
export type PanelState = 'ok' | 'down' | 'off'

export interface HubProject {
  id: number
  slug: string
  name: string
  description: string
  keywords: string
  projets_id: string | null
  projets_name: string | null
  wiki_space_id: string | null
  wiki_space: string | null
  tab_project: string | null
  /** Histoire des « Exemples de la suite » dont cette fiche est la fiche (null pour une fiche ordinaire). */
  example: string | null
  created_at: string
  updated_at: string
}

export interface HubLink {
  id: number
  app: LinkApp
  kind: string
  ref: string
  label: string
  note: string
  position: number
}

export interface PanelBase {
  state: PanelState
  message: string | null
  /** Accueil de l'app (ou de l'élément lié) : « Ouvrir dans Atelier … ». */
  url: string
}

export interface WorkItem {
  id: string
  type: string
  status: string
  title: string
  story: string | null
  hours_spent: number
  hours_estimated: number | null
  progress: number | null
  start: string | null
  due: string | null
  url: string
}

export interface Milestone {
  id: string
  name: string
  date: string | null
  reached: boolean
}

export interface ProjetsPanel extends PanelBase {
  project_name: string | null
  features: WorkItem[]
  active: WorkItem[]
  milestones: Milestone[]
  items_total: number
}

export interface Kpis {
  hours_spent: number
  hours_estimated: number
  features_total: number
  features_done: number
  active: number
  blocked: number
  next_due: { label: string; date: string; kind: 'milestone' | 'item' } | null
}

export interface DocItem {
  id: string
  title: string
  space: string | null
  excerpt: string | null
  updated_at: string | null
  url: string
  pinned: boolean
}

export interface WikiPanel extends PanelBase {
  space: string | null
  mode: 'space' | 'search' | 'pins'
  items: DocItem[]
}

export type SourceKind = 'database' | 'folder' | 'repo' | 'presentation' | 'file' | 'link'
export const SOURCE_KINDS: readonly SourceKind[] = ['database', 'folder', 'repo', 'presentation', 'file', 'link']

export interface SourceItem {
  id: string
  kind: SourceKind
  label: string
  location: string
  /** Adresse ouvrable dans le navigateur (http/https), sinon null : un chemin local se copie. */
  url: string | null
  origin: 'manual' | 'projets' | 'viz'
  detail: string | null
  link_id: number | null
}

export interface SourcesPanel {
  items: SourceItem[]
}

export interface ReportItem {
  id: string
  name: string
  detail: string | null
  updated_at: string | null
  url: string
  pinned: boolean
}

export interface TableItem {
  id: string
  name: string
  project: string | null
  rows: number | null
  updated_at: string | null
  url: string
  pinned: boolean
}

export interface ConversionItem {
  id: string
  name: string
  detected: string | null
  rows: number | null
  created_at: string | null
  sent_to: string[]
  url: string
  pinned: boolean
}

export interface AgentItem {
  name: string
  display_name: string
  description: string
  category: string
  /** Apps de la fiche que l'agent sait lire (noms affichés). */
  reasons: string[]
  score: number
  local_only: boolean
  url: string
  pinned: boolean
}

export interface ListPanel<T> extends PanelBase {
  items: T[]
}

export interface Overview {
  project: HubProject
  links: HubLink[]
  kpis: Kpis | null
  projets: ProjetsPanel
  wiki: WikiPanel
  sources: SourcesPanel
  tab: ListPanel<TableItem>
  viz: ListPanel<ReportItem>
  convert: ListPanel<ConversionItem>
  nexus: ListPanel<AgentItem>
  generated_at: string
}

/** Élément proposé par « Lier » : `bind` change un rattachement de la fiche, sinon c'est un élément épinglé. */
export interface Candidate {
  app: LinkApp
  kind: string
  ref: string
  label: string
  detail: string | null
  bind: boolean
}

export interface Catalog {
  state: PanelState
  message: string | null
  candidates: Candidate[]
}

/**
 * loaded : l'histoire est chargée dans l'app · absent : pas encore, elle peut l'être · unavailable : l'app répond
 * mais ne livre pas cette histoire (rien à y charger) · down : l'app ne répond pas (on ne sait pas).
 */
export type ExampleAppState = 'loaded' | 'absent' | 'unavailable' | 'down'

export interface ExampleApp {
  app: AppId
  state: ExampleAppState
  /** Ce que l'app a chargé (« Projet « … » »), ou pourquoi on ne le sait pas, ou pourquoi rien ne s'y charge. */
  detail: string | null
  /** Ce qui est chargé, sinon l'endroit de l'app où l'on charge l'exemple (le Hub ne le charge pas lui-même) ; l'accueil de l'app quand elle ne livre pas l'histoire. */
  url: string
}

/** Fiche du Hub créée pour une histoire ; `current` : rattachée à tout ce que les apps ont chargé pour elle. */
export interface ExampleProject {
  id: number
  slug: string
  name: string
  current: boolean
}

export interface ExampleStory {
  id: string
  title: string
  subtitle: string
  sector: string
  summary: string
  /** Dans l'ordre du parcours de l'histoire : Convert, Tab, Viz, Nexus, Projets, Wiki. */
  apps: ExampleApp[]
  project: ExampleProject | null
}

/** « Exemples de la suite » vus du Hub : les histoires lues dans les apps (down : aucune app n'a répondu). */
export interface ExampleCatalog {
  state: PanelState
  message: string | null
  stories: ExampleStory[]
}
