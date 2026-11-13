import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FACT_LIMITS, factsSize, fitFacts, generalFacts, isPageContent, slideFacts, staleNumbers } from '../src/domain/facts.js'
import { NBSP } from '../src/domain/french.js'
import { resolveSlide } from '../src/domain/slides.js'
import { SLIDE_KINDS, type Deck, type Overview, type PresentationSummary, type SlideKind, type SlideRecord } from '../src/domain/types.js'
import { listSlides, writeSlideTexts, type SlideText } from '../src/services/presentations.js'
import { kpiCgo, startHub } from './fixtures/hub.js'
import { WORK_ITEMS } from './fixtures/suite.js'

const nb = (text: string) => text.replace(/(\d) (h|%)/g, `$1${NBSP}$2`)
const TITLE = 'KPI CGO — novembre 2026'
const TODAY = '2026-11-10'

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

const slide = (overview: Overview, kind: SlideKind, more: Partial<SlideRecord> = {}) => {
  const base = record(kind, more)
  return { ...base, live: resolveSlide(base, overview, TITLE, TODAY) }
}
const facts = (overview: Overview, kind: SlideKind, more: Partial<SlideRecord> = {}) => slideFacts(slide(overview, kind, more))

async function kpiOverview(): Promise<Overview> {
  const hub = await startHub()
  const project = await kpiCgo(hub)
  return (await hub.call<Overview>('GET', `/api/projects/${project.id}/overview`)).body
}

describe('faits d’une diapositive', () => {
  it('faits généraux : la fiche, sa description, les chiffres clés', async () => {
    const overview = await kpiOverview()
    assert.deepEqual(generalFacts(overview), [
      'Fiche : KPI CGO',
      'Description : Interface KPI du contrôle de gestion',
      nb('Temps passé : 66,5 h (sur 100 h estimées · 67 %)'),
      'Features : 2 / 6 (terminées)',
      'En cours : 6 (dont 1 bloquée)',
      'Prochaine échéance : 13 nov. 2026 (Écart d’arrondi sur le total trimestriel)',
    ])
    const long = generalFacts({ ...overview, project: { ...overview.project, description: 'Suivi des indicateurs. '.repeat(60) } })
    assert.ok(long[1]!.length <= FACT_LIMITS.perFact, String(long[1]!.length))
    // Projet sans feature : les faits disent ce qu'il contient, jamais « Features : 0 / 0 » (comme la fiche).
    const kpis = { hours_spent: 0, hours_estimated: 0, features_total: 0, features_done: 0, active: 0, blocked: 0, next_due: null }
    const noFeature = { ...overview, kpis, projets: { ...overview.projets, contents: { phases: 1, epics: 1, stories: 1, features: 0, tasks: 1, bugs: 1, hours_spent: 0 } } }
    const general = generalFacts(noFeature)
    assert.ok(general.includes('Éléments : 2 (1 tâche · 1 bug · aucune feature)'), general.join(' | '))
    assert.ok(!general.some((line) => line.startsWith('Features')))
    assert.ok(slideFacts(slide(noFeature, 'kpis')).includes('2 éléments (1 tâche, 1 bug), aucune feature.'))
    // Projets arrêté : pas de chiffres clés ; description vide : pas de ligne.
    assert.deepEqual(generalFacts({ ...overview, kpis: null, projets: { ...overview.projets, state: 'down' }, project: { ...overview.project, description: ' ' } }), ['Fiche : KPI CGO'])
  })

  it('une diapositive : son titre affiché, sa phrase, ses cartes, ses lignes, « et N autres »', async () => {
    const overview = await kpiOverview()
    assert.deepEqual(facts(overview, 'kpis', { title: 'Où en est-on ?' }), [
      'Titre : Où en est-on ?',
      nb('2 features terminées sur 6 (33 %). 66,5 h passées sur 100 h estimées (67 %).'),
      nb('Temps passé : 66,5 h (sur 100 h estimées · 67 %)'),
      'Features : 2 / 6 (terminées)',
      'En cours : 6 (dont 1 bloquée)',
      'Prochaine échéance : 13 nov. 2026 (Écart d’arrondi sur le total trimestriel)',
    ])
    const features = facts(overview, 'features')
    assert.equal(features[0], 'Titre : Avancement des features')
    assert.equal(features[1], '6 features : 2 terminées, 2 en cours, 2 à faire.')
    assert.equal(features[2], nb('« Connexion aux extractions SAP » — Terminée — 100 % · 14 h / 12 h — 16 octobre 2026'))
    assert.equal(features.length, 8)
    // La synthèse : une ligne par fait, sans la puce.
    const summary = facts(overview, 'summary')
    assert.deepEqual(summary.slice(0, 3), ['Titre : Synthèse', nb('Avancement : 2 features terminées sur 6 (33 %).'), '6 éléments en cours, dont 1 bloqué.'])
    const nexus = facts(overview, 'nexus')
    assert.equal(nexus.at(-1), `… et ${overview.nexus.items.length - 6} autre${overview.nexus.items.length - 6 > 1 ? 's' : ''}`)
    assert.equal(facts(overview, 'title')[0], `Titre : ${TITLE}`)
  })

  it('chaque sorte donne des faits bornés ; aucun si l’état n’est pas « ok »', async () => {
    const overview = await kpiOverview()
    for (const kind of SLIDE_KINDS) {
      const list = facts(overview, kind)
      if (kind === 'text') assert.deepEqual(list, [], 'texte libre : rien à commenter')
      else assert.ok(list.length >= 2 && list.length <= 2 + 4 + 6 + 1 + 4, `${kind} : ${list.length}`)
      for (const line of list) assert.ok(line.length <= FACT_LIMITS.perFact && !line.includes('\n'), line)
    }
    const down = { ...overview, viz: { ...overview.viz, state: 'down' as const, message: 'Atelier Viz ne répond pas' } }
    assert.deepEqual(facts(down, 'viz'), [])
    assert.deepEqual(facts(overview, 'viz', { ref: 'disparu', ref_label: 'Ancien rapport' }), [], 'élément disparu')
    assert.deepEqual(facts({ ...overview, tab: { ...overview.tab, state: 'off' as const, message: 'Aucun projet Tab rattaché' } }, 'tab'), [])
  })

  it('ni adresse, ni chemin, ni note de source, ni identifiant dans aucun fait', async () => {
    const overview = await kpiOverview()
    assert.ok(overview.sources.items.some((s) => s.location.includes('~/Documents/CGO')), 'la fiche, elle, connaît l’emplacement')
    const elements: [SlideKind, Partial<SlideRecord>][] = [
      ['viz', { ref: 'a1b2c3d4e5f6', ref_label: 'Rapport' }],
      ['tab', { ref: 't-budget', ref_label: 'Budget' }],
      ['convert', { ref: 'c00000000001', ref_label: 'Extraction' }],
      ['nexus', { ref: 'data_analyst', ref_label: 'Analyste' }],
    ]
    const all = [...generalFacts(overview), ...SLIDE_KINDS.flatMap((kind) => facts(overview, kind)), ...elements.flatMap(([kind, more]) => facts(overview, kind, more))].join('\n')
    for (const secret of ['http', '127.0.0.1', '~/Documents', '0COPA_C01', '~/Projets', 'Extraction mensuelle', 'exemple.fr', 'a1b2c3d4e5f6', 'c00000000001', 't-budget', 'data_analyst', 'FBL3N']) {
      assert.ok(!all.includes(secret), secret)
    }
    assert.match(all, /« Support du comité » — Présentation/)
  })

  it('Wiki : les titres des pages seulement, jamais un extrait de leur contenu', async () => {
    const base = await kpiOverview()
    const overview = { ...base, wiki: { ...base.wiki, items: base.wiki.items.map((p) => ({ ...p, excerpt: 'CONTENU-DE-LA-PAGE : la marge se calcule ainsi.' })) } }
    const list = slide(overview, 'wiki')
    assert.equal(list.live.rows[0]!.detail, 'CONTENU-DE-LA-PAGE : la marge se calcule ainsi.', 'la diapositive, elle, montre l’extrait')
    const wiki = slideFacts(list)
    assert.deepEqual(wiki.slice(0, 3), ['Titre : Documentation', '5 pages ; la plus récente : « Dictionnaire des indicateurs ».', '« Dictionnaire des indicateurs » — 9 novembre 2026'])
    assert.ok(!wiki.join('\n').includes('CONTENU'))
    // Diapositive d'une page : elle n'a que son extrait à montrer → aucun fait, elle n'est pas rédigée.
    const page = slide(overview, 'wiki', { ref: '41', ref_label: 'Dictionnaire' })
    assert.equal(page.live.auto_text, 'CONTENU-DE-LA-PAGE : la marge se calcule ainsi.')
    assert.equal(isPageContent(page), true)
    assert.deepEqual(slideFacts(page), [])
    assert.equal(isPageContent(list), false)
    assert.equal(isPageContent(slide(overview, 'viz', { ref: 'a1b2c3d4e5f6', ref_label: 'Rapport' })), false)
  })

  it('réduit les faits pour tenir dans la taille admise, de façon déterministe', () => {
    const general = ['Fiche : KPI CGO', 'En cours : 6']
    const groups = [
      ['Titre : A', 'a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50)],
      ['Titre : B', 'd'.repeat(30)],
      ['Titre : C', 'e'.repeat(50), 'f'.repeat(50), 'g'.repeat(50)],
    ]
    // Chaque fait compte pour sa ligne « - fait » dans le message.
    const size = (fitted: string[][]) => factsSize([...general, ...fitted.flat()])
    assert.deepEqual(fitFacts(general, groups, 10_000), groups, 'rien à retirer')
    const fitted = fitFacts(general, groups, 300)
    assert.ok(size(fitted) <= 300, String(size(fitted)))
    assert.deepEqual(fitted, fitFacts(general, groups, 300))
    // Le groupe le plus long cède d'abord (le premier à longueur égale), par la fin ; le titre reste toujours.
    assert.deepEqual(fitFacts(general, groups, size(groups.map((g) => [...g])) - 1), [groups[0]!.slice(0, 3), groups[1], groups[2]])
    assert.deepEqual(fitFacts(general, groups, 1), [['Titre : A'], ['Titre : B'], ['Titre : C']])
    assert.deepEqual(groups[0]!.length, 4, 'les groupes reçus ne sont pas modifiés')
  })
})

describe('texte rédigé par une IA', () => {
  async function setup() {
    const hub = await startHub()
    const project = await kpiCgo(hub)
    const created = await hub.call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, {})
    assert.equal(created.status, 201)
    const slides = listSlides(hub.db, created.body.id)
    const of = (kind: SlideKind) => slides.find((s) => s.kind === kind)!
    return { ...hub, project, pid: created.body.id, slides, of }
  }
  const text = (body: string, more: Partial<SlideText> = {}): SlideText => ({ body, source: 'ollama', model: 'llama3.2:1b', ...more })

  it('s’enregistre avec sa provenance, son modèle et sa date', async () => {
    const ctx = await setup()
    const kpis = ctx.of('kpis')
    const before = (await ctx.call<PresentationSummary[]>('GET', `/api/projects/${ctx.project.id}/presentations`)).body[0]!
    const result = writeSlideTexts(ctx.db, ctx.pid, new Map([[kpis.id, text('  Deux features sur six sont terminées.  ')], [ctx.of('viz').id, text('Deux rapports.', { source: 'claude', model: 'sonnet' })]]), false)
    assert.deepEqual(result.skipped, [])
    assert.deepEqual(result.written.map((s) => [s.id, s.body, s.text_source, s.text_model]), [
      [kpis.id, 'Deux features sur six sont terminées.', 'ollama', 'llama3.2:1b'],
      [ctx.of('viz').id, 'Deux rapports.', 'claude', 'sonnet'],
    ])
    assert.match(result.written[0]!.text_at ?? '', /^\d{4}-\d\d-\d\dT/)
    const stored = listSlides(ctx.db, ctx.pid).find((s) => s.id === kpis.id)!
    assert.deepEqual([stored.body, stored.text_source, stored.text_model, stored.title, stored.position], ['Deux features sur six sont terminées.', 'ollama', 'llama3.2:1b', null, kpis.position])
    const after = (await ctx.call<PresentationSummary[]>('GET', `/api/projects/${ctx.project.id}/presentations`)).body[0]!
    assert.ok(after.updated_at >= before.updated_at)
    // « Phrase automatique » d'un clic : le texte d'IA s'efface, la provenance revient à « auto ».
    const reset = await ctx.call<SlideRecord>('PATCH', `/api/presentations/${ctx.pid}/slides/${kpis.id}`, { body: null })
    assert.deepEqual([reset.body.body, reset.body.text_source, reset.body.text_model, reset.body.text_at], [null, 'auto', null, null])
  })

  it('saute une diapositive supprimée, ou écrite à la main entre-temps', async () => {
    const ctx = await setup()
    const [kpis, viz, tab] = [ctx.of('kpis'), ctx.of('viz'), ctx.of('tab')]
    // Pendant l'appel au moteur : une diapositive est supprimée, une autre écrite à la main.
    await ctx.call('DELETE', `/api/presentations/${ctx.pid}/slides/${viz.id}`)
    await ctx.call('PATCH', `/api/presentations/${ctx.pid}/slides/${tab.id}`, { body: 'Mon texte.' })
    const texts = new Map([[kpis.id, text('Texte des chiffres.')], [viz.id, text('Texte des rapports.')], [tab.id, text('Texte des tables.')]])
    const result = writeSlideTexts(ctx.db, ctx.pid, texts, false)
    assert.deepEqual(result.written.map((s) => s.id), [kpis.id])
    assert.deepEqual(result.skipped, [
      { slide_id: viz.id, reason: 'la diapositive a été supprimée entre-temps' },
      { slide_id: tab.id, reason: 'ton texte est gardé' },
    ])
    const kept = listSlides(ctx.db, ctx.pid).find((s) => s.id === tab.id)!
    assert.deepEqual([kept.body, kept.text_source], ['Mon texte.', 'manual'])
    // Une diapositive d'une autre présentation n'est jamais écrite.
    const other = (await ctx.call<PresentationSummary>('POST', `/api/projects/${ctx.project.id}/presentations`, { plan: false })).body
    const foreign = listSlides(ctx.db, other.id)[0]!
    assert.deepEqual(writeSlideTexts(ctx.db, ctx.pid, new Map([[foreign.id, text('Intrus.')]]), true).written, [])
    assert.equal(listSlides(ctx.db, other.id)[0]!.body, null)
    // Avec la case « Réécrire aussi mes textes ».
    const forced = writeSlideTexts(ctx.db, ctx.pid, new Map([[tab.id, text('Texte des tables.')]]), true)
    assert.deepEqual(forced.written.map((s) => [s.body, s.text_source]), [['Texte des tables.', 'ollama']])
    assert.throws(() => writeSlideTexts(ctx.db, 9999, texts, false), /Présentation introuvable/)
    assert.throws(() => writeSlideTexts(ctx.db, ctx.pid, new Map([[kpis.id, text('x'.repeat(601))]]), false), /600 caractères au plus/)
  })

  it('« à relire » : un nombre du texte qui ne figure plus dans les chiffres du jour', async () => {
    const ctx = await setup()
    const [kpis, features] = [ctx.of('kpis'), ctx.of('features')]
    writeSlideTexts(ctx.db, ctx.pid, new Map([[kpis.id, text(nb('L’avancement est de 33 % : 2 features terminées sur 6.'))]]), false)
    // Un texte écrit à la main cite un chiffre que le Hub ne connaît pas : il n'est jamais comparé.
    await ctx.call('PATCH', `/api/presentations/${ctx.pid}/slides/${features.id}`, { body: 'Budget : 48 000 €, tenu à 91 %.' })
    const read = async () => (await ctx.call<Deck>('GET', `/api/presentations/${ctx.pid}`)).body.slides
    const stale = (slides: Deck['slides']) => Object.fromEntries(slides.filter((s) => s.stale.length > 0).map((s) => [s.kind, s.stale]))
    assert.deepEqual(stale(await read()), {}, 'le jour de la rédaction, tout correspond')

    // Projets change : une feature de plus est terminée (3 sur 6, 50 %).
    ctx.replaced.set('http://projets/api/atelier/projects/4/work-items', {
      format: 'atelier-table/1', name: 'work-items', label: 'work-items', columns: [], total: WORK_ITEMS.length, truncated: false,
      rows: WORK_ITEMS.map((item) => (item.id === 103 ? { ...item, statut_code: 'CLOSED', avancement: 100 } : item)),
    })
    const later = await read()
    assert.equal(later.find((s) => s.kind === 'kpis')!.live.figures[1]!.value, '3 / 6')
    assert.deepEqual(stale(later), { kpis: [nb('33 %'), '2'] })
    // Rien n'est changé en base : le texte reste, daté.
    assert.equal(listSlides(ctx.db, ctx.pid).find((s) => s.id === kpis.id)!.body, nb('L’avancement est de 33 % : 2 features terminées sur 6.'))

    // App arrêtée : rien à comparer, la diapositive le dit autrement (« ne répond pas »).
    ctx.down.add('projets')
    assert.deepEqual(stale(await read()), {})
  })

  it('« à relire » ne concerne que les textes d’IA', async () => {
    const overview = await kpiOverview()
    const general = generalFacts(overview)
    const ai = slide(overview, 'kpis', { body: 'Il reste 12 jours et 2 features sur 6.', text_source: 'claude', text_model: 'sonnet' })
    assert.deepEqual(staleNumbers(ai, general), ['12'])
    assert.deepEqual(staleNumbers({ ...ai, text_source: 'manual' }, general), [])
    assert.deepEqual(staleNumbers({ ...ai, text_source: 'auto', body: null }, general), [])
    assert.deepEqual(staleNumbers({ ...ai, live: { ...ai.live, state: 'down' } }, general), [])
  })
})
