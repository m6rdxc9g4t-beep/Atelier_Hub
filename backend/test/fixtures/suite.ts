// Double de la suite pour les tests et l'aperçu : Projets, Wiki, Viz, Convert et Nexus répondent comme leurs
// nœuds `atelier-node/1` ; Tab est un index écrit dans un dossier temporaire. Données fictives (projet « KPI CGO »).

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Fetcher } from '../../src/connectors/http.js'

const table = (name: string, rows: Record<string, unknown>[]) => ({ format: 'atelier-table/1', name, label: name, columns: [], rows, total: rows.length, truncated: false })

const wi = (id: number, type: string, titre: string, statut_code: string, heures_passees: number, heures_estimees: number | null, debut: string | null, echeance: string | null, story: string, avancement = 0) => ({
  id,
  projet: 'KPI CGO',
  story,
  type,
  statut_code,
  titre,
  heures_passees,
  heures_estimees,
  avancement,
  debut,
  echeance,
})

export const WORK_ITEMS = [
  wi(101, 'FEATURE', 'Connexion aux extractions SAP', 'CLOSED', 14, 12, '2026-10-05', '2026-10-16', 'Alimentation', 100),
  wi(102, 'FEATURE', 'Modèle de données des indicateurs', 'CLOSED', 22, 20, '2026-10-12', '2026-10-30', 'Alimentation', 100),
  wi(103, 'FEATURE', 'Tableau de bord mensuel', 'IN_PROGRESS', 18.5, 24, '2026-10-27', '2026-11-21', 'Restitution', 70),
  wi(104, 'FEATURE', 'Alertes sur écarts budgétaires', 'IN_PROGRESS', 4, 12, '2026-11-09', '2026-11-28', 'Restitution', 25),
  wi(105, 'FEATURE', 'Export PowerPoint du comité', 'OPEN', 0, 10, '2026-11-23', '2026-12-05', 'Restitution'),
  wi(106, 'FEATURE', 'Commentaires des contrôleurs', 'OPEN', 0, 8, '2026-12-01', '2026-12-12', 'Collaboration'),
  wi(201, 'TASK', 'Recetter les taux de marge avec la DAF', 'IN_REVIEW', 3, 4, '2026-11-05', '2026-11-14', 'Restitution', 80),
  wi(202, 'TASK', 'Ajouter le filtre par business unit', 'IN_PROGRESS', 2.5, 3, '2026-11-10', '2026-11-18', 'Restitution', 60),
  wi(203, 'TASK', 'Seuils d’alerte par centre de coût', 'BLOCKED', 1, 3, '2026-11-09', '2026-11-20', 'Restitution', 20),
  wi(204, 'TASK', 'Documenter le calcul du BFR', 'OPEN', 0, 2, null, '2026-11-27', 'Collaboration'),
  wi(301, 'BUG', 'Écart d’arrondi sur le total trimestriel', 'IN_PROGRESS', 1.5, 2, '2026-11-09', '2026-11-13', 'Restitution', 50),
]

const MILESTONES = [
  { id: 9, nom: 'Cadrage validé', date: '2026-10-03', atteint: true },
  { id: 10, nom: 'Comité de pilotage', date: '2026-11-26', atteint: false },
  { id: 11, nom: 'Mise en production', date: '2026-12-15', atteint: false },
]

const WIKI_PAGES = [
  { id: '41', titre: 'Dictionnaire des indicateurs', espace_id: '7', espace: 'KPI CGO', maj_le: '2026-11-09T16:20:00+01:00' },
  { id: '42', titre: 'Règles de calcul de la marge', espace_id: '7', espace: 'KPI CGO', maj_le: '2026-11-06T10:05:00+01:00' },
  { id: '43', titre: 'Sources de données SAP et BW', espace_id: '7', espace: 'KPI CGO', maj_le: '2026-11-03T09:40:00+01:00' },
  { id: '45', titre: 'Procédure de rafraîchissement mensuel', espace_id: '7', espace: 'KPI CGO', maj_le: '2026-10-28T18:12:00+01:00' },
  { id: '44', titre: 'Compte rendu du comité du 15 octobre', espace_id: '7', espace: 'KPI CGO', maj_le: '2026-10-16T08:30:00+02:00' },
  { id: '12', titre: 'Conventions de nommage', espace_id: '1', espace: 'Général', maj_le: '2026-09-02T08:30:00+02:00' },
]

const AGENTS = [
  ['assistant', 'Assistant Atelier', 'Général', ['core'], 'Oriente vers le bon spécialiste.'],
  ['orchestrateur', 'Orchestrateur', 'Général', ['core', 'delegation', 'data_via', 'projets_read', 'tab'], 'Lit Viz, Projets et Tab, délègue et assemble.'],
  ['redacteur', 'Rédacteur', 'Communication', ['core'], 'Courriels, comptes rendus, documentation.'],
  ['data_analyst', 'Data Analyst / Power BI', 'Données', ['core', 'data_via', 'tab'], 'Exploration des données, DAX, modèle en étoile.'],
  ['tableur', 'Tableur', 'Données', ['core', 'tab', 'tab_write', 'tab_projets'], 'Totaux, formules, échéances dans les tables.'],
  ['chef_de_projet', 'Chef de projet', 'Gestion de projet', ['core', 'projets_read', 'projets_write', 'tab', 'tab_projets'], 'Points d’avancement, saisie de temps, statuts.'],
  ['product_owner', 'Product Owner', 'Gestion de projet', ['core', 'projets_read', 'projets_write'], 'User stories, critères d’acceptation, estimations.'],
  ['developpeur', 'Développeur', 'Développement', ['core', 'github_read', 'github_write', 'projets_read'], 'Branches, commits #ID, PR brouillons.'],
  ['finance', 'Finance', 'Finance', ['core', 'tresorerie', 'cuisine_budget'], 'Budget personnel, 100 % local.'],
  ['juridique', 'Juridique', 'Métiers', ['core'], 'Droit français.'],
].map(([name, display_name, category, toolsets, description]) => ({ name, display_name, category, toolsets, description, local_only: name === 'finance' }))

export interface FakeSuiteOptions {
  /** Apps qui ne répondent pas (connexion refusée). */
  down?: ReadonlySet<'projets' | 'wiki' | 'viz' | 'convert' | 'nexus'>
  /** Pas d'index Tab. */
  noTab?: boolean
}

export interface FakeSuite {
  fetch: Fetcher
  tabDir: string
  calls: string[]
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function fakeSuite(options: FakeSuiteOptions = {}): FakeSuite {
  const calls: string[] = []
  const tabDir = mkdtempSync(join(tmpdir(), 'hub-tab-'))
  if (!options.noTab) {
    mkdirSync(join(tabDir, '_atelier'))
    writeFileSync(
      join(tabDir, '_atelier', 'index.json'),
      JSON.stringify({
        contract: 'atelier-node/1',
        tables: [
          { table_id: 't-budget', name: 'Budget 2026 par centre de coût', project: 'KPI CGO', workspace: 'CGO', revision: 12, rows: 412, updated_at: '2026-11-08T11:00:00+01:00' },
          { table_id: 't-realise', name: 'Réalisé mensuel', project: 'KPI CGO', workspace: 'CGO', revision: 31, rows: 1280, updated_at: '2026-11-09T19:30:00+01:00' },
          { table_id: 't-centres', name: 'Référentiel des centres', project: 'KPI CGO', workspace: 'CGO', revision: 3, rows: 64, updated_at: '2026-10-21T09:00:00+02:00' },
          { table_id: 't-courses', name: 'Courses', project: 'Maison', workspace: 'Perso', revision: 80, rows: 35, updated_at: '2026-11-09T08:00:00+01:00' },
        ],
      }),
    )
  }

  const routes: [RegExp, 'projets' | 'wiki' | 'viz' | 'convert' | 'nexus', (m: RegExpExecArray, url: URL, init?: RequestInit) => Response][] = [
    [/^http:\/\/projets\/api\/atelier\/projects$/, 'projets', () =>
      json([
        { id: 4, name: 'KPI CGO', description: 'Indicateurs du contrôle de gestion', github: { owner: 'exemple', repo: 'kpi-cgo', url: 'https://github.com/exemple/kpi-cgo' }, local_repo_path: '~/Projets/kpi-cgo' },
        { id: 5, name: 'Refonte du site', description: null, github: null, local_repo_path: null },
      ])],
    [/^http:\/\/projets\/api\/atelier\/projects\/4\/work-items$/, 'projets', () => json(table('work-items', WORK_ITEMS))],
    [/^http:\/\/projets\/api\/atelier\/projects\/4\/milestones$/, 'projets', () => json(table('milestones', MILESTONES))],
    [/^http:\/\/projets\/api\/atelier\/projects\/\d+\/(work-items|milestones)$/, 'projets', () => json({ detail: 'Projet introuvable', code: 'NOT_FOUND' }, 404)],
    [/^http:\/\/wiki\/api\/atelier\/spaces$/, 'wiki', () =>
      json(table('spaces', [{ id: '1', nom: 'Général', pages: 14 }, { id: '7', nom: 'KPI CGO', pages: 5 }]))],
    [/^http:\/\/wiki\/api\/atelier\/pages$/, 'wiki', (_m, url) => json(table('pages', WIKI_PAGES.filter((p) => p.espace_id === url.searchParams.get('space_id'))))],
    [/^http:\/\/wiki\/api\/atelier\/search$/, 'wiki', (_m, _url, init) => {
      const query = String((JSON.parse(String(init?.body ?? '{}')) as { query?: string }).query ?? '').toLowerCase()
      return json(table('search', WIKI_PAGES.filter((p) => `${p.titre} ${p.espace}`.toLowerCase().includes(query)).map((p) => ({ ...p, extrait: `… ${p.titre} …` }))))
    }],
    [/^http:\/\/viz\/api\/reports$/, 'viz', () =>
      json([
        { id: 'a1b2c3d4e5f6', name: 'KPI CGO — Tableau mensuel', pages: 3, visuals: 18, bookmarks: 2, updated_at: '2026-11-09T17:45:00+01:00' },
        { id: 'b2c3d4e5f6a1', name: 'KPI CGO — Écarts budgétaires', pages: 2, visuals: 9, bookmarks: 0, updated_at: '2026-11-07T12:10:00+01:00' },
        { id: 'c3d4e5f6a1b2', name: 'Ventes 2026', pages: 4, visuals: 21, bookmarks: 1, updated_at: '2026-11-02T09:00:00+01:00' },
      ])],
    [/^http:\/\/viz\/api\/datasets$/, 'viz', () =>
      json([
        { id: 'd1', name: 'kpi_cgo_indicateurs', format: 'parquet', rows: 18420, columns_count: 14, created_at: '2026-10-14T10:00:00+02:00' },
        { id: 'd2', name: 'kpi_cgo_budget_2026', format: 'csv', rows: 412, columns_count: 9, created_at: '2026-10-20T10:00:00+02:00' },
        { id: 'd3', name: 'ventes_2026', format: 'csv', rows: 573, columns_count: 11, created_at: '2026-09-01T10:00:00+02:00' },
      ])],
    [/^http:\/\/convert\/api\/conversions$/, 'convert', () =>
      json([
        { id: 'c00000000001', name: 'Extraction SAP octobre', source: { filename: 'FBL3N_octobre.xlsx' }, detected: 'Classeur Excel · 1 280 lignes', rows: 1280, columns: 12, created_at: '2026-11-04T08:50:00+01:00', sent: [{ at: '2026-11-04T09:00:00+01:00', table_id: 't-realise', table_name: 'Réalisé mensuel', project_id: 'p1', project_name: 'KPI CGO', rows: 1280 }] },
        { id: 'c00000000002', name: 'Balance générale KPI CGO T3', source: { filename: 'balance_T3.pdf' }, detected: 'Tableau PDF · 214 lignes', rows: 214, columns: 6, created_at: '2026-10-08T14:20:00+02:00', sent: [] },
        { id: 'c00000000003', name: 'Relevé bancaire octobre', source: { filename: 'releve_10.pdf' }, detected: 'Relevé bancaire · 42 opérations', rows: 42, columns: 5, created_at: '2026-11-02T10:00:00+01:00', sent: [] },
      ])],
    [/^http:\/\/nexus\/api\/agents$/, 'nexus', () => json(AGENTS)],
  ]

  const fetchImpl: Fetcher = async (input, init) => {
    const url = new URL(input)
    const bare = `${url.origin}${url.pathname}`
    calls.push(`${init?.method ?? 'GET'} ${bare}`)
    for (const [pattern, app, handler] of routes) {
      const match = pattern.exec(bare)
      if (!match) continue
      if (options.down?.has(app)) throw new TypeError('fetch failed')
      return handler(match, url, init)
    }
    return json({ detail: 'Route inconnue', code: 'NOT_FOUND' }, 404)
  }

  return { fetch: fetchImpl, tabDir, calls }
}

/** Réglages pointés vers le double (adresses « api » fictives, adresses d'interface lisibles). */
export function fakeAppsConfig(tabDir: string) {
  return {
    projets: { api: 'http://projets', ui: 'http://127.0.0.1:4174' },
    wiki: { api: 'http://wiki', ui: 'http://127.0.0.1:3200' },
    viz: { api: 'http://viz', ui: 'http://127.0.0.1:8000' },
    convert: { api: 'http://convert', ui: 'http://127.0.0.1:8010' },
    nexus: { api: 'http://nexus', ui: 'http://127.0.0.1:3100' },
    tab: { ui: 'http://127.0.0.1:4175', exportsDir: tabDir },
  }
}
