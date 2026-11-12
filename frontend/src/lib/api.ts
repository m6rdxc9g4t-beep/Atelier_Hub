// Accès à l'API du Hub. En mode « demo » (aperçu sans la suite), les lectures viennent de src/demo/snapshot.json
// et les écritures sont refusées avec un message clair.

import type { AiStatus, AppId, Catalog, ClaudeModel, Deck, EngineChoice, ExampleCatalog, HubLink, HubProject, LinkApp, Overview, PresentationSummary, SlideKind, SlideRecord, WriteResult } from './types.ts'

export interface ProjectInput {
  name?: string
  description?: string
  keywords?: string
  projets_id?: string | null
  projets_name?: string | null
  wiki_space_id?: string | null
  wiki_space?: string | null
  tab_project?: string | null
}

export interface LinkInput {
  app: LinkApp
  kind: string
  ref: string
  label: string
  note?: string
}

export interface PresentationInput {
  /** Absent ou vide : « <fiche> — <mois année> ». */
  title?: string
  /** Bâtir le plan sur la fiche (défaut) ; false : la seule diapositive de titre. */
  plan?: boolean
}

export interface SlideInput {
  kind: SlideKind
  /** Élément visé dans son app, et son libellé au moment du choix ; absents : toute la liste. */
  ref?: string
  ref_label?: string
  /** Diapositive après laquelle insérer (null : en tête ; absent : à la fin). */
  after?: number | null
}

/** Titre vide ou null : titre automatique. Texte vide ou null : phrase automatique. */
export interface SlidePatch {
  title?: string | null
  body?: string | null
}

/** Demande de rédaction (`POST /api/presentations/:pid/write`) : une requête = un appel au moteur, plus une relance. */
export interface WriteInput {
  /** 1 à 12 diapositives de la présentation. */
  slide_ids: number[]
  engine?: EngineChoice
  /** Modèle d'Ollama (défaut : celui du Hub). */
  model?: string
  claude_model?: ClaudeModel
  /** Public visé, ton : 500 caractères au plus. */
  instructions?: string
  /** « Réécrire aussi mes textes » : sans cela, un texte écrit à la main n'est jamais remplacé. */
  overwrite_manual?: boolean
}

export interface HubApi {
  demo: boolean
  listProjects(): Promise<HubProject[]>
  createProject(input: ProjectInput): Promise<HubProject>
  updateProject(id: number, input: ProjectInput): Promise<HubProject>
  deleteProject(id: number): Promise<void>
  overview(id: number, signal?: AbortSignal): Promise<Overview>
  addLink(projectId: number, input: LinkInput): Promise<HubLink>
  removeLink(projectId: number, linkId: number): Promise<void>
  catalog(app: AppId, q: string, signal?: AbortSignal): Promise<Catalog>
  /** « Exemples de la suite » : histoires lues dans les apps, et où chacune est chargée. */
  examples(signal?: AbortSignal): Promise<ExampleCatalog>
  /** Crée la fiche de l'histoire, ou la remet sur ce que les apps ont chargé depuis. */
  openExampleProject(storyId: string): Promise<HubProject>
  listPresentations(projectId: number, signal?: AbortSignal): Promise<PresentationSummary[]>
  /** « Générer » sans IA : le Hub lit la fiche et bâtit le plan. */
  createPresentation(projectId: number, input: PresentationInput): Promise<PresentationSummary>
  /** Présentation résolue : les apps sont relues à chaque appel. */
  deck(presentationId: number, signal?: AbortSignal): Promise<Deck>
  renamePresentation(presentationId: number, title: string): Promise<PresentationSummary>
  deletePresentation(presentationId: number): Promise<void>
  /** Les écritures d'une diapositive rendent son enregistrement, pas la présentation résolue : la suite n'est pas relue. */
  addSlide(presentationId: number, input: SlideInput): Promise<SlideRecord>
  updateSlide(presentationId: number, slideId: number, patch: SlidePatch): Promise<SlideRecord>
  removeSlide(presentationId: number, slideId: number): Promise<void>
  reorderSlides(presentationId: number, slideIds: number[]): Promise<SlideRecord[]>
  /** État des moteurs d'IA et mode en ligne. `refresh` : revérifier Claude sans attendre la fin de son cache. */
  aiStatus(refresh?: boolean, signal?: AbortSignal): Promise<AiStatus>
  /** Seul moyen de passer « En ligne » (hors ligne par défaut ; hors ligne, rien ne part vers Claude). */
  setOnline(online: boolean): Promise<{ online: boolean }>
  /** Une IA rédige le texte de ces diapositives. Abandonner la requête (`signal`) interrompt l'appel au moteur. */
  write(presentationId: number, input: WriteInput, signal?: AbortSignal): Promise<WriteResult>
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(0, 'NETWORK', 'Le Hub ne répond pas. Vérifie que son serveur est lancé.')
  }
  if (response.status === 204) return undefined as T
  const data = (await response.json().catch(() => null)) as { detail?: string; code?: string } | null
  if (!response.ok) throw new ApiError(response.status, data?.code ?? 'ERROR', data?.detail ?? `Erreur ${response.status}`)
  return data as T
}

export const httpApi: HubApi = {
  demo: false,
  listProjects: () => request('GET', '/api/projects'),
  createProject: (input) => request('POST', '/api/projects', input),
  updateProject: (id, input) => request('PATCH', `/api/projects/${id}`, input),
  deleteProject: (id) => request('DELETE', `/api/projects/${id}`),
  overview: (id, signal) => request('GET', `/api/projects/${id}/overview`, undefined, signal),
  addLink: (projectId, input) => request('POST', `/api/projects/${projectId}/links`, input),
  removeLink: (projectId, linkId) => request('DELETE', `/api/projects/${projectId}/links/${linkId}`),
  catalog: (app, q, signal) => request('GET', `/api/catalog/${app}?q=${encodeURIComponent(q)}`, undefined, signal),
  examples: (signal) => request('GET', '/api/exemples-suite', undefined, signal),
  openExampleProject: (storyId) => request('POST', `/api/exemples-suite/${encodeURIComponent(storyId)}`),
  listPresentations: (projectId, signal) => request('GET', `/api/projects/${projectId}/presentations`, undefined, signal),
  createPresentation: (projectId, input) => request('POST', `/api/projects/${projectId}/presentations`, input),
  deck: (presentationId, signal) => request('GET', `/api/presentations/${presentationId}`, undefined, signal),
  renamePresentation: (presentationId, title) => request('PATCH', `/api/presentations/${presentationId}`, { title }),
  deletePresentation: (presentationId) => request('DELETE', `/api/presentations/${presentationId}`),
  addSlide: (presentationId, input) => request('POST', `/api/presentations/${presentationId}/slides`, input),
  updateSlide: (presentationId, slideId, patch) => request('PATCH', `/api/presentations/${presentationId}/slides/${slideId}`, patch),
  removeSlide: (presentationId, slideId) => request('DELETE', `/api/presentations/${presentationId}/slides/${slideId}`),
  reorderSlides: (presentationId, slideIds) => request('PUT', `/api/presentations/${presentationId}/order`, { slide_ids: slideIds }),
  aiStatus: (refresh, signal) => request('GET', `/api/ai/status${refresh ? '?refresh=true' : ''}`, undefined, signal),
  setOnline: (online) => request('PUT', '/api/settings/online-mode', { online }),
  write: (presentationId, input, signal) => request('POST', `/api/presentations/${presentationId}/write`, input, signal),
}
