import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { buildApp } from '../src/app.js'
import { loadConfig, type HubConfig } from '../src/config.js'
import { openDatabase } from '../src/db/database.js'
import type { Catalog, ExampleCatalog, HubLink, HubProject, Overview } from '../src/domain/types.js'
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
    assert.deepEqual(projets.body.candidates.map((c) => [c.kind, c.label, c.bind]), [['project', 'KPI CGO', true], ['project', 'Refonte du site', true], ['project', 'Gestion 2026 — Studio Garance', true]])
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

describe('exemples de la suite', () => {
  const story = (catalog: ExampleCatalog, id: string) => {
    const found = catalog.stories.find((s) => s.id === id)
    assert.ok(found, `histoire ${id}`)
    return found
  }
  const states = (catalog: ExampleCatalog, id: string) => Object.fromEntries(story(catalog, id).apps.map((a) => [a.app, a.state]))

  it('liste les histoires lues dans les apps et dit où chacune est chargée', async () => {
    const { call, suite } = await setup()
    const { status, body } = await call<ExampleCatalog>('GET', '/api/exemples-suite')
    assert.equal(status, 200)
    assert.equal(body.state, 'ok')
    assert.deepEqual(body.stories.map((s) => [s.id, s.title, s.sector]), [
      ['studio-garance', 'Studio Garance', 'Compta'],
      ['renovation-urbaine', 'Rénovation Urbaine 2026', 'Chantier'],
      ['app-ecommerce', 'App E-Commerce v2', 'Produit'],
    ])
    // Chargée partout : chaque app dit ce qu'elle a chargé et le lien ouvre l'élément.
    assert.deepEqual(story(body, 'studio-garance').apps.map((a) => [a.app, a.state, a.detail, a.url]), [
      ['convert', 'loaded', '2 conversions', 'http://127.0.0.1:8010/#/historique'],
      ['tab', 'loaded', 'Projet «\u00a0Compta 2026\u00a0» · 2 tables', 'http://127.0.0.1:4175/'],
      ['viz', 'loaded', '2 jeux de données', 'http://127.0.0.1:8000/#/donnees'],
      ['nexus', 'loaded', '2 workflows', 'http://127.0.0.1:3100/'],
      ['projets', 'loaded', 'Projet «\u00a0Gestion 2026 — Studio Garance\u00a0»', 'http://127.0.0.1:4174/?projet=12'],
      ['wiki', 'loaded', 'Espace «\u00a0Studio Garance\u00a0»', 'http://127.0.0.1:3200/p/61'],
    ])
    // Chargée en partie, puis nulle part : le lien ouvre l'app là où l'on charge l'exemple.
    assert.deepEqual(states(body, 'renovation-urbaine'), { convert: 'loaded', tab: 'absent', viz: 'loaded', nexus: 'absent', projets: 'absent', wiki: 'absent' })
    assert.deepEqual(story(body, 'app-ecommerce').apps.map((a) => [a.state, a.url]), [
      ['absent', 'http://127.0.0.1:8010/#/'],
      ['absent', 'http://127.0.0.1:4175/'],
      ['absent', 'http://127.0.0.1:8000/#/'],
      ['absent', 'http://127.0.0.1:3100/'],
      ['absent', 'http://127.0.0.1:4174/'],
      ['absent', 'http://127.0.0.1:3200/'],
    ])
    assert.ok(body.stories.every((s) => s.project === null))
    // Lecture seule : aucune écriture dans une app (la recherche du Wiki est le seul POST que le Hub envoie).
    assert.ok(suite.calls.length > 0 && suite.calls.every((c) => c.startsWith('GET ')), suite.calls.join(', '))
  })

  it('crée la fiche de l’histoire, rattachée à ce que les apps ont chargé', async () => {
    const { call, suite } = await setup()
    const created = await call<HubProject>('POST', '/api/exemples-suite/studio-garance')
    assert.equal(created.status, 201)
    const p = created.body
    assert.deepEqual(
      [p.name, p.slug, p.keywords, p.example, p.projets_id, p.projets_name, p.wiki_space_id, p.wiki_space, p.tab_project],
      ['Studio Garance', 'studio-garance', 'Studio Garance', 'studio-garance', '12', 'Gestion 2026 — Studio Garance', '9', 'Studio Garance', 'Compta 2026'],
    )
    assert.match(p.description, /Exemple de la suite Atelier \(données fictives\)\.$/)
    assert.ok(suite.calls.every((c) => c.startsWith('GET ')), 'créer la fiche n’écrit dans aucune app')

    // La fiche montre tout de suite l'exemple rassemblé.
    const { body } = await call<Overview>('GET', `/api/projects/${p.id}/overview`)
    assert.equal(body.projets.project_name, 'Gestion 2026 — Studio Garance')
    assert.equal(body.projets.items_total, 4)
    assert.deepEqual(body.wiki.items.map((d) => d.title).sort(), ['Bilan octobre 2026', 'Bilan septembre 2026', 'Fournisseurs', 'Parcours de l’exemple'])
    assert.deepEqual(body.tab.items.map((t) => t.id).sort(), ['tbl_ex_studio-garance_0', 'tbl_ex_studio-garance_1'])
    assert.deepEqual(body.viz.items.map((r) => r.name), ['Exemple — Studio Garance'])
    assert.deepEqual(body.sources.items.map((s) => s.label), ['Studio Garance — opérations août-oct. 2026', 'Studio Garance — Clients et factures'])
    assert.deepEqual(body.convert.items.map((c) => c.name), ['Opérations catégorisées — Studio Garance', 'Relevé octobre 2026 — Studio Garance'])

    // Une seule fiche par histoire : un second appel la rend telle quelle.
    const again = await call<HubProject>('POST', '/api/exemples-suite/studio-garance')
    assert.equal(again.status, 200)
    assert.equal(again.body.id, p.id)
    assert.equal(again.body.updated_at, p.updated_at)
    const listed = (await call<ExampleCatalog>('GET', '/api/exemples-suite')).body
    assert.deepEqual(story(listed, 'studio-garance').project, { id: p.id, slug: 'studio-garance', name: 'Studio Garance', current: true })
    // Une fiche ordinaire du même nom n'est pas la fiche de l'exemple.
    const plain = await call<HubProject>('POST', '/api/projects', { name: 'App E-Commerce v2' })
    assert.equal(plain.body.example, null)
    assert.equal(story((await call<ExampleCatalog>('GET', '/api/exemples-suite')).body, 'app-ecommerce').project, null)
  })

  it('remet la fiche sur ce qu’une app a chargé depuis, sans toucher au reste', async () => {
    const { call, suite } = await setup()
    const created = await call<HubProject>('POST', '/api/exemples-suite/renovation-urbaine')
    assert.equal(created.status, 201)
    assert.deepEqual([created.body.projets_id, created.body.wiki_space_id, created.body.tab_project], [null, null, null])
    const id = created.body.id
    await call('PATCH', `/api/projects/${id}`, { tab_project: 'Mon chantier', description: 'Notes à moi' })

    suite.loaded.projets.add('renovation-urbaine')
    const stale = story((await call<ExampleCatalog>('GET', '/api/exemples-suite')).body, 'renovation-urbaine')
    assert.equal(stale.project?.current, false)

    const updated = await call<HubProject>('POST', '/api/exemples-suite/renovation-urbaine')
    assert.equal(updated.status, 200)
    assert.deepEqual(
      [updated.body.id, updated.body.projets_id, updated.body.projets_name, updated.body.wiki_space_id, updated.body.tab_project, updated.body.description],
      [id, '13', 'Rénovation Urbaine 2026', null, 'Mon chantier', 'Notes à moi'],
    )
    assert.equal(story((await call<ExampleCatalog>('GET', '/api/exemples-suite')).body, 'renovation-urbaine').project?.current, true)

    // Retirer l'exemple du Hub = supprimer la fiche, comme une autre ; l'histoire redevient « à créer ».
    assert.equal((await call('DELETE', `/api/projects/${id}`)).status, 204)
    assert.equal(story((await call<ExampleCatalog>('GET', '/api/exemples-suite')).body, 'renovation-urbaine').project, null)
    assert.ok(suite.calls.every((c) => c.startsWith('GET ')))
  })

  it('une app arrêtée ne casse rien : son état est dit, la fiche se crée avec le reste', async () => {
    const { call } = await setup({ down: new Set(['projets', 'nexus']), noTab: true })
    const { body } = await call<ExampleCatalog>('GET', '/api/exemples-suite')
    assert.equal(body.state, 'ok')
    const garance = story(body, 'studio-garance')
    assert.deepEqual(states(body, 'studio-garance'), { convert: 'loaded', tab: 'absent', viz: 'loaded', nexus: 'down', projets: 'down', wiki: 'loaded' })
    assert.match(garance.apps.find((a) => a.app === 'projets')?.detail ?? '', /Atelier Projets ne répond pas/)
    assert.match(garance.apps.find((a) => a.app === 'tab')?.detail ?? '', /rien exporté/)
    const created = await call<HubProject>('POST', '/api/exemples-suite/studio-garance')
    assert.equal(created.status, 201)
    assert.deepEqual([created.body.projets_id, created.body.wiki_space_id, created.body.tab_project], [null, '9', null])
  })

  it('refuse une histoire inconnue, un identifiant mal formé, et dit quand aucune app ne répond', async () => {
    const { call } = await setup()
    const unknown = await call<{ code: string }>('POST', '/api/exemples-suite/inconnue')
    assert.deepEqual([unknown.status, unknown.body.code], [404, 'NOT_FOUND'])
    assert.equal((await call('POST', '/api/exemples-suite/Pas%20Un%20Id')).status, 422)
    // Le rattachement vient des apps relues : un champ dans le corps est refusé, pas ignoré en silence.
    for (const body of [{ projets_id: '4' }, { example: 'app-ecommerce' }, ['studio-garance']]) {
      const refused = await call<{ code: string }>('POST', '/api/exemples-suite/studio-garance', body)
      assert.deepEqual([refused.status, refused.body.code], [422, 'VALIDATION'], JSON.stringify(body))
    }
    assert.equal((await call('POST', '/api/exemples-suite/studio-garance', undefined, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await call<HubProject[]>('GET', '/api/projects')).body.length, 0)

    const off = await setup({ down: new Set(['projets', 'wiki', 'viz', 'convert', 'nexus']) })
    const listed = await off.call<ExampleCatalog>('GET', '/api/exemples-suite')
    assert.deepEqual([listed.status, listed.body.state, listed.body.stories.length], [200, 'down', 0])
    assert.match(listed.body.message ?? '', /Aucune app de la suite ne répond/)
    const refused = await off.call<{ code: string }>('POST', '/api/exemples-suite/studio-garance')
    assert.deepEqual([refused.status, refused.body.code], [503, 'SUITE_DOWN'])
  })
})
