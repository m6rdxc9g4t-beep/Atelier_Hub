// Aperçu sans la suite : calcule les réponses du Hub contre le double de la suite (test/fixtures/suite.ts) et les
// écrit dans frontend/src/demo/snapshot.json, que l'interface lit en mode démo (`npm run build:demo`).
// Usage : npx tsx scripts/demo-snapshot.ts

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db/database.js'
import type { AppId, Deck, HubProject, PresentationSummary, WriteResult } from '../src/domain/types.js'
import type { OllamaChatRequest } from '../src/ai/ollama.js'
import { answer, fakeAi, fakeOllama } from '../test/fixtures/ai.js'
import { fakeAppsConfig, fakeSuite, WORK_ITEMS } from '../test/fixtures/suite.js'

// L'aperçu est figé au 10 novembre 2026 (les données du double) : ce que le Hub date — fiches, présentations, textes
// rédigés — l'est à ce jour-là, et le fichier ne change pas d'une régénération à l'autre.
const FROZEN = Date.parse('2026-11-10T09:30:00+01:00')
const SystemDate = Date
globalThis.Date = class extends SystemDate {
  constructor(...args: ConstructorParameters<typeof SystemDate> | []) {
    if (args.length === 0) super(FROZEN)
    else super(...args)
  }
  static override now() {
    return FROZEN
  }
} as DateConstructor

const suite = fakeSuite()
const config = { ...loadConfig({ HUB_STATIC_DIR: '' }), apps: fakeAppsConfig(suite.tabDir) }
const db = openDatabase(':memory:')

// « La veille » : Projets tel qu'il était quand le faux Ollama a rédigé les chiffres clés (une feature de moins
// terminée). Revenu à l'état du double, ce texte cite un chiffre qui n'est plus celui du jour : « à relire ».
let dayBefore = false
const ITEMS = 'http://projets/api/atelier/projects/4/work-items'
const fetcher: typeof suite.fetch = async (input, init) => {
  if (!dayBefore || input !== ITEMS) return suite.fetch(input, init)
  const rows = WORK_ITEMS.map((item) => (item.id === 102 ? { ...item, statut_code: 'IN_PROGRESS', avancement: 80 } : item))
  return new Response(JSON.stringify({ format: 'atelier-table/1', name: 'work-items', label: 'work-items', columns: [], total: rows.length, truncated: false, rows }), { headers: { 'content-type': 'application/json' } })
}

/**
 * Le faux Ollama des tests (aucun modèle) : pour chaque diapositive demandée, il reprend sa phrase automatique — le
 * deuxième de ses faits, donc des nombres présents dans les faits — et une phrase sans chiffre.
 */
function written(request: OllamaChatRequest): string {
  const user = request.messages.find((message) => message.role === 'user')?.content ?? ''
  const slides = [...user.matchAll(/<donnees type="diapositive" n="(\d+)"[^>]*>\n([\s\S]*?)\n<\/donnees>/g)]
  return answer(...slides.map((m): [number, string] => [Number(m[1]), `${m[2]!.split('\n')[1]?.replace(/^- /, '') ?? ''} Le détail est dans les chiffres de la diapositive, relus à chaque ouverture.`]))
}
const ollama = fakeOllama([written, written])
const app = await buildApp({ config, db, fetch: fetcher, today: () => '2026-11-10', ai: fakeAi({ ollama, model: 'llama3.2:1b' }) })

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
// Dans celle de « KPI CGO », trois textes rédigés par le faux Ollama (provenance, modèle, date) : les chiffres clés
// « la veille » (à relire aujourd'hui), puis les features et les jalons sur les chiffres du jour.
const presentations: Record<string, PresentationSummary[]> = {}
const decks: Record<string, Deck> = {}
for (const project of [kpi, garance]) {
  const created = await call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, { plan: true })
  if (project === kpi) {
    const slides = (await call<Deck>('GET', `/api/presentations/${created.id}`)).slides
    const of = (...kinds: string[]) => slides.filter((slide) => kinds.includes(slide.kind) && slide.ref === null).map((slide) => slide.id)
    dayBefore = true
    const before = await call<WriteResult>('POST', `/api/presentations/${created.id}/write`, { slide_ids: of('kpis'), engine: 'ollama' })
    dayBefore = false
    const today = await call<WriteResult>('POST', `/api/presentations/${created.id}/write`, { slide_ids: of('features', 'milestones'), engine: 'ollama' })
    if (before.written.length !== 1 || today.written.length !== 2) throw new Error(`Textes de l’aperçu non rédigés : ${JSON.stringify([before.kept, today.kept])}`)
  }
  presentations[project.id] = await call<PresentationSummary[]>('GET', `/api/projects/${project.id}/presentations`)
  for (const p of presentations[project.id]!) decks[p.id] = await call<Deck>('GET', `/api/presentations/${p.id}`)
}
const stale = Object.values(decks).flatMap((deck) => deck.slides.filter((slide) => slide.stale.length > 0))
if (stale.length !== 1 || stale[0]!.kind !== 'kpis') throw new Error('L’aperçu doit montrer un texte « à relire » (les chiffres clés), et un seul')

const out = resolve(import.meta.dirname, '..', '..', 'frontend', 'src', 'demo')
mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, 'snapshot.json'), `${JSON.stringify({ projects, overviews, catalogs, examples, presentations, decks, first: kpi.id, other: cloture.id }, null, 1)}\n`)
await app.close()
console.log(`Aperçu écrit : ${resolve(out, 'snapshot.json')}`)
