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

// ─── Présentations d'une fiche ────────────────────────────────────

export type SlideKind = 'title' | 'summary' | 'kpis' | 'features' | 'active' | 'milestones' | 'wiki' | 'viz' | 'tab' | 'convert' | 'nexus' | 'sources' | 'text'
export const SLIDE_KINDS: readonly SlideKind[] = ['title', 'summary', 'kpis', 'features', 'active', 'milestones', 'wiki', 'viz', 'tab', 'convert', 'nexus', 'sources', 'text']

/** Provenance de `body` — auto : phrase automatique (body null) · manual : écrit à la main · ollama / claude : rédigé par ce moteur. */
export type TextSource = 'auto' | 'manual' | 'ollama' | 'claude'

export interface PresentationSummary {
  id: number
  project_id: number
  title: string
  /** Nombre de diapositives. */
  slides: number
  created_at: string
  updated_at: string
}

/** Ce que le Hub enregistre d'une diapositive : structure et texte rédigé, jamais de donnée d'une autre app. */
export interface SlideRecord {
  id: number
  presentation_id: number
  position: number
  kind: SlideKind
  /** null : titre automatique (calculé à la lecture). */
  title: string | null
  /** null : phrase automatique (calculée à la lecture). */
  body: string | null
  /** Identifiant de l'élément visé dans son app (null : toute la liste), et son libellé au moment du choix. */
  ref: string | null
  ref_label: string | null
  text_source: TextSource
  text_model: string | null
  text_at: string | null
  updated_at: string
}

/** ok · down : l'app ne répond pas · off : rien de rattaché · missing : l'élément visé n'est plus dans la fiche · none : pas de donnée vivante (texte libre). */
export type SlideState = 'ok' | 'down' | 'off' | 'missing' | 'none'

/** Carte de chiffres (.atelier-kpi) : textes déjà mis en forme par le Hub. */
export interface SlideFigure {
  label: string
  value: string
  note: string | null
  warn: boolean
}

export interface SlideRow {
  id: string
  label: string
  detail: string | null
  /** Jour ou horodatage ISO, mis en forme par l'interface. */
  date: string | null
  /** Statut du workflow (couleurs officielles), sinon null. */
  status: string | null
  url: string | null
}

/** Partie vivante d'une diapositive : relue dans les apps à chaque lecture, jamais enregistrée. */
export interface SlideLive {
  state: SlideState
  message: string | null
  app: AppId | null
  /** Lien « Ouvrir … dans Atelier … » (le rapport, la page, sinon l'app). */
  url: string | null
  url_label: string | null
  figures: SlideFigure[]
  rows: SlideRow[]
  /** Éléments non affichés (« et 4 autres »). */
  more: number
  /** Titre affiché quand title est null. */
  auto_title: string
  /** Phrase(s) déterministe(s) affichée(s) quand body est null. Vide pour `text`. */
  auto_text: string
}

export interface DeckSlide extends SlideRecord {
  live: SlideLive
  /** « À relire » : nombres d'un texte rédigé par une IA qui ne figurent plus dans les chiffres du jour ([] pour tout autre texte). */
  stale: string[]
}

/** Présentation résolue : ce qui est enregistré, et la partie vivante de chaque diapositive, relue à l'instant. */
export interface Deck {
  presentation: PresentationSummary
  project: HubProject
  slides: DeckSlide[]
  generated_at: string
}

// ─── Rédaction par une IA ─────────────────────────────────────────

export type EngineChoice = 'auto' | 'ollama' | 'claude'
export type AiEngineName = 'ollama' | 'claude'
export const CLAUDE_MODELS = ['sonnet', 'opus', 'haiku'] as const
export type ClaudeModel = (typeof CLAUDE_MODELS)[number]

/** État des moteurs. Hors ligne, Claude n'est pas interrogé : `available` et `installed` sont faux, `error` dit pourquoi. */
export interface AiStatus {
  online: boolean
  /** Moteur que « Auto » retiendrait maintenant. */
  auto: AiEngineName
  ollama: { reachable: boolean; error: string | null; default_model: string; default_installed: boolean; models: { name: string; size: number }[] }
  claude: { available: boolean; installed: boolean; mode: 'cli' | 'token'; error: string | null; warning: string | null; models: ClaudeModel[]; default_model: ClaudeModel }
  /** Taille maximale de ce qui part vers l'IA en un appel (caractères). */
  max_chars: number
}

export interface WriteResult {
  engine: AiEngineName
  model: string
  /** Diapositives dont le texte a été rédigé et enregistré. */
  written: number[]
  /** Diapositives laissées telles quelles, avec la raison (français). */
  kept: { slide_id: number; reason: string }[]
  /** Enregistrements à jour des diapositives rédigées. */
  slides: SlideRecord[]
}
