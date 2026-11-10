import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { buildApp } from '../src/app.js'
import { loadConfig, type HubConfig } from '../src/config.js'
import { openDatabase } from '../src/db/database.js'
import type { Catalog, HubLink, HubProject, Overview } from '../src/domain/types.js'
import { fakeAppsConfig, fakeSuite, type FakeSuiteOptions } from './fixtures/suite.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
after(async () => {
  for (const app of apps) await app.close()
})

async function setup(options: FakeSuiteOptions = {}) {
  const suite = fakeSuite(options)
  const base = loadConfig({ HUB_STATIC_DIR: '', HUB_DATA_DIR: '/tmp/inutilise' })
  const config: HubConfig = { ...base, apps: fakeAppsConfig(suite.tabDir) }
  const db = openDatabase(':memory:')
  const app = await buildApp({ config, db, fetch: suite.fetch, today: () => '2026-11-10' })
  apps.push(app)
  const call = async <T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.inject({ method, url, payload: payload as object, headers: { host: '127.0.0.1:3700', ...headers } })
    return { status: response.statusCode, body: (response.body ? JSON.parse(response.body) : null) as T }
  }
  return { app, call, suite }
}

async function kpiCgo(call: Awaited<ReturnType<typeof setup>>['call']) {
  const created = await call<HubProject>('POST', '/api/projects', { name: 'KPI CGO', description: 'Interface KPI du contrôle de gestion' })
  assert.equal(created.status, 201)
  const id = created.body.id
  await call('PATCH', `/api/projects/${id}`, { projets_id: '4', projets_name: 'KPI CGO', wiki_space_id: '7', wiki_space: 'KPI CGO', tab_project: 'KPI CGO' })
  return id
}

describe('fiches projet', () => {
  it('crée, renomme, liste et supprime une fiche', async () => {
    const { call } = await setup()
    const a = await call<HubProject>('POST', '/api/projects', { name: 'Interface KPI CGO' })
    assert.equal(a.body.slug, 'interface-kpi-cgo')
    const b = await call<HubProject>('POST', '/api/projects', { name: 'Interface KPI CGO' })
    assert.equal(b.body.slug, 'interface-kpi-cgo-2')
    const renamed = await call<HubProject>('PATCH', `/api/projects/${b.body.id}`, { name: 'Autre', keywords: 'cgo' })
    assert.equal(renamed.body.slug, 'autre')
    assert.equal(renamed.body.keywords, 'cgo')
    assert.deepEqual((await call<HubProject[]>('GET', '/api/projects')).body.map((p) => p.name), ['Autre', 'Interface KPI CGO'])
    assert.equal((await call('DELETE', `/api/projects/${a.body.id}`)).status, 204)
    assert.equal((await call('GET', `/api/projects/${a.body.id}`)).status, 404)
  })

  it('refuse un nom vide et un corps inattendu', async () => {
    const { call } = await setup()
    assert.equal((await call('POST', '/api/projects', { name: '  ' })).status, 422)
    const res = await call<{ code: string }>('POST', '/api/projects', { name: 'x', inconnu: 1 })
    assert.equal(res.status, 422)
    assert.equal(res.body.code, 'VALIDATION')
  })

  it('épingle et retire des éléments, sans doublon', async () => {
    const { call } = await setup()
    const id = await kpiCgo(call)
    const link = await call<HubLink>('POST', `/api/projects/${id}/links`, { app: 'source', kind: 'presentation', ref: 'https://exemple.fr/comite.pptx', label: 'Support du comité' })
    assert.equal(link.status, 201)
    assert.equal((await call('POST', `/api/projects/${id}/links`, { app: 'source', kind: 'presentation', ref: 'https://exemple.fr/comite.pptx', label: 'Bis' })).status, 409)
    assert.equal((await call('POST', `/api/projects/${id}/links`, { app: 'viz', kind: 'agent', ref: 'x', label: 'x' })).status, 422)
    assert.equal((await call('DELETE', `/api/projects/${id}/links/${link.body.id}`)).status, 204)
    assert.equal((await call('DELETE', `/api/projects/${id}/links/${link.body.id}`)).status, 404)
  })
})

describe('gardes', () => {
  it('refuse un hôte inconnu et une écriture venue d’un autre site', async () => {
    const { call } = await setup()
    assert.equal((await call('GET', '/api/health', undefined, { host: 'evil.example' })).status, 403)
    const res = await call<{ code: string }>('POST', '/api/projects', { name: 'x' }, { origin: 'https://evil.example' })
    assert.equal(res.status, 403)
    assert.equal(res.body.code, 'FORBIDDEN_ORIGIN')
    assert.equal((await call('POST', '/api/projects', { name: 'x' }, { origin: 'null' })).status, 403)
    assert.equal((await call('POST', '/api/projects', { name: 'x' }, { origin: 'http://localhost:5179' })).status, 201)
  })
})

describe('vue d’ensemble', () => {
  it('rassemble ce que la suite sait du projet', async () => {
    const { call } = await setup()
    const id = await kpiCgo(call)
    await call('POST', `/api/projects/${id}/links`, { app: 'source', kind: 'presentation', ref: 'https://exemple.fr/comite.pptx', label: 'Support du comité' })
    await call('POST', `/api/projects/${id}/links`, { app: 'nexus', kind: 'agent', ref: 'redacteur', label: 'Rédacteur' })
    const { status, body } = await call<Overview>('GET', `/api/projects/${id}/overview`)
    assert.equal(status, 200)

    // Projets : features dans l'ordre du calendrier, éléments en cours (bloqué d'abord), chiffres
    assert.equal(body.projets.state, 'ok')
    assert.deepEqual(body.projets.features.map((f) => f.id), ['101', '102', '103', '104', '105', '106'])
    assert.deepEqual(body.projets.active.map((f) => f.id), ['203', '201', '301', '202', '103', '104'])
    assert.equal(body.projets.features[2]!.url, 'http://127.0.0.1:4174/?projet=4&element=103')
    assert.deepEqual(body.kpis, {
      hours_spent: 66.5,
      hours_estimated: 100,
      features_total: 6,
      features_done: 2,
      active: 6,
      blocked: 1,
      next_due: { label: 'Écart d’arrondi sur le total trimestriel', date: '2026-11-13', kind: 'item' },
    })

    // Wiki : pages de l'espace rattaché, les plus récentes d'abord
    assert.equal(body.wiki.mode, 'space')
    assert.deepEqual(body.wiki.items.slice(0, 3).map((d) => d.title), ['Dictionnaire des indicateurs', 'Règles de calcul de la marge', 'Sources de données SAP et BW'])
    assert.equal(body.wiki.items[0]!.url, 'http://127.0.0.1:3200/p/41')

    // Sources : saisie à la main, dépôts du projet, jeux de Viz trouvés par mot-clé
    assert.deepEqual(
      body.sources.items.map((s) => [s.origin, s.kind, s.label]),
      [
        ['manual', 'presentation', 'Support du comité'],
        ['projets', 'repo', 'Dépôt GitHub'],
        ['projets', 'folder', 'Dépôt local'],
        ['viz', 'database', 'kpi_cgo_indicateurs'],
        ['viz', 'database', 'kpi_cgo_budget_2026'],
      ],
    )

    // Viz, Tab, Convert
    assert.deepEqual(body.viz.items.map((r) => r.name), ['KPI CGO — Tableau mensuel', 'KPI CGO — Écarts budgétaires'])
    assert.equal(body.viz.items[0]!.url, 'http://127.0.0.1:8000/#/rapports/a1b2c3d4e5f6')
    assert.equal(body.viz.items[0]!.detail, '3 pages · 18 visuels')
    assert.deepEqual(body.tab.items.map((t) => t.name), ['Réalisé mensuel', 'Budget 2026 par centre de coût', 'Référentiel des centres'])
    assert.deepEqual(body.convert.items.map((c) => [c.name, c.sent_to]), [
      ['Extraction SAP octobre', ['Réalisé mensuel']],
      ['Balance générale KPI CGO T3', []],
    ])
    assert.equal(body.convert.items[0]!.url, 'http://127.0.0.1:8010/#/conversions/c00000000001')

    // Nexus : épinglé d'abord, puis par couverture des apps de la fiche ; Finance (hors sujet) écarté
    const names = body.nexus.items.map((a) => a.name)
    assert.equal(names[0], 'redacteur')
    assert.deepEqual(names.slice(1, 3), ['data_analyst', 'orchestrateur'])
    assert.ok(!names.includes('finance'))
    assert.deepEqual(body.nexus.items.find((a) => a.name === 'developpeur')?.reasons, ['Projets', 'GitHub'])
  })

  it('reste lisible quand des apps sont arrêtées', async () => {
    const { call } = await setup({ down: new Set(['projets', 'viz', 'nexus']), noTab: true })
    const id = await kpiCgo(call)
    await call('POST', `/api/projects/${id}/links`, { app: 'viz', kind: 'report', ref: 'a1b2c3d4e5f6', label: 'Tableau mensuel' })
    const { status, body } = await call<Overview>('GET', `/api/projects/${id}/overview`)
    assert.equal(status, 200)
    assert.equal(body.projets.state, 'down')
    assert.match(body.projets.message ?? '', /Atelier Projets ne répond pas/)
    assert.equal(body.kpis, null)
    assert.equal(body.viz.state, 'down')
    assert.deepEqual(body.viz.items.map((r) => [r.name, r.url]), [['Tableau mensuel', 'http://127.0.0.1:8000/#/rapports/a1b2c3d4e5f6']])
    assert.equal(body.tab.state, 'off')
    assert.equal(body.wiki.state, 'ok')
    assert.equal(body.nexus.state, 'down')
  })

  it('cherche dans le Wiki quand aucun espace n’est rattaché', async () => {
    const { call, suite } = await setup()
    const created = await call<HubProject>('POST', '/api/projects', { name: 'KPI CGO' })
    const { body } = await call<Overview>('GET', `/api/projects/${created.body.id}/overview`)
    assert.equal(body.wiki.mode, 'search')
    assert.ok(suite.calls.includes('POST http://wiki/api/atelier/search'))
    assert.equal(body.projets.state, 'off')
    assert.equal(body.tab.items.length, 3, 'tables trouvées par le nom de leur projet Tab')
  })
})

describe('catalogue « Lier »', () => {
  it('propose les rattachements et les éléments de chaque app', async () => {
    const { call } = await setup()
    const projets = await call<Catalog>('GET', '/api/catalog/projets')
    assert.deepEqual(projets.body.candidates.map((c) => [c.kind, c.label, c.bind]), [['project', 'KPI CGO', true], ['project', 'Refonte du site', true]])
    const tab = await call<Catalog>('GET', '/api/catalog/tab?q=kpi')
    assert.deepEqual(tab.body.candidates.map((c) => c.kind), ['project', 'table', 'table', 'table'])
    const wiki = await call<Catalog>('GET', '/api/catalog/wiki?q=marge')
    assert.deepEqual(wiki.body.candidates.map((c) => [c.kind, c.label]), [['page', 'Règles de calcul de la marge']])
    assert.equal((await call('GET', '/api/catalog/inconnue')).status, 422)
  })

  it('signale une app arrêtée', async () => {
    const { call } = await setup({ down: new Set(['nexus']) })
    const res = await call<Catalog>('GET', '/api/catalog/nexus')
    assert.equal(res.body.state, 'down')
    assert.match(res.body.message ?? '', /Atelier Nexus ne répond pas/)
  })
})
