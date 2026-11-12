import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { capitalized, countText, hoursText, localDay, longDate, monthYear, NBSP, percentText, percentValue, pluralText, quoted, shortDate, shortened, SOURCE_KIND_TEXT, STATUS_TEXT, TYPE_TEXT } from '../src/domain/french.js'
import { buildPlan, defaultTitle, PLAN_LIMITS } from '../src/domain/plan.js'
import { KIND_INFO, resolveDeck, resolveSlide, TITLE_TEXT_MAX } from '../src/domain/slides.js'
import { SLIDE_KINDS, SOURCE_KINDS, type HubProject, type Overview, type SlideKind, type SlideLive, type SlideRecord } from '../src/domain/types.js'
import { LINK_KINDS } from '../src/services/projects.js'
import { kpiCgo, startHub } from './fixtures/hub.js'

// Séparateur de milliers de `toLocaleString('fr-FR')` : espace fine insécable.
const FINE = ' '
/** Écrit les unités comme le Hub : « 42 h » et « 63 % » avec une espace insécable (jamais coupés en fin de ligne). */
const nb = (text: string) => text.replace(/(\d) (h|%)/g, `$1${NBSP}$2`)

describe('mise en forme française', () => {
  it('écrit les heures, les nombres et les pourcentages comme la fiche', () => {
    assert.equal(NBSP, '\u00a0')
    assert.equal(hoursText(42), '42\u00a0h')
    assert.equal(hoursText(42.5), '42,5\u00a0h')
    assert.equal(hoursText(67.49), '67,5\u00a0h')
    assert.equal(hoursText(0), '0\u00a0h')
    assert.equal(countText(1240), `1${FINE}240`)
    assert.equal(countText(7), '7')
    assert.equal(percentText(5, 8), '63\u00a0%')
    assert.equal(percentText(0, 8), '0\u00a0%')
    assert.equal(percentValue(69.6), '70\u00a0%')
    // Un nombre et son unité ne se séparent jamais en fin de ligne : aucune espace ordinaire entre eux.
    for (const text of [hoursText(1240.5), percentText(2, 3)!, percentValue(100)]) assert.doesNotMatch(text, /\d [h%]/)
    assert.equal(percentText(3, 0), null)
    assert.equal(percentText(3, -1), null)
  })

  it('écrit les dates en toutes lettres, sans date relative', () => {
    assert.equal(longDate('2026-12-15'), '15 décembre 2026')
    assert.equal(longDate('2026-03-01'), '1er mars 2026')
    assert.equal(longDate('2026-11-09T12:00:00Z'), '9 novembre 2026')
    assert.equal(shortDate('2026-11-26'), '26 nov. 2026')
    assert.equal(monthYear('2026-11-10'), 'novembre 2026')
    assert.equal(monthYear('2026-08-31'), 'août 2026')
    assert.equal(localDay('2026-11-26'), '2026-11-26')
    assert.equal(localDay('2026-11-09T12:00:00Z'), '2026-11-09')
    assert.equal(localDay('pas une date du tout'), 'pas une da')
    assert.equal(longDate('bientôt'), 'bientôt')
    assert.equal(defaultTitle('KPI CGO', '2026-11-10'), 'KPI CGO — novembre 2026')
    assert.equal(defaultTitle('KPI CGO', '2026-11-10', 120), 'KPI CGO — novembre 2026')
    assert.equal(defaultTitle('Contrôle de gestion', '2026-11-10', 30), 'Contrôle de g… — novembre 2026')
    assert.equal(defaultTitle('x'.repeat(120), '2026-11-10', 120).length, 120)
  })

  it('accorde, cite et coupe', () => {
    assert.equal(pluralText(0, 'page', 'pages'), '0 page')
    assert.equal(pluralText(1, 'page', 'pages'), '1 page')
    assert.equal(pluralText(6, 'page', 'pages'), '6 pages')
    assert.equal(pluralText(5320, 'ligne', 'lignes'), `5${FINE}320 lignes`)
    assert.equal(quoted('Recette'), '« Recette »')
    assert.equal(quoted('  Sur\ndeux   lignes '), '« Sur deux lignes »')
    assert.equal(quoted('abcdefghij', 5), '« abcd… »')
    assert.equal(quoted('x'.repeat(80)), `« ${'x'.repeat(80)} »`)
    assert.equal(shortened('  Interface KPI  ', 300), 'Interface KPI')
    assert.equal(shortened('Un deux trois quatre', 12), 'Un deux…')
    assert.equal(shortened('Un deux, trois quatre', 10), 'Un deux…')
    assert.equal(shortened('x'.repeat(30), 10), `${'x'.repeat(9)}…`)
    assert.equal(shortened('Premier paragraphe.\n\nSecond.', 300), 'Premier paragraphe.\n\nSecond.')
    assert.ok(shortened('mot '.repeat(500), 300).length <= 300)
    assert.equal(quoted('x'.repeat(81)), `« ${'x'.repeat(79)}… »`)
    assert.equal(capitalized('modifié le 9'), 'Modifié le 9')
    assert.equal(capitalized(''), '')
  })

  it('nomme les 8 statuts, les types et les sortes de source', () => {
    assert.deepEqual(Object.keys(STATUS_TEXT), ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'ON_HOLD', 'BLOCKED', 'RESOLVED', 'CLOSED', 'REJECTED'])
    assert.equal(STATUS_TEXT.CLOSED, 'Terminée')
    assert.deepEqual(TYPE_TEXT, { FEATURE: 'Feature', TASK: 'Tâche', BUG: 'Bug' })
    assert.deepEqual(Object.keys(SOURCE_KIND_TEXT).sort(), [...SOURCE_KINDS].sort())
    assert.deepEqual(SOURCE_KIND_TEXT.database, ['base de données', 'bases de données'])
  })
})

describe('sortes de diapositives', () => {
  it('chaque sorte est décrite ; un élément visé est d’une sorte que la fiche sait épingler', () => {
    assert.deepEqual(Object.keys(KIND_INFO), [...SLIDE_KINDS])
    for (const kind of SLIDE_KINDS) {
      const info = KIND_INFO[kind]
      assert.ok(info.label && info.defaultTitle, kind)
      if (info.refKind) {
        assert.ok(info.app, `${kind} : un élément visé vient d’une app`)
        assert.ok(LINK_KINDS[info.app].includes(info.refKind), `${kind} : ${info.refKind}`)
      }
    }
    assert.deepEqual(SLIDE_KINDS.filter((kind) => KIND_INFO[kind].refKind), ['wiki', 'viz', 'tab', 'convert', 'nexus'])
  })
})

// ─── Partie vivante et plan : sur la vue d'ensemble de la fiche « KPI CGO » du double ─────────────

const record = (kind: SlideKind, more: Partial<SlideRecord> = {}): SlideRecord => ({
  id: 1,
  presentation_id: 1,
  position: 0,
  kind,
  title: null,
  body: null,
  ref: null,
  ref_label: null,
  text_source: 'auto',
  text_model: null,
  text_at: null,
  updated_at: '2026-11-10T08:00:00.000Z',
  ...more,
})

async function kpiOverview(): Promise<Overview> {
  const hub = await startHub()
  const project = await kpiCgo(hub)
  const { status, body } = await hub.call<Overview>('GET', `/api/projects/${project.id}/overview`)
  assert.equal(status, 200)
  return body
}

const TITLE = 'KPI CGO — novembre 2026'
/** Jour de la lecture : celui du Hub de test (`startHub`). */
const TODAY = '2026-11-10'
const live = (overview: Overview, kind: SlideKind, more: Partial<SlideRecord> = {}, today = TODAY) => resolveSlide(record(kind, more), overview, TITLE, today)
const labels = (slide: SlideLive) => slide.rows.map((r) => r.label)
const downPanel = <T extends { state: string; message: string | null }>(panel: T, app: string, items: unknown[] = []) => ({ ...panel, state: 'down' as const, message: `${app} ne répond pas`, items })

describe('plan d’une présentation', () => {
  it('suit la fiche, dans un ordre fixe', async () => {
    const overview = await kpiOverview()
    const plan = buildPlan(overview)
    assert.deepEqual(plan.map((s) => s.kind), ['title', 'summary', 'kpis', 'features', 'active', 'milestones', 'wiki', 'viz', 'tab', 'convert', 'nexus', 'sources'])
    assert.ok(plan.every((s) => s.ref === null && s.ref_label === null))
  })

  it('donne sa diapositive à un rapport épinglé, trois au plus', async () => {
    const overview = await kpiOverview()
    const report = (n: number, pinned: boolean) => ({ id: `r${n}`, name: `Rapport ${n}`, detail: null, updated_at: null, url: `http://viz/r${n}`, pinned })
    const one = buildPlan({ ...overview, viz: { ...overview.viz, items: [report(1, true), report(2, false)] } })
    assert.deepEqual(one.filter((s) => s.kind === 'viz'), [
      { kind: 'viz', ref: null, ref_label: null },
      { kind: 'viz', ref: 'r1', ref_label: 'Rapport 1' },
    ])
    assert.equal(one[one.findIndex((s) => s.ref === 'r1') + 1]!.kind, 'tab')
    const many = buildPlan({ ...overview, viz: { ...overview.viz, items: [1, 2, 3, 4, 5].map((n) => report(n, n !== 5)) } })
    assert.equal(PLAN_LIMITS.pinnedReports, 3)
    assert.deepEqual(many.filter((s) => s.kind === 'viz').map((s) => s.ref), [null, 'r1', 'r2', 'r3'])
  })

  it('une fiche sans rattachement donne le titre et la synthèse', async () => {
    const hub = await startHub()
    const project = (await hub.call<HubProject>('POST', '/api/projects', { name: 'Clôture annuelle 2026' })).body
    const overview = (await hub.call<Overview>('GET', `/api/projects/${project.id}/overview`)).body
    assert.deepEqual(buildPlan(overview).map((s) => s.kind), ['title', 'summary'])
  })

  it('garde la section d’une app arrêtée le jour de la génération', async () => {
    const overview = await kpiOverview()
    const projetsDown = { ...overview, kpis: null, projets: { ...overview.projets, state: 'down' as const, message: 'Atelier Projets ne répond pas', features: [], active: [], milestones: [], items_total: 0 } }
    assert.deepEqual(buildPlan(projetsDown).map((s) => s.kind).slice(0, 6), ['title', 'summary', 'kpis', 'features', 'active', 'milestones'])
    const pinned = { id: 'a1', name: 'Rapport épinglé', detail: null, updated_at: null, url: 'http://viz/a1', pinned: true }
    const down = buildPlan({
      ...overview,
      wiki: downPanel(overview.wiki, 'Atelier Wiki') as Overview['wiki'],
      viz: downPanel(overview.viz, 'Atelier Viz', [pinned]) as Overview['viz'],
      tab: downPanel(overview.tab, 'Atelier Tab') as Overview['tab'],
      convert: downPanel(overview.convert, 'Atelier Convert') as Overview['convert'],
      nexus: downPanel(overview.nexus, 'Atelier Nexus') as Overview['nexus'],
    })
    // Wiki, Viz (avec son rapport épinglé, gardé par la fiche) et Tab restent ; Convert et Nexus n'entrent qu'avec des éléments.
    assert.deepEqual(down.map((s) => s.kind), ['title', 'summary', 'kpis', 'features', 'active', 'milestones', 'wiki', 'viz', 'viz', 'tab', 'sources'])
    assert.deepEqual(down.find((s) => s.ref !== null), { kind: 'viz', ref: 'a1', ref_label: 'Rapport épinglé' })
    // Une app éteinte sans rien de rattaché (off) ne fait pas de section.
    const off = buildPlan({ ...overview, wiki: { ...overview.wiki, state: 'off', message: 'Rattache un espace du Wiki ou épingle des pages.', items: [] } })
    assert.ok(!off.some((s) => s.kind === 'wiki'))
  })
})

describe('partie vivante d’une diapositive', () => {
  it('titre : le titre de la présentation et la description de la fiche', async () => {
    const overview = await kpiOverview()
    const slide = live(overview, 'title')
    assert.deepEqual([slide.state, slide.auto_title, slide.auto_text, slide.app, slide.url], ['ok', TITLE, 'Interface KPI du contrôle de gestion', null, null])
    const bare = live({ ...overview, project: { ...overview.project, description: '  ' } }, 'title')
    assert.equal(bare.auto_text, 'Présentation du projet KPI CGO.')
    // Une longue description (la fiche en admet 2 000 caractères) est coupée à la fin d'un mot : elle sortirait de la diapositive.
    const long = live({ ...overview, project: { ...overview.project, description: 'Suivi des indicateurs du contrôle de gestion. '.repeat(40) } }, 'title')
    assert.ok(long.auto_text.length <= TITLE_TEXT_MAX, String(long.auto_text.length))
    assert.match(long.auto_text, /^Suivi des indicateurs du contrôle de gestion\. .*[a-zé]…$/)
    const short = 'Suivi des indicateurs. '.repeat(13).trim()
    assert.equal(live({ ...overview, project: { ...overview.project, description: short } }, 'title').auto_text, short)
  })

  it('synthèse : avancement, blocages, prochaine échéance, ce qui est rattaché', async () => {
    const overview = await kpiOverview()
    const slide = live(overview, 'summary')
    assert.equal(slide.auto_title, 'Synthèse')
    assert.deepEqual(slide.auto_text.split('\n'), [
      nb('- Avancement : 2 features terminées sur 6 (33 %).'),
      '- 6 éléments en cours, dont 1 bloqué.',
      '- Prochaine échéance : « Écart d’arrondi sur le total trimestriel », le 13 novembre 2026.',
      '- 5 pages, 2 rapports, 3 tables, 2 conversions, 7 sources.',
    ])
    assert.deepEqual([slide.figures, slide.rows, slide.state], [[], [], 'ok'])
    const down = live({ ...overview, kpis: null, projets: { ...overview.projets, state: 'down' }, viz: downPanel(overview.viz, 'Atelier Viz') as Overview['viz'] }, 'summary')
    assert.deepEqual(down.auto_text.split('\n'), [
      '- 5 pages, 3 tables, 2 conversions, 7 sources.',
      '- Atelier Projets et Atelier Viz n’ont pas pu être lus : leurs chiffres manquent ici.',
    ])
    assert.equal(down.state, 'ok')
    const one = live({ ...overview, kpis: null, projets: { ...overview.projets, state: 'down' } }, 'summary')
    assert.match(one.auto_text, /- Atelier Projets n’a pas pu être lu : ses chiffres manquent ici\.$/)
  })

  it('chiffres clés : les quatre cartes de la fiche et leur phrase', async () => {
    const overview = await kpiOverview()
    const slide = live(overview, 'kpis')
    assert.deepEqual(slide.figures, [
      { label: 'Temps passé', value: nb('66,5 h'), note: nb('sur 100 h estimées · 67 %'), warn: false },
      { label: 'Features', value: '2 / 6', note: 'terminées', warn: false },
      { label: 'En cours', value: '6', note: 'dont 1 bloquée', warn: true },
      { label: 'Prochaine échéance', value: '13 nov. 2026', note: 'Écart d’arrondi sur le total trimestriel', warn: false },
    ])
    assert.equal(slide.auto_text, nb('2 features terminées sur 6 (33 %). 66,5 h passées sur 100 h estimées (67 %).'))
    assert.deepEqual([slide.auto_title, slide.app, slide.url, slide.url_label], ['Chiffres clés', 'projets', 'http://127.0.0.1:4174/?projet=4', 'Ouvrir le projet dans Atelier Projets'])
    assert.deepEqual(slide.rows, [])

    const quiet = live({ ...overview, kpis: { hours_spent: 1.5, hours_estimated: 0, features_total: 3, features_done: 0, active: 0, blocked: 0, next_due: { label: 'Recette', date: '2026-12-01', kind: 'milestone' } } }, 'kpis')
    assert.deepEqual(quiet.figures.map((f) => [f.value, f.note, f.warn]), [
      [nb('1,5 h'), 'aucune estimation', false],
      ['0 / 3', 'terminées', false],
      ['0', 'rien de bloqué', false],
      ['1 déc. 2026', 'jalon Recette', false],
    ])
    assert.equal(quiet.auto_text, nb('Aucune feature terminée sur 3. 1,5 h passée, sans estimation.'))
    const empty = live({ ...overview, kpis: { hours_spent: 0, hours_estimated: 0, features_total: 0, features_done: 0, active: 0, blocked: 0, next_due: null } }, 'kpis')
    assert.deepEqual([empty.figures[3]!.value, empty.figures[3]!.note, empty.auto_text], ['—', 'aucune date à venir', 'Aucun chiffre pour l’instant.'])
  })

  it('features, en cours, jalons : les lignes de Projets', async () => {
    const overview = await kpiOverview()
    const features = live(overview, 'features')
    assert.equal(features.auto_text, '6 features : 2 terminées, 2 en cours, 2 à faire.')
    assert.equal(features.rows.length, 6)
    assert.deepEqual(features.rows[2], {
      id: '103',
      label: 'Tableau de bord mensuel',
      detail: nb('70 % · 18,5 h / 24 h'),
      date: '2026-11-21',
      status: 'IN_PROGRESS',
      url: 'http://127.0.0.1:4174/?projet=4&element=103',
    })
    assert.equal(features.more, 0)

    const active = live(overview, 'active')
    assert.equal(active.auto_title, 'En cours et points de blocage')
    assert.equal(active.auto_text, '6 éléments en cours, dont 1 bloqué : « Seuils d’alerte par centre de coût ».')
    assert.deepEqual([active.rows[0]!.label, active.rows[0]!.detail, active.rows[0]!.status], ['Seuils d’alerte par centre de coût', 'Tâche', 'BLOCKED'])
    assert.equal(active.rows[2]!.detail, 'Bug')
    const calm = live({ ...overview, projets: { ...overview.projets, active: overview.projets.active.filter((i) => i.status !== 'BLOCKED').slice(0, 1) } }, 'active')
    assert.equal(calm.auto_text, '1 élément en cours. Rien n’est bloqué.')

    const milestones = live(overview, 'milestones')
    assert.equal(milestones.auto_text, 'Prochain jalon : « Comité de pilotage », le 26 novembre 2026. 1 jalon atteint sur 3.')
    assert.deepEqual(milestones.rows.map((r) => [r.label, r.detail, r.date, r.status, r.url]), [
      ['Cadrage validé', 'atteint', '2026-10-03', null, null],
      ['Comité de pilotage', null, '2026-11-26', null, null],
      ['Mise en production', null, '2026-12-15', null, null],
    ])
    const reached = live({ ...overview, projets: { ...overview.projets, milestones: overview.projets.milestones.map((m) => ({ ...m, reached: true })) } }, 'milestones')
    assert.equal(reached.auto_text, '3 jalons atteints sur 3.')

    // « Prochain jalon » est le premier jalon non atteint à venir, comme la prochaine échéance des chiffres clés : un
    // jalon dépassé sans avoir été coché est dit en retard, à part, et un jalon sans date n'est jamais « prochain ».
    const withMilestones = (list: Overview['projets']['milestones']) => ({ ...overview, projets: { ...overview.projets, milestones: list } })
    const unreached = overview.projets.milestones.map((m) => ({ ...m, reached: false }))
    const late = live(withMilestones(unreached), 'milestones')
    assert.equal(late.auto_text, 'Prochain jalon : « Comité de pilotage », le 26 novembre 2026. 1 jalon en retard : « Cadrage validé », prévu le 3 octobre 2026. Aucun jalon atteint sur 3.')
    // Le jour même, le jalon du 26 novembre est encore le prochain ; le lendemain, il est en retard à son tour.
    assert.match(live(withMilestones(unreached), 'milestones', {}, '2026-11-26').auto_text, /^Prochain jalon : « Comité de pilotage », le 26 novembre 2026\. 1 jalon en retard/)
    assert.equal(
      live(withMilestones(unreached), 'milestones', {}, '2026-11-27').auto_text,
      'Prochain jalon : « Mise en production », le 15 décembre 2026. 2 jalons en retard : « Cadrage validé », prévu le 3 octobre 2026, et 1 autre. Aucun jalon atteint sur 3.',
    )
    assert.equal(live(withMilestones(unreached), 'milestones', {}, '2027-01-04').auto_text, '3 jalons en retard : « Cadrage validé », prévu le 3 octobre 2026, et 2 autres. Aucun jalon atteint sur 3.')
    const noDate = { id: 'm0', name: 'Sans date', date: null, reached: false }
    const undated = live(withMilestones([noDate, ...overview.projets.milestones]), 'milestones')
    assert.equal(undated.auto_text, 'Prochain jalon : « Comité de pilotage », le 26 novembre 2026. 1 jalon atteint sur 4.')
    assert.equal(undated.rows[0]!.label, 'Sans date')
    assert.equal(live(withMilestones([noDate]), 'milestones').auto_text, 'Aucun jalon atteint sur 1.')
  })

  it('liste : six lignes au plus, le reste compté ; liste vide dite', async () => {
    const overview = await kpiOverview()
    const page = (n: number) => ({ id: `p${n}`, title: `Page ${n}`, space: 'KPI CGO', excerpt: null, updated_at: `2026-11-0${n}T12:00:00Z`, url: `http://127.0.0.1:3200/p/p${n}`, pinned: false })
    const long = live({ ...overview, wiki: { ...overview.wiki, items: [1, 2, 3, 4, 5, 6, 7, 8].map(page) } }, 'wiki')
    assert.equal(long.rows.length, 6)
    assert.equal(long.more, 2)
    assert.equal(long.auto_text, '8 pages ; la plus récente : « Page 8 ».')
    const none = live({ ...overview, viz: { ...overview.viz, items: [] } }, 'viz')
    assert.deepEqual([none.state, none.rows, none.more, none.auto_text], ['ok', [], 0, 'Aucun rapport rattaché pour l’instant.'])
    const noAgent = live({ ...overview, nexus: { ...overview.nexus, items: [], message: 'Aucun agent ne lit encore les apps de cette fiche.' } }, 'nexus')
    assert.equal(noAgent.auto_text, 'Aucun agent ne lit encore les apps de cette fiche.')
  })

  it('wiki, viz, tab, convert, nexus : listes et liens vers l’app', async () => {
    const overview = await kpiOverview()
    const wiki = live(overview, 'wiki')
    assert.deepEqual([wiki.auto_title, wiki.app, wiki.url, wiki.url_label], ['Documentation', 'wiki', 'http://127.0.0.1:3200/', 'Ouvrir Atelier Wiki'])
    assert.equal(wiki.auto_text, '5 pages ; la plus récente : « Dictionnaire des indicateurs ».')
    assert.deepEqual(wiki.rows[0], { id: '41', label: 'Dictionnaire des indicateurs', detail: null, date: '2026-11-09T16:20:00+01:00', status: null, url: 'http://127.0.0.1:3200/p/41' })

    const viz = live(overview, 'viz')
    assert.equal(viz.auto_text, '2 rapports dans Atelier Viz ; le plus récent : « KPI CGO — Tableau mensuel ».')
    assert.deepEqual([viz.rows[0]!.detail, viz.rows[0]!.url, viz.url, viz.url_label], ['3 pages · 18 visuels', 'http://127.0.0.1:8000/#/rapports/a1b2c3d4e5f6', 'http://127.0.0.1:8000/#/', 'Ouvrir Atelier Viz'])
    assert.deepEqual(viz.figures, [])

    const tab = live(overview, 'tab')
    assert.equal(tab.auto_text, `3 tables, 1${FINE}756 lignes au total.`)
    assert.deepEqual(labels(tab), ['Réalisé mensuel', 'Budget 2026 par centre de coût', 'Référentiel des centres'])
    assert.deepEqual([tab.rows[1]!.detail, tab.rows[1]!.url, tab.url, tab.url_label], ['KPI CGO · 412 lignes', null, 'http://127.0.0.1:4175/', 'Ouvrir Atelier Tab'])

    const convert = live(overview, 'convert')
    assert.equal(convert.auto_text, `2 conversions ; la dernière : « Extraction SAP octobre », 1${FINE}280 lignes.`)
    assert.match(convert.rows[0]!.detail ?? '', /^Classeur Excel · .* · → Réalisé mensuel$/)
    assert.equal(convert.url_label, 'Ouvrir Atelier Convert')

    const nexus = live(overview, 'nexus')
    assert.equal(nexus.auto_text, `${overview.nexus.items.length} agents savent lire les apps de ce projet.`)
    assert.equal(nexus.rows.length, 6)
    assert.equal(nexus.more, overview.nexus.items.length - 6)
    assert.deepEqual([nexus.rows[0]!.id, nexus.rows[0]!.label, nexus.rows[0]!.detail, nexus.rows[0]!.url], ['data_analyst', 'Data Analyst / Power BI', 'Lit Viz, Tab, Convert', 'http://127.0.0.1:3100/?agent=data_analyst'])
    const single = live({ ...overview, nexus: { ...overview.nexus, items: overview.nexus.items.slice(0, 1) } }, 'nexus')
    assert.equal(single.auto_text, '1 agent sait lire les apps de ce projet.')
  })

  it('élément visé : son nom relu dans l’app, son lien, ses chiffres', async () => {
    const overview = await kpiOverview()
    const report = live(overview, 'viz', { ref: 'a1b2c3d4e5f6', ref_label: 'Ancien nom du rapport' })
    assert.deepEqual([report.state, report.auto_title, report.url, report.url_label], ['ok', 'KPI CGO — Tableau mensuel', 'http://127.0.0.1:8000/#/rapports/a1b2c3d4e5f6', 'Ouvrir le rapport dans Atelier Viz'])
    assert.equal(report.auto_text, '3 pages · 18 visuels, modifié le 9 novembre 2026.')
    assert.deepEqual([report.rows, report.figures], [[], []])

    const page = live(overview, 'wiki', { ref: '41', ref_label: 'Dictionnaire' })
    assert.deepEqual([page.auto_title, page.url, page.url_label], ['Dictionnaire des indicateurs', 'http://127.0.0.1:3200/p/41', 'Ouvrir la page dans Atelier Wiki'])
    assert.equal(page.auto_text, 'Page de l’espace « KPI CGO », modifiée le 9 novembre 2026.')
    const excerpt = { ...overview, wiki: { ...overview.wiki, items: overview.wiki.items.map((p) => ({ ...p, excerpt: 'Chaque indicateur, sa formule et sa source.' })) } }
    assert.equal(live(excerpt, 'wiki', { ref: '41', ref_label: 'Dictionnaire' }).auto_text, 'Chaque indicateur, sa formule et sa source.')

    const table = live(overview, 'tab', { ref: 't-budget', ref_label: 'Budget' })
    assert.deepEqual(table.figures, [{ label: 'Lignes', value: '412', note: null, warn: false }])
    assert.deepEqual([table.auto_title, table.url, table.url_label], ['Budget 2026 par centre de coût', 'http://127.0.0.1:4175/', 'Ouvrir Atelier Tab'])
    assert.equal(table.auto_text, 'Table du projet « KPI CGO » : 412 lignes, modifiée le 8 novembre 2026.')

    const conversion = live(overview, 'convert', { ref: 'c00000000001', ref_label: 'Extraction' })
    assert.deepEqual(conversion.figures, [{ label: 'Lignes', value: `1${FINE}280`, note: null, warn: false }])
    assert.deepEqual([conversion.auto_title, conversion.url, conversion.url_label], ['Extraction SAP octobre', 'http://127.0.0.1:8010/#/conversions/c00000000001', 'Ouvrir la conversion dans Atelier Convert'])
    assert.match(conversion.auto_text, /^Classeur Excel · .*, convertie le 4 novembre 2026\. Envoyée vers la table « Réalisé mensuel »\.$/)

    const agent = live(overview, 'nexus', { ref: 'data_analyst', ref_label: 'Analyste' })
    assert.deepEqual([agent.auto_title, agent.url, agent.url_label], ['Data Analyst / Power BI', 'http://127.0.0.1:3100/?agent=data_analyst', 'Ouvrir l’agent dans Atelier Nexus'])
    assert.equal(agent.auto_text, 'Exploration des données, DAX, modèle en étoile. Lit Viz, Tab, Convert.')
  })

  it('élément absent d’un panneau qui répond : « missing », sans rien inventer', async () => {
    const overview = await kpiOverview()
    const slide = live(overview, 'viz', { ref: 'zzz', ref_label: 'Ancien rapport' })
    assert.equal(slide.state, 'missing')
    assert.equal(slide.message, '« Ancien rapport » n’est plus rattaché à cette fiche, ou n’existe plus dans Atelier Viz.')
    assert.deepEqual([slide.auto_title, slide.auto_text, slide.rows, slide.figures], ['Ancien rapport', '', [], []])
    assert.deepEqual([slide.url, slide.url_label], ['http://127.0.0.1:8000/#/', 'Ouvrir Atelier Viz'])
  })

  it('app arrêtée : la diapositive le dit et garde les libellés de la fiche', async () => {
    const overview = await kpiOverview()
    const pinned = { id: 'a1b2c3d4e5f6', name: 'KPI CGO — Tableau mensuel', detail: null, updated_at: null, url: 'http://127.0.0.1:8000/#/rapports/a1b2c3d4e5f6', pinned: true }
    const down = { ...overview, kpis: null, projets: { ...overview.projets, state: 'down' as const, message: 'Atelier Projets ne répond pas', features: [], active: [], milestones: [] }, viz: downPanel(overview.viz, 'Atelier Viz', [pinned]) as Overview['viz'] }
    for (const kind of ['kpis', 'features', 'active', 'milestones'] as const) {
      const slide = live(down, kind)
      assert.deepEqual([slide.state, slide.message, slide.auto_text, slide.figures, slide.rows], ['down', 'Atelier Projets ne répond pas', '', [], []], kind)
      assert.equal(slide.auto_title, KIND_INFO[kind].defaultTitle)
      assert.equal(slide.url, 'http://127.0.0.1:4174/?projet=4')
    }
    const list = live(down, 'viz')
    assert.deepEqual([list.state, list.message, list.auto_text], ['down', 'Atelier Viz ne répond pas', ''])
    assert.deepEqual(list.rows, [{ id: 'a1b2c3d4e5f6', label: 'KPI CGO — Tableau mensuel', detail: null, date: null, status: null, url: null }])
    const element = live(down, 'viz', { ref: 'b2c3d4e5f6a1', ref_label: 'KPI CGO — Écarts budgétaires' })
    assert.deepEqual([element.state, element.auto_title, element.auto_text], ['down', 'KPI CGO — Écarts budgétaires', ''])
    assert.deepEqual(element.rows, [{ id: 'b2c3d4e5f6a1', label: 'KPI CGO — Écarts budgétaires', detail: null, date: null, status: null, url: null }])
    assert.deepEqual([element.url, element.url_label], ['http://127.0.0.1:8000/#/', 'Ouvrir Atelier Viz'])
  })

  it('rien de rattaché : « off », avec le message du panneau', async () => {
    const hub = await startHub()
    const project = (await hub.call<HubProject>('POST', '/api/projects', { name: 'Clôture annuelle 2026' })).body
    const overview = (await hub.call<Overview>('GET', `/api/projects/${project.id}/overview`)).body
    const slide = live(overview, 'kpis')
    assert.deepEqual([slide.state, slide.message, slide.url_label], ['off', 'Aucun projet d’Atelier Projets n’est rattaché à cette fiche.', 'Ouvrir Atelier Projets'])
    assert.deepEqual([slide.figures, slide.auto_text], [[], ''])
    assert.equal(live(overview, 'features').state, 'off')
    assert.equal(live(overview, 'summary').auto_text, 'Rien n’est encore rattaché à cette fiche.')
    assert.equal(live(overview, 'sources').auto_text, 'Aucune source rattachée pour l’instant.')
  })

  it('sources : la sorte et le lien web, jamais l’emplacement ni la note', async () => {
    const overview = await kpiOverview()
    const slide = live(overview, 'sources')
    assert.deepEqual([slide.state, slide.app, slide.url], ['ok', null, null])
    assert.equal(slide.auto_text, '7 sources : 3 bases de données, 2 dossiers, 1 dépôt, 1 présentation.')
    assert.deepEqual([slide.rows.length, slide.more], [6, 1])
    assert.deepEqual(slide.rows.slice(0, 3).map((r) => [r.label, r.detail, r.url]), [
      ['Support du comité', 'Présentation', 'https://exemple.fr/comite.pptx'],
      ['Entrepôt BW — rentabilité', 'Base de données', null],
      ['Extractions brutes', 'Dossier', null],
    ])
    assert.ok(overview.sources.items.some((s) => s.location.includes('~/Documents/CGO')), 'la fiche, elle, connaît l’emplacement')
    const text = JSON.stringify(slide)
    for (const secret of ['~/Documents', '0COPA_C01', '~/Projets', 'Extraction mensuelle']) assert.ok(!text.includes(secret), secret)
  })

  it('texte libre : aucune donnée vivante', async () => {
    const overview = await kpiOverview()
    const slide = live(overview, 'text')
    assert.deepEqual(slide, { state: 'none', message: null, app: null, url: null, url_label: null, figures: [], rows: [], more: 0, auto_title: 'Texte', auto_text: '' })
  })

  it('présentation résolue : chaque diapositive enregistrée et sa partie vivante', async () => {
    const overview = await kpiOverview()
    const presentation = { id: 3, project_id: overview.project.id, title: TITLE, slides: 2, created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z' }
    const records = [record('title', { id: 1, position: 0 }), record('kpis', { id: 2, position: 1, title: 'Où en est-on ?', body: 'Le budget tient.', text_source: 'manual' })]
    const deck = resolveDeck(presentation, records, overview, TODAY)
    assert.deepEqual([deck.presentation, deck.project, deck.generated_at], [presentation, overview.project, overview.generated_at])
    assert.deepEqual(deck.slides.map((s) => [s.id, s.kind, s.title, s.body, s.stale]), [
      [1, 'title', null, null, []],
      [2, 'kpis', 'Où en est-on ?', 'Le budget tient.', []],
    ])
    // Le texte écrit à la main ne remplace rien : la partie vivante reste calculée à côté.
    assert.equal(deck.slides[1]!.live.auto_title, 'Chiffres clés')
    assert.equal(deck.slides[1]!.live.figures.length, 4)
    assert.equal(deck.slides[0]!.live.auto_title, TITLE)
  })
})
