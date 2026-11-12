// Accès à l'API du Hub. En mode « demo » (aperçu sans la suite), les lectures viennent de src/demo/snapshot.json
// et les écritures sont refusées avec un message clair.

import type { AppId, Catalog, ExampleCatalog, HubLink, HubProject, LinkApp, Overview } from './types.ts'

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
}
