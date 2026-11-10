// Aperçu sans la suite : réponses calculées par le backend contre le double de la suite
// (backend/scripts/demo-snapshot.ts → src/demo/snapshot.json). Lecture seule.

import snapshot from '../demo/snapshot.json'
import { ApiError, type HubApi } from './api.ts'
import type { Catalog, HubProject, Overview } from './types.ts'

interface Snapshot {
  first: number
  projects: HubProject[]
  overviews: Record<string, Overview>
  catalogs: Record<string, Catalog>
}

const data = snapshot as unknown as Snapshot
const readOnly = () => Promise.reject(new ApiError(403, 'DEMO', 'Aperçu : rien n’est enregistré. Lance le Hub sur ta machine pour modifier les fiches.'))
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
  createProject: readOnly,
  updateProject: readOnly,
  deleteProject: readOnly,
  addLink: readOnly,
  removeLink: readOnly,
}
