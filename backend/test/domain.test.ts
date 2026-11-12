import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import Database from 'better-sqlite3'

import { migrate } from '../src/db/database.js'
import { assembleExamples, exampleProjectInput, isCurrent, type SuiteExamples } from '../src/domain/examples.js'
import { matchesKeywords, normalize, parseKeywords, sameName, slugify } from '../src/domain/match.js'
import { agentReasons, rankAgents } from '../src/domain/relevance.js'
import { activeItems, computeKpis, sortFeatures, workItemFromRow } from '../src/domain/summary.js'
import { readAtelierTable } from '../src/domain/table.js'
import type { WorkItem } from '../src/domain/types.js'
import { findExampleProject } from '../src/services/projects.js'

const item = (over: Partial<WorkItem>): WorkItem => ({
  id: '1',
  type: 'TASK',
  status: 'OPEN',
  title: 'Élément',
  story: null,
  hours_spent: 0,
  hours_estimated: null,
  progress: null,
  start: null,
  due: null,
  url: '',
  ...over,
})

describe('mots-clés', () => {
  it('normalise sans casse ni accents', () => {
    assert.equal(normalize('  Équipe KPI-CGO ! '), 'equipe kpi cgo')
  })

  it('prend le nom quand aucun mot-clé n’est saisi', () => {
    assert.deepEqual(parseKeywords('KPI CGO', ''), ['kpi cgo'])
    assert.deepEqual(parseKeywords('KPI CGO', 'cgo, Contrôle de gestion, cgo'), ['cgo', 'controle de gestion'])
  })

  it('compare des mots entiers', () => {
    assert.equal(matchesKeywords('Rapport KPI CGO 2026', ['kpi cgo']), true)
    assert.equal(matchesKeywords('Rapport kpi-cgo', ['kpi cgo']), true)
    assert.equal(matchesKeywords('KPI CGOV', ['kpi cgo']), false)
    assert.equal(matchesKeywords(null, ['kpi cgo']), false)
  })

  it('compare des noms de projet et fabrique un identifiant', () => {
    assert.equal(sameName('Kpi Cgo', 'KPI CGO'), true)
    assert.equal(sameName(null, 'KPI CGO'), false)
    assert.equal(slugify('Interface KPI CGO'), 'interface-kpi-cgo')
    assert.equal(slugify('!!!'), 'projet')
  })
})

describe('table atelier-table/1', () => {
  it('refuse une autre forme', () => {
    assert.throws(() => readAtelierTable({ rows: [] }))
    assert.equal(readAtelierTable({ format: 'atelier-table/1', rows: [{ a: 1 }, 'x'] }).rows.length, 1)
  })
})

describe('synthèse Projets', () => {
  it('lit une ligne du jeu work-items', () => {
    const row = { id: 12, titre: 'Tableau KPI', type: 'FEATURE', statut_code: 'IN_PROGRESS', heures_passees: 3.5, heures_estimees: 8, avancement: 40, debut: '2026-11-02', echeance: '2026-11-20', story: 'Écran' }
    const parsed = workItemFromRow(row, (id) => `u/${id}`)
    assert.deepEqual(parsed, {
      id: '12',
      type: 'FEATURE',
      status: 'IN_PROGRESS',
      title: 'Tableau KPI',
      story: 'Écran',
      hours_spent: 3.5,
      hours_estimated: 8,
      progress: 40,
      start: '2026-11-02',
      due: '2026-11-20',
      url: 'u/12',
    })
    assert.equal(workItemFromRow({ id: 1 }, String), null)
  })

  it('trie les features et met les bloqués en tête des éléments en cours', () => {
    const items = [
      item({ id: '1', type: 'FEATURE', start: '2026-11-10' }),
      item({ id: '2', type: 'FEATURE', start: '2026-11-01', status: 'REJECTED' }),
      item({ id: '3', type: 'FEATURE', start: '2026-11-03' }),
      item({ id: '4', status: 'IN_PROGRESS', due: '2026-11-30' }),
      item({ id: '5', status: 'BLOCKED', due: '2026-12-30' }),
      item({ id: '6', status: 'IN_PROGRESS', due: '2026-11-12' }),
    ]
    assert.deepEqual(sortFeatures(items).map((i) => i.id), ['3', '1', '2'])
    assert.deepEqual(activeItems(items).map((i) => i.id), ['5', '6', '4'])
  })

  it('calcule les chiffres et la prochaine échéance', () => {
    const items = [
      item({ id: '1', type: 'FEATURE', status: 'CLOSED', hours_spent: 6, hours_estimated: 5, due: '2026-11-11' }),
      item({ id: '2', type: 'FEATURE', status: 'IN_PROGRESS', hours_spent: 2.25, hours_estimated: 10, due: '2026-11-25' }),
      item({ id: '3', status: 'BLOCKED', hours_spent: 1, due: '2026-11-15' }),
      item({ id: '4', type: 'FEATURE', status: 'REJECTED', hours_spent: 0.5, hours_estimated: 40 }),
    ]
    const kpis = computeKpis(items, [{ id: 'm', name: 'Recette', date: '2026-11-20', reached: false }], '2026-11-10')
    assert.deepEqual(kpis, {
      hours_spent: 9.75,
      hours_estimated: 15,
      features_total: 2,
      features_done: 1,
      active: 2,
      blocked: 1,
      next_due: { label: 'Élément', date: '2026-11-15', kind: 'item' },
    })
  })
})

describe('agents pertinents', () => {
  const agents = [
    { name: 'orchestrateur', toolsets: ['core', 'delegation', 'data_via', 'projets_read', 'tab'] },
    { name: 'data_analyst', toolsets: ['core', 'data_via', 'tab'] },
    { name: 'chef_de_projet', toolsets: ['core', 'projets_read', 'projets_write', 'tab', 'tab_projets'] },
    { name: 'redacteur', toolsets: ['core'] },
    { name: 'finance', toolsets: ['core', 'tresorerie'] },
  ]

  it('explique ce que l’agent couvre', () => {
    assert.deepEqual(agentReasons(agents[1]!, ['projets', 'viz', 'tab', 'convert']), ['viz', 'tab', 'convert'])
    assert.deepEqual(agentReasons(agents[3]!, ['wiki']), ['wiki'])
  })

  it('classe par couverture, le plus spécialisé d’abord, épinglés devant, sans les hors-sujet', () => {
    const ranked = rankAgents(agents, ['projets', 'viz', 'tab'], ['redacteur'])
    assert.deepEqual(
      ranked.map((r) => [r.agent.name, r.score, r.pinned]),
      [
        ['redacteur', 0, true],
        ['orchestrateur', 3, false],
        ['data_analyst', 2, false],
        ['chef_de_projet', 2, false],
      ],
    )
  })
})

describe('exemples de la suite', () => {
  const info = { id: 'studio-garance', title: 'Studio Garance', subtitle: 'Clôture', sector: 'Compta', summary: 'Un studio clôture son mois.' }
  const ui = { projets: 'http://p', wiki: 'http://w', viz: 'http://v', convert: 'http://c', nexus: 'http://n', tab: 'http://t' }
  const down = { ok: false as const, message: 'Atelier X ne répond pas' }
  const reads = (over: Partial<SuiteExamples>): SuiteExamples => ({ projets: down, wiki: down, viz: down, convert: down, nexus: down, tab: { ok: true, value: null }, ...over })
  const app = (stories: ReturnType<typeof assembleExamples>, id: string) => stories[0]!.story.apps.find((a) => a.app === id)!

  it('reconnaît les conversions d’une histoire à son titre, en mots entiers, sans casse ni accents', () => {
    const stories = assembleExamples(
      reads({ convert: { ok: true, value: { stories: [info], conversions: ['Relevé octobre 2026 — STUDIO GARANCE', 'Studio Garancebis', 'Studio de Garance', 'releve_studio_garance.pdf'] } } }),
      ui,
    )
    assert.deepEqual([app(stories, 'convert').state, app(stories, 'convert').detail], ['loaded', '2 conversions'])
    assert.deepEqual(stories[0]!.bindings, {}, 'des conversions ne rattachent rien : la fiche les trouve par mots-clés')
  })

  it('une histoire qu’une app ne livre pas n’y est pas « à charger » sans le dire', () => {
    const other = { ...info, id: 'autre', title: 'Autre' }
    const stories = assembleExamples(
      reads({
        wiki: { ok: true, value: [{ ...info, loaded: false, space_id: null, space_name: null, page_id: null }] },
        viz: { ok: true, value: [{ ...other, loaded: true, datasets: 2 }] },
      }),
      ui,
    )
    assert.deepEqual(stories.map((s) => s.story.id), ['autre', 'studio-garance'])
    const garance = stories[1]!.story.apps
    assert.deepEqual([garance.find((a) => a.app === 'viz')!.state, garance.find((a) => a.app === 'viz')!.detail], ['absent', 'Cette histoire n’est pas livrée avec cette app'])
    assert.deepEqual([garance.find((a) => a.app === 'wiki')!.state, garance.find((a) => a.app === 'wiki')!.detail], ['absent', null])
  })

  it('ne rattache que par identifiant : une app qui dit « chargé » sans identifiant ne rattache rien', () => {
    const stories = assembleExamples(
      reads({
        projets: { ok: true, value: [{ ...info, loaded: true, project_id: null, project_name: 'Gestion 2026' }] },
        tab: { ok: true, value: [{ table_id: 'tbl_ex_studio-garance_0', project: 'Compta 2026' }, { table_id: 'tbl_ex_studio-garance-bis_0', project: 'Autre' }] },
      }),
      ui,
    )
    assert.deepEqual(stories[0]!.bindings, { tab_project: 'Compta 2026' })
    assert.equal(app(stories, 'projets').url, 'http://p/')
    assert.equal(app(stories, 'tab').detail, 'Projet «\u00a0Compta 2026\u00a0» · 1 table')
    assert.equal(isCurrent({ projets_id: null, wiki_space_id: null, tab_project: 'compta 2026' }, stories[0]!.bindings), true)
    assert.equal(isCurrent({ projets_id: '4', wiki_space_id: null, tab_project: null }, stories[0]!.bindings), false)
  })

  it('la fiche d’une histoire prend son titre pour nom et pour mot-clé', () => {
    assert.deepEqual(exampleProjectInput(info, { projets_id: '12', projets_name: 'Gestion' }), {
      name: 'Studio Garance',
      description: 'Un studio clôture son mois. Exemple de la suite Atelier (données fictives).',
      keywords: 'Studio Garance',
      projets_id: '12',
      projets_name: 'Gestion',
    })
  })
})

describe('base', () => {
  it('une base d’avant les exemples reçoit la colonne sans perdre ses fiches', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '',
      projets_id TEXT, projets_name TEXT, wiki_space_id TEXT, wiki_space TEXT, tab_project TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO projects (slug, name, created_at, updated_at) VALUES ('kpi-cgo', 'KPI CGO', '2026-11-01', '2026-11-01');`)
    db.pragma('user_version = 1')
    migrate(db)
    assert.deepEqual(db.prepare('SELECT name, example FROM projects').all(), [{ name: 'KPI CGO', example: null }])
    assert.equal(findExampleProject(db, 'studio-garance'), null)
    db.prepare(`INSERT INTO projects (slug, name, example, created_at, updated_at) VALUES ('a', 'A', 'studio-garance', '', '')`).run()
    assert.throws(() => db.prepare(`INSERT INTO projects (slug, name, example, created_at, updated_at) VALUES ('b', 'B', 'studio-garance', '', '')`).run(), /UNIQUE/)
  })
})
