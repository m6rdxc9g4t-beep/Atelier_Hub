// Hub de test : l'application branchée sur le double de la suite, une base en mémoire, et de quoi faire varier ce
// que les apps répondent entre deux lectures (apps arrêtées, réponse remplacée).

import { after } from 'node:test'

import { buildApp } from '../../src/app.js'
import { loadConfig, type HubConfig } from '../../src/config.js'
import type { Fetcher } from '../../src/connectors/http.js'
import { openDatabase } from '../../src/db/database.js'
import type { HubProject } from '../../src/domain/types.js'
import { fakeAppsConfig, fakeSuite } from './suite.js'

type DownApp = 'projets' | 'wiki' | 'viz' | 'convert' | 'nexus'
export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface Failure {
  detail: string
  code: string
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
after(async () => {
  for (const app of apps) await app.close()
})

export async function startHub() {
  /** Apps qui ne répondent pas : modifiable en cours de test. */
  const down = new Set<DownApp>()
  /** Réponses remplacées (adresse sans paramètres → corps JSON) : ce qu'une app répondrait après un changement. */
  const replaced = new Map<string, unknown>()
  const suite = fakeSuite({ down })
  const fetchImpl: Fetcher = async (input, init) => {
    const url = new URL(input)
    const body = replaced.get(`${url.origin}${url.pathname}`)
    if (body === undefined) return suite.fetch(input, init)
    suite.calls.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const base = loadConfig({ HUB_STATIC_DIR: '', HUB_DATA_DIR: '/tmp/inutilise' })
  const config: HubConfig = { ...base, apps: fakeAppsConfig(suite.tabDir) }
  const db = openDatabase(':memory:')
  const app = await buildApp({ config, db, fetch: fetchImpl, today: () => '2026-11-10' })
  apps.push(app)
  const call = async <T>(method: Method, url: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.inject({ method, url, payload: payload as object, headers: { host: '127.0.0.1:3700', ...headers } })
    return { status: response.statusCode, body: (response.body ? JSON.parse(response.body) : null) as T }
  }
  return { db, call, suite, down, replaced }
}

export type Hub = Awaited<ReturnType<typeof startHub>>

/** Fiche « KPI CGO » rattachée à tout ce que le double en sait, avec des sources et un agent épinglés. */
export async function kpiCgo(hub: Hub): Promise<HubProject> {
  const created = await hub.call<HubProject>('POST', '/api/projects', { name: 'KPI CGO', description: 'Interface KPI du contrôle de gestion', keywords: 'KPI CGO, CGO' })
  const id = created.body.id
  await hub.call('PATCH', `/api/projects/${id}`, { projets_id: '4', projets_name: 'KPI CGO', wiki_space_id: '7', wiki_space: 'KPI CGO', tab_project: 'KPI CGO' })
  for (const link of [
    { app: 'source', kind: 'presentation', ref: 'https://exemple.fr/comite.pptx', label: 'Support du comité' },
    { app: 'source', kind: 'database', ref: 'SAP BW · cube 0COPA_C01', label: 'Entrepôt BW — rentabilité', note: 'Extraction mensuelle' },
    { app: 'source', kind: 'folder', ref: '~/Documents/CGO/Extractions', label: 'Extractions brutes' },
    { app: 'nexus', kind: 'agent', ref: 'data_analyst', label: 'Data Analyst / Power BI' },
  ]) {
    await hub.call('POST', `/api/projects/${id}/links`, link)
  }
  return (await hub.call<HubProject>('GET', `/api/projects/${id}`)).body
}
