// Aperçu sans la suite : réponses calculées par le backend contre le double de la suite
// (backend/scripts/demo-snapshot.ts → src/demo/snapshot.json). Lecture seule.

import snapshot from '../demo/snapshot.json'
import { ApiError, type HubApi } from './api.ts'
import type { Catalog, Deck, ExampleCatalog, HubProject, Overview, PresentationSummary } from './types.ts'

interface Snapshot {
  first: number
  projects: HubProject[]
  overviews: Record<string, Overview>
  catalogs: Record<string, Catalog>
  examples: ExampleCatalog
  /** Présentations d'exemple, par fiche, et leur lecture résolue (figée comme le reste de l'aperçu). */
  presentations: Record<string, PresentationSummary[]>
  decks: Record<string, Deck>
}

const data = snapshot as unknown as Snapshot
const readOnly = () => Promise.reject(new ApiError(403, 'DEMO', 'Aperçu : rien n’est enregistré. Lance le Hub sur ta machine pour modifier les fiches et les présentations.'))
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export const demoApi: HubApi = {
  demo: true,
  // La fiche d'exemple complète en tête : c'est elle qui s'ouvre.
  listProjects: async () => [...data.projects].sort((a, b) => Number(b.id === data.first) - Number(a.id === data.first)),
  overview: async (id) => {
    const overview = data.overviews[String(id)]
    if (!overview) throw new ApiError(404, 'NOT_FOUND', 'Fiche projet introuvable')
    return overview
  },
  catalog: async (app, q) => {
    const catalog = data.catalogs[app] ?? { state: 'off', message: null, candidates: [] }
    const needle = normalize(q.trim())
    return needle ? { ...catalog, candidates: catalog.candidates.filter((c) => normalize(`${c.label} ${c.detail ?? ''}`).includes(needle)) } : catalog
  },
  examples: async () => data.examples,
  listPresentations: async (projectId) => data.presentations[String(projectId)] ?? [],
  deck: async (presentationId) => {
    const deck = data.decks[String(presentationId)]
    if (!deck) throw new ApiError(404, 'NOT_FOUND', 'Présentation introuvable')
    return deck
  },
  createPresentation: readOnly,
  renamePresentation: readOnly,
  deletePresentation: readOnly,
  addSlide: readOnly,
  updateSlide: readOnly,
  removeSlide: readOnly,
  reorderSlides: readOnly,
  openExampleProject: readOnly,
  createProject: readOnly,
  updateProject: readOnly,
  deleteProject: readOnly,
  addLink: readOnly,
  removeLink: readOnly,
}
