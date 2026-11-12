// Aperçu sans la suite : calcule les réponses du Hub contre le double de la suite (test/fixtures/suite.ts) et les
// écrit dans frontend/src/demo/snapshot.json, que l'interface lit en mode démo (`npm run build:demo`).
// Usage : npx tsx scripts/demo-snapshot.ts

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db/database.js'
import type { AppId, Deck, HubProject, PresentationSummary } from '../src/domain/types.js'
import { fakeAppsConfig, fakeSuite } from '../test/fixtures/suite.js'

const suite = fakeSuite()
const config = { ...loadConfig({ HUB_STATIC_DIR: '' }), apps: fakeAppsConfig(suite.tabDir) }
const db = openDatabase(':memory:')
const app = await buildApp({ config, db, fetch: suite.fetch, today: () => '2026-11-10' })

async function call<T>(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object): Promise<T> {
  const res = await app.inject({ method, url, payload, headers: { host: '127.0.0.1:3700' } })
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`)
  return JSON.parse(res.body) as T
}

const kpi = await call<HubProject>('POST', '/api/projects', {
  name: 'KPI CGO',
  description: 'Interface des indicateurs du contrôle de gestion : alimentation SAP, tableau de bord mensuel, alertes et comité.',
  keywords: 'KPI CGO, CGO',
})
await call('PATCH', `/api/projects/${kpi.id}`, { projets_id: '4', projets_name: 'KPI CGO', wiki_space_id: '7', wiki_space: 'KPI CGO', tab_project: 'KPI CGO' })
for (const link of [
  { app: 'source', kind: 'presentation', ref: 'https://exemple.sharepoint.com/sites/cgo/Comite-pilotage.pptx', label: 'Support du comité de pilotage', note: 'Mis à jour avant chaque comité' },
  { app: 'source', kind: 'database', ref: 'SAP BW · cube 0COPA_C01', label: 'Entrepôt BW — rentabilité', note: 'Extraction mensuelle' },
  { app: 'source', kind: 'folder', ref: '~/Documents/CGO/Extractions', label: 'Extractions brutes' },
  { app: 'nexus', kind: 'agent', ref: 'data_analyst', label: 'Data Analyst / Power BI' },
  // Un rapport épinglé : la présentation d'exemple lui donne sa diapositive.
  { app: 'viz', kind: 'report', ref: 'a1b2c3d4e5f6', label: 'KPI CGO — Tableau mensuel' },
] as const) {
  await call('POST', `/api/projects/${kpi.id}/links`, link)
}

const cloture = await call<HubProject>('POST', '/api/projects', {
  name: 'Clôture annuelle 2026',
  description: 'Calendrier et pièces de la clôture des comptes.',
})

// Fiche d'une histoire des « Exemples de la suite » : celle que le double a chargée dans toutes les apps.
const garance = await call<HubProject>('POST', '/api/exemples-suite/studio-garance')
const examples = await call('GET', '/api/exemples-suite')

const projects = await call<HubProject[]>('GET', '/api/projects')
const overviews = Object.fromEntries(
  await Promise.all(projects.map(async (p) => [p.id, await call(`GET`, `/api/projects/${p.id}/overview`)] as const)),
)
const catalogs = Object.fromEntries(
  await Promise.all((['projets', 'wiki', 'viz', 'tab', 'convert', 'nexus'] as AppId[]).map(async (a) => [a, await call('GET', `/api/catalog/${a}`)] as const)),
)

// Présentations d'exemple : le plan que le Hub bâtit sur la fiche (« Générer » sans IA), et leur lecture résolue.
const presentations: Record<string, PresentationSummary[]> = {}
const decks: Record<string, Deck> = {}
for (const project of [kpi, garance]) {
  await call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, { plan: true })
  presentations[project.id] = await call<PresentationSummary[]>('GET', `/api/projects/${project.id}/presentations`)
  for (const p of presentations[project.id]!) decks[p.id] = await call<Deck>('GET', `/api/presentations/${p.id}`)
}

const out = resolve(import.meta.dirname, '..', '..', 'frontend', 'src', 'demo')
mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, 'snapshot.json'), `${JSON.stringify({ projects, overviews, catalogs, examples, presentations, decks, first: kpi.id, other: cloture.id }, null, 1)}\n`)
await app.close()
console.log(`Aperçu écrit : ${resolve(out, 'snapshot.json')}`)
