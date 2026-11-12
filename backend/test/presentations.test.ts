import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { migrate, openDatabase } from '../src/db/database.js'
import type { Deck, HubProject, PresentationSummary, SlideRecord } from '../src/domain/types.js'
import { LIMITS, listSlides } from '../src/services/presentations.js'
import { kpiCgo, startHub, type Failure } from './fixtures/hub.js'
import { WORK_ITEMS } from './fixtures/suite.js'

async function setup() {
  const hub = await startHub()
  const project = (await hub.call<HubProject>('POST', '/api/projects', { name: 'KPI CGO', description: 'Interface KPI du contrôle de gestion' })).body
  return { ...hub, project }
}

/** Présentation vide (sa seule diapositive de titre) : les règles de stockage ne dépendent pas du plan. */
async function deck(ctx: Awaited<ReturnType<typeof setup>>, title = 'Comité de novembre') {
  const created = await ctx.call<PresentationSummary>('POST', `/api/projects/${ctx.project.id}/presentations`, { title, plan: false })
  assert.equal(created.status, 201)
  return created.body
}

const kinds = (slides: SlideRecord[]) => slides.map((slide) => slide.kind)

describe('migration 3 : présentations', () => {
  it('s’ajoute à une base en version 2 sans toucher aux fiches', () => {
    const db = openDatabase(':memory:')
    // Une base en version 2 n'a aucune des tables venues depuis (présentations, puis réglages).
    db.exec('DROP TABLE slides; DROP TABLE presentations; DROP TABLE settings;')
    db.pragma('user_version = 2')
    db.prepare("INSERT INTO projects (slug, name, created_at, updated_at) VALUES ('kpi-cgo', 'KPI CGO', '2026-11-01', '2026-11-01')").run()
    db.prepare("INSERT INTO links (project_id, app, kind, ref, label, created_at) VALUES (1, 'source', 'link', 'https://exemple.fr', 'Exemple', '2026-11-01')").run()
    migrate(db)
    assert.ok((db.pragma('user_version', { simple: true }) as number) >= 3)
    assert.deepEqual(db.prepare('SELECT name FROM projects').all(), [{ name: 'KPI CGO' }])
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM links').get() as { n: number }).n, 1)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM presentations').get() as { n: number }).n, 0)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM slides').get() as { n: number }).n, 0)
  })
})

describe('présentations d’une fiche', () => {
  it('crée, liste, renomme et supprime', async () => {
    const ctx = await setup()
    const { call, project } = ctx
    assert.deepEqual((await call('GET', `/api/projects/${project.id}/presentations`)).body, [])
    const a = await deck(ctx, '  Comité de novembre  ')
    assert.equal(a.title, 'Comité de novembre')
    assert.equal(a.project_id, project.id)
    assert.equal(a.slides, 1)
    assert.deepEqual(kinds(listSlides(ctx.db, a.id)), ['title'])
    const b = await deck(ctx, 'Point d’étape')

    const renamed = await call<PresentationSummary>('PATCH', `/api/presentations/${a.id}`, { title: 'Comité de pilotage' })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.body.title, 'Comité de pilotage')
    // Les plus récentes d'abord : celle qu'on vient de renommer repasse devant.
    const list = (await call<PresentationSummary[]>('GET', `/api/projects/${project.id}/presentations`)).body
    assert.deepEqual(list.map((p) => p.id).sort(), [a.id, b.id].sort())
    assert.ok(list[0]!.updated_at >= list[1]!.updated_at)

    assert.equal((await call('DELETE', `/api/presentations/${a.id}`)).status, 204)
    assert.equal((await call('DELETE', `/api/presentations/${a.id}`)).status, 404)
    assert.equal((await call('PATCH', `/api/presentations/${a.id}`, { title: 'x' })).status, 404)
    assert.equal(listSlides(ctx.db, a.id).length, 0)
    assert.deepEqual((await call<PresentationSummary[]>('GET', `/api/projects/${project.id}/presentations`)).body.map((p) => p.id), [b.id])
  })

  it('donne un titre par défaut : la fiche et le mois', async () => {
    const { call, project } = await setup()
    const created = await call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, { plan: false })
    assert.equal(created.status, 201)
    assert.equal(created.body.title, 'KPI CGO — novembre 2026')
  })

  it('coupe le titre par défaut d’une fiche au nom très long, avec ou sans corps', async () => {
    const { call } = await setup()
    // Le nom d'une fiche admet 120 caractères, comme le titre d'une présentation : avec le mois, il dépasse.
    const name = `${'Refonte du contrôle de gestion '.repeat(4).slice(0, 111)}s`
    const long = (await call<HubProject>('POST', '/api/projects', { name })).body
    assert.equal(long.name.length, 112)
    for (const payload of [undefined, {}, { plan: false }, { title: '   ', plan: false }]) {
      const created = await call<PresentationSummary>('POST', `/api/projects/${long.id}/presentations`, payload)
      assert.equal(created.status, 201, JSON.stringify(payload))
      // C'est le nom de la fiche qui est abrégé : le mois reste lisible.
      assert.equal(created.body.title, `${name.slice(0, 103)}… — novembre 2026`)
      assert.equal(created.body.title.length, LIMITS.title)
    }
    // Un titre écrit par l'appelant, lui, reste refusé s'il dépasse.
    assert.equal((await call('POST', `/api/projects/${long.id}/presentations`, { title: 'x'.repeat(LIMITS.title + 1), plan: false })).status, 422)
  })

  it('refuse une fiche inconnue, un titre vide ou trop long, un champ inconnu', async () => {
    const ctx = await setup()
    const { call, project } = ctx
    assert.equal((await call('GET', '/api/projects/999/presentations')).status, 404)
    assert.equal((await call('POST', '/api/projects/999/presentations', { title: 'x', plan: false })).status, 404)
    const long = await call<Failure>('POST', `/api/projects/${project.id}/presentations`, { title: 'x'.repeat(LIMITS.title + 1), plan: false })
    assert.equal(long.status, 422)
    assert.equal(long.body.detail, 'Titre : 120 caractères au plus')
    assert.equal((await call('POST', `/api/projects/${project.id}/presentations`, { title: 'x', inconnu: 1 })).status, 422)
    const a = await deck(ctx)
    assert.equal((await call('PATCH', `/api/presentations/${a.id}`, { title: '   ' })).status, 422)
    assert.equal((await call('PATCH', `/api/presentations/${a.id}`, {})).status, 422)
    assert.equal((await call('PATCH', `/api/presentations/${a.id}`, { title: 'x'.repeat(LIMITS.title + 1) })).status, 422)
    assert.equal((await call('PATCH', `/api/presentations/${a.id}`, { title: 'x'.repeat(LIMITS.title) })).status, 200)
  })

  it('disparaît avec sa fiche', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    await ctx.call('POST', `/api/presentations/${a.id}/slides`, { kind: 'text', body: 'Un point.' })
    assert.equal((await ctx.call('DELETE', `/api/projects/${ctx.project.id}`)).status, 204)
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM presentations').get() as { n: number }).n, 0)
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM slides').get() as { n: number }).n, 0)
    assert.equal((await ctx.call('PATCH', `/api/presentations/${a.id}`, { title: 'x' })).status, 404)
  })

  it('refuse une écriture venue d’un autre site', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const evil = { origin: 'https://evil.example' }
    for (const [method, url, payload] of [
      ['POST', `/api/projects/${ctx.project.id}/presentations`, { title: 'x' }],
      ['PATCH', `/api/presentations/${a.id}`, { title: 'x' }],
      ['DELETE', `/api/presentations/${a.id}`, undefined],
      ['POST', `/api/presentations/${a.id}/slides`, { kind: 'text' }],
      ['PUT', `/api/presentations/${a.id}/order`, { slide_ids: [] }],
    ] as const) {
      const res = await ctx.call<Failure>(method, url, payload, evil)
      assert.equal(res.status, 403, `${method} ${url}`)
      assert.equal(res.body.code, 'FORBIDDEN_ORIGIN')
    }
    assert.equal((await ctx.call('GET', `/api/projects/${ctx.project.id}/presentations`, undefined, { host: 'evil.example' })).status, 403)
    assert.equal(listSlides(ctx.db, a.id).length, 1)
  })
})

describe('diapositives', () => {
  it('s’ajoutent à la fin, en tête ou après une autre, en positions denses', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const add = async (payload: object) => {
      const res = await ctx.call<SlideRecord>('POST', `/api/presentations/${a.id}/slides`, payload)
      assert.equal(res.status, 201)
      return res.body
    }
    const title = listSlides(ctx.db, a.id)[0]!
    const kpis = await add({ kind: 'kpis' })
    assert.equal(kpis.position, 1)
    assert.equal(kpis.presentation_id, a.id)
    const text = await add({ kind: 'text', after: null })
    assert.equal(text.position, 0)
    const wiki = await add({ kind: 'wiki', after: title.id })
    assert.equal(wiki.position, 2)
    const slides = listSlides(ctx.db, a.id)
    assert.deepEqual(kinds(slides), ['text', 'title', 'wiki', 'kpis'])
    assert.deepEqual(slides.map((s) => s.position), [0, 1, 2, 3])
    assert.equal((await ctx.call('POST', `/api/presentations/${a.id}/slides`, { kind: 'text', after: 9999 })).status, 404)
    assert.equal((await ctx.call('POST', `/api/presentations/999/slides`, { kind: 'text' })).status, 404)
    assert.equal((await ctx.call('POST', `/api/presentations/${a.id}/slides`, { kind: 'inconnue' })).status, 422)
    assert.equal((await ctx.call<PresentationSummary[]>('GET', `/api/projects/${ctx.project.id}/presentations`)).body[0]!.slides, 4)

    assert.equal((await ctx.call('DELETE', `/api/presentations/${a.id}/slides/${title.id}`)).status, 204)
    assert.equal((await ctx.call('DELETE', `/api/presentations/${a.id}/slides/${title.id}`)).status, 404)
    const left = listSlides(ctx.db, a.id)
    assert.deepEqual(kinds(left), ['text', 'wiki', 'kpis'])
    assert.deepEqual(left.map((s) => s.position), [0, 1, 2])
  })

  it('un texte écrit à la main est daté ; un texte vidé redevient la phrase automatique', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const slide = (await ctx.call<SlideRecord>('POST', `/api/presentations/${a.id}/slides`, { kind: 'kpis' })).body
    assert.deepEqual([slide.title, slide.body, slide.text_source, slide.text_model, slide.text_at], [null, null, 'auto', null, null])
    const url = `/api/presentations/${a.id}/slides/${slide.id}`

    const written = (await ctx.call<SlideRecord>('PATCH', url, { title: '  Où en est-on ?  ', body: '  Le budget tient.  ' })).body
    assert.equal(written.title, 'Où en est-on ?')
    assert.equal(written.body, 'Le budget tient.')
    assert.equal(written.text_source, 'manual')
    assert.equal(written.text_model, null)
    assert.match(written.text_at ?? '', /^\d{4}-\d\d-\d\dT/)

    // Titre vidé : titre automatique, sans toucher à la provenance du texte.
    const untitled = (await ctx.call<SlideRecord>('PATCH', url, { title: '' })).body
    assert.equal(untitled.title, null)
    assert.deepEqual([untitled.body, untitled.text_source, untitled.text_at], ['Le budget tient.', 'manual', written.text_at])
    assert.equal((await ctx.call<SlideRecord>('PATCH', url, { title: null })).body.title, null)

    const cleared = (await ctx.call<SlideRecord>('PATCH', url, { body: null })).body
    assert.deepEqual([cleared.body, cleared.text_source, cleared.text_model, cleared.text_at], [null, 'auto', null, null])
    const blank = (await ctx.call<SlideRecord>('PATCH', url, { body: '   ' })).body
    assert.deepEqual([blank.body, blank.text_source], [null, 'auto'])
  })

  it('un texte renvoyé tel quel garde sa provenance', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const slide = (await ctx.call<SlideRecord>('POST', `/api/presentations/${a.id}/slides`, { kind: 'kpis' })).body
    // Texte rédigé par un moteur (l'écriture par l'IA arrive plus tard : posé ici directement en base).
    ctx.db.prepare("UPDATE slides SET body = 'Le projet avance.', text_source = 'ollama', text_model = 'llama3.2:1b', text_at = '2026-11-10T08:00:00.000Z' WHERE id = ?").run(slide.id)
    const url = `/api/presentations/${a.id}/slides/${slide.id}`
    const same = (await ctx.call<SlideRecord>('PATCH', url, { title: 'Avancement', body: 'Le projet avance.' })).body
    assert.deepEqual([same.title, same.text_source, same.text_model, same.text_at], ['Avancement', 'ollama', 'llama3.2:1b', '2026-11-10T08:00:00.000Z'])
    const edited = (await ctx.call<SlideRecord>('PATCH', url, { body: 'Le projet avance bien.' })).body
    assert.deepEqual([edited.text_source, edited.text_model], ['manual', null])
  })

  it('un texte donné à la création est écrit à la main', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const slide = (await ctx.call<SlideRecord>('POST', `/api/presentations/${a.id}/slides`, { kind: 'text', title: 'Décisions attendues', body: 'Valider le budget.' })).body
    assert.deepEqual([slide.title, slide.body, slide.text_source], ['Décisions attendues', 'Valider le budget.', 'manual'])
    assert.ok(slide.text_at)
  })

  it('ne vise un élément que pour une sorte qui en a, et avec son libellé', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const url = `/api/presentations/${a.id}/slides`
    const noRef = await ctx.call<Failure>('POST', url, { kind: 'kpis', ref: 'a1', ref_label: 'x' })
    assert.equal(noRef.status, 422)
    assert.equal(noRef.body.detail, 'Cette sorte de diapositive ne vise pas un élément')
    assert.equal((await ctx.call('POST', url, { kind: 'viz', ref: 'a1b2c3d4e5f6' })).status, 422)
    assert.equal((await ctx.call('POST', url, { kind: 'viz', ref: 'x'.repeat(LIMITS.ref + 1), ref_label: 'x' })).status, 422)
    const slide = await ctx.call<SlideRecord>('POST', url, { kind: 'viz', ref: 'a1b2c3d4e5f6', ref_label: 'KPI CGO — Tableau mensuel' })
    assert.equal(slide.status, 201)
    assert.deepEqual([slide.body.ref, slide.body.ref_label, slide.body.title], ['a1b2c3d4e5f6', 'KPI CGO — Tableau mensuel', null])
    // L'élément visé et la sorte ne changent plus : le PATCH ne connaît que le titre et le texte.
    for (const patch of [{ ref: 'autre' }, { ref_label: 'Autre' }, { kind: 'tab' }, { position: 0 }]) {
      const res = await ctx.call<Failure>('PATCH', `${url}/${slide.body.id}`, patch)
      assert.equal(res.status, 422, JSON.stringify(patch))
      assert.equal(res.body.code, 'VALIDATION')
    }
    assert.equal(listSlides(ctx.db, a.id).at(-1)!.ref, 'a1b2c3d4e5f6')
  })

  it('se réordonnent par une permutation exacte', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    for (const kind of ['kpis', 'wiki', 'text']) await ctx.call('POST', `/api/presentations/${a.id}/slides`, { kind })
    const ids = listSlides(ctx.db, a.id).map((s) => s.id)
    const url = `/api/presentations/${a.id}/order`
    const next = [ids[3]!, ids[0]!, ids[2]!, ids[1]!]
    const moved = await ctx.call<SlideRecord[]>('PUT', url, { slide_ids: next })
    assert.equal(moved.status, 200)
    assert.deepEqual(moved.body.map((s) => s.id), next)
    assert.deepEqual(moved.body.map((s) => s.position), [0, 1, 2, 3])
    assert.deepEqual(kinds(listSlides(ctx.db, a.id)), ['text', 'title', 'wiki', 'kpis'])
    for (const bad of [ids.slice(1), [...ids, 9999], [ids[0], ids[0], ids[1], ids[2]], []]) {
      const res = await ctx.call<Failure>('PUT', url, { slide_ids: bad })
      assert.equal(res.status, 422)
      assert.equal(res.body.detail, 'L’ordre doit contenir chaque diapositive une seule fois')
    }
    assert.equal((await ctx.call('PUT', '/api/presentations/999/order', { slide_ids: [] })).status, 404)
    assert.deepEqual(listSlides(ctx.db, a.id).map((s) => s.id), next)
  })

  it('bornent le texte à 600 caractères, le titre à 120, la présentation à 40 diapositives', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const url = `/api/presentations/${a.id}/slides`
    const slide = (await ctx.call<SlideRecord>('POST', url, { kind: 'text' })).body
    const body = await ctx.call<Failure>('PATCH', `${url}/${slide.id}`, { body: 'x'.repeat(LIMITS.body + 1) })
    assert.equal(body.status, 422)
    assert.equal(body.body.detail, 'Texte : 600 caractères au plus')
    assert.equal((await ctx.call('PATCH', `${url}/${slide.id}`, { body: 'x'.repeat(LIMITS.body) })).status, 200)
    const title = await ctx.call<Failure>('PATCH', `${url}/${slide.id}`, { title: 'x'.repeat(LIMITS.slideTitle + 1) })
    assert.equal(title.status, 422)
    assert.equal(title.body.detail, 'Titre : 120 caractères au plus')
    assert.equal((await ctx.call('POST', url, { kind: 'text', body: 'x'.repeat(LIMITS.body + 1) })).status, 422)

    for (let n = listSlides(ctx.db, a.id).length; n < LIMITS.slides; n++) assert.equal((await ctx.call('POST', url, { kind: 'text' })).status, 201)
    const full = await ctx.call<Failure>('POST', url, { kind: 'text' })
    assert.equal(full.status, 409)
    assert.equal(full.body.code, 'CONFLICT')
    assert.equal(full.body.detail, 'Une présentation contient 40 diapositives au plus')
    assert.equal(listSlides(ctx.db, a.id).length, LIMITS.slides)
  })

  it('une diapositive d’une autre présentation est introuvable', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    const b = await deck(ctx, 'Autre')
    const foreign = listSlides(ctx.db, b.id)[0]!
    assert.equal((await ctx.call('PATCH', `/api/presentations/${a.id}/slides/${foreign.id}`, { title: 'x' })).status, 404)
    assert.equal((await ctx.call('DELETE', `/api/presentations/${a.id}/slides/${foreign.id}`)).status, 404)
    assert.equal((await ctx.call('POST', `/api/presentations/${a.id}/slides`, { kind: 'text', after: foreign.id })).status, 404)
    assert.equal((await ctx.call('PUT', `/api/presentations/${a.id}/order`, { slide_ids: [foreign.id] })).status, 422)
    assert.equal(listSlides(ctx.db, b.id)[0]!.title, null)
  })

  it('toute écriture d’une diapositive date la présentation', async () => {
    const ctx = await setup()
    const a = await deck(ctx)
    ctx.db.prepare("UPDATE presentations SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(a.id)
    const stamp = () => (ctx.db.prepare('SELECT updated_at FROM presentations WHERE id = ?').get(a.id) as { updated_at: string }).updated_at
    const reset = () => ctx.db.prepare("UPDATE presentations SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(a.id)
    const slide = (await ctx.call<SlideRecord>('POST', `/api/presentations/${a.id}/slides`, { kind: 'text' })).body
    assert.ok(stamp() > '2026-01-01')
    reset()
    await ctx.call('PATCH', `/api/presentations/${a.id}/slides/${slide.id}`, { body: 'x' })
    assert.ok(stamp() > '2026-01-01')
    reset()
    await ctx.call('PUT', `/api/presentations/${a.id}/order`, { slide_ids: listSlides(ctx.db, a.id).map((s) => s.id).reverse() })
    assert.ok(stamp() > '2026-01-01')
    reset()
    await ctx.call('DELETE', `/api/presentations/${a.id}/slides/${slide.id}`)
    assert.ok(stamp() > '2026-01-01')
  })
})

// ─── « Générer » sans IA : le plan bâti sur la fiche, la présentation relue avec les chiffres du jour ─────────

const table = (name: string, rows: Record<string, unknown>[]) => ({ format: 'atelier-table/1', name, label: name, columns: [], rows, total: rows.length, truncated: false })
const REPORT = { app: 'viz', kind: 'report', ref: 'a1b2c3d4e5f6', label: 'KPI CGO — Tableau mensuel' }
const PLAN = ['title', 'summary', 'kpis', 'features', 'active', 'milestones', 'wiki', 'viz', 'viz', 'tab', 'convert', 'nexus', 'sources']

async function generated() {
  const hub = await startHub()
  const project = await kpiCgo(hub)
  await hub.call('POST', `/api/projects/${project.id}/links`, REPORT)
  const created = await hub.call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`)
  assert.equal(created.status, 201)
  const read = async () => {
    const res = await hub.call<Deck>('GET', `/api/presentations/${created.body.id}`)
    assert.equal(res.status, 200)
    return res.body
  }
  const stored = () => JSON.stringify([hub.db.prepare('SELECT * FROM presentations').all(), hub.db.prepare('SELECT * FROM slides ORDER BY id').all()])
  const slide = (deck: Deck, kind: string, ref: string | null = null) => deck.slides.find((s) => s.kind === kind && s.ref === ref)!
  return { ...hub, project, presentation: created.body, read, stored, slide }
}

describe('« Générer » sans IA', () => {
  it('bâtit la présentation sur la fiche et n’enregistre rien de vivant', async () => {
    const ctx = await generated()
    assert.deepEqual([ctx.presentation.title, ctx.presentation.slides, ctx.presentation.project_id], ['KPI CGO — novembre 2026', PLAN.length, ctx.project.id])
    const records = listSlides(ctx.db, ctx.presentation.id)
    assert.deepEqual(kinds(records), PLAN)
    assert.deepEqual(records.map((s) => s.position), PLAN.map((_, i) => i))
    // Ni titre, ni texte : tout est calculé à la lecture. Seule la diapositive du rapport épinglé porte une référence.
    for (const s of records) assert.deepEqual([s.title, s.body, s.text_source, s.text_model, s.text_at], [null, null, 'auto', null, null], s.kind)
    assert.deepEqual(records.filter((s) => s.ref !== null || s.ref_label !== null).map((s) => [s.position, s.kind, s.ref, s.ref_label]), [[8, 'viz', REPORT.ref, REPORT.label]])
    // Aucun nom, aucun chiffre lu dans une app n'est en base (le libellé du rapport est celui de la fiche, comme `links.label`).
    const stored = ctx.stored()
    for (const text of ['Dictionnaire', 'SAP', 'Réalisé', 'Comité de pilotage', 'Écarts', 'Data Analyst', 'Seuils', 'estimées', 'visuels', 'terminées']) assert.ok(!stored.includes(text), text)
  })

  it('rend la présentation résolue : les diapositives enregistrées et leur partie vivante', async () => {
    const ctx = await generated()
    const before = ctx.suite.calls.length
    const deck = await ctx.read()
    assert.deepEqual([deck.presentation.id, deck.presentation.title, deck.project.id, deck.project.name], [ctx.presentation.id, 'KPI CGO — novembre 2026', ctx.project.id, 'KPI CGO'])
    assert.match(deck.generated_at, /^\d{4}-\d\d-\d\dT/)
    assert.deepEqual(deck.slides.map((s) => s.kind), PLAN)
    assert.deepEqual(deck.slides.map((s) => s.live.state), PLAN.map(() => 'ok'))
    assert.ok(deck.slides.every((s) => s.title === null && s.body === null && s.stale.length === 0))
    assert.deepEqual(deck.slides.map((s) => s.live.auto_title), [
      'KPI CGO — novembre 2026', 'Synthèse', 'Chiffres clés', 'Avancement des features', 'En cours et points de blocage', 'Jalons',
      'Documentation', 'Rapports', 'KPI CGO — Tableau mensuel', 'Tables', 'Conversions', 'Agents', 'Sources',
    ])
    assert.equal(ctx.slide(deck, 'kpis').live.figures[0]!.value, '66,5\u00a0h')
    assert.ok(deck.slides.every((s) => s.kind === 'text' || s.live.auto_text.length > 0))
    // Une lecture de la présentation = une lecture de la suite (chaque app une fois).
    const calls = ctx.suite.calls.slice(before)
    assert.equal(calls.filter((c) => c === 'GET http://projets/api/atelier/projects/4/work-items').length, 1)
    assert.equal(calls.filter((c) => c === 'GET http://viz/api/reports').length, 1)
    assert.equal((await ctx.call('GET', '/api/presentations/999')).status, 404)
  })

  it('relit les chiffres du jour à chaque lecture, sans rien écrire', async () => {
    const ctx = await generated()
    const stored = ctx.stored()
    const first = await ctx.read()
    assert.deepEqual(ctx.slide(first, 'kpis').live.figures.map((f) => f.value).slice(0, 2), ['66,5\u00a0h', '2 / 6'])
    assert.equal(ctx.slide(first, 'kpis').live.auto_text, '2 features terminées sur 6 (33\u00a0%). 66,5\u00a0h passées sur 100\u00a0h estimées (67\u00a0%).')
    assert.equal(ctx.slide(first, 'viz', REPORT.ref).live.auto_title, 'KPI CGO — Tableau mensuel')

    // Le lendemain dans les apps : une feature terminée, des heures saisies, le rapport renommé et agrandi.
    ctx.replaced.set('http://projets/api/atelier/projects/4/work-items', table('work-items', WORK_ITEMS.map((item) => (item.id === 103 ? { ...item, statut_code: 'CLOSED', heures_passees: 30, avancement: 100 } : item))))
    ctx.replaced.set('http://viz/api/reports', [{ id: REPORT.ref, name: 'KPI CGO — Tableau de bord', pages: 4, visuals: 20, bookmarks: 0, updated_at: '2026-11-11T12:00:00Z' }])
    const second = await ctx.read()
    assert.deepEqual(ctx.slide(second, 'kpis').live.figures.map((f) => f.value).slice(0, 2), ['78\u00a0h', '3 / 6'])
    assert.equal(ctx.slide(second, 'kpis').live.auto_text, '3 features terminées sur 6 (50\u00a0%). 78\u00a0h passées sur 100\u00a0h estimées (78\u00a0%).')
    assert.equal(ctx.slide(second, 'features').live.auto_text, '6 features : 3 terminées, 1 en cours, 2 à faire.')
    assert.match(ctx.slide(second, 'summary').live.auto_text, /^- Avancement : 3 features terminées sur 6 \(50\u00a0%\)\./)
    const report = ctx.slide(second, 'viz', REPORT.ref)
    assert.deepEqual([report.live.auto_title, report.live.auto_text, report.ref_label], ['KPI CGO — Tableau de bord', '4 pages · 20 visuels, modifié le 11 novembre 2026.', REPORT.label])
    assert.equal(ctx.slide(second, 'viz').live.auto_text, '1 rapport dans Atelier Viz ; le plus récent : « KPI CGO — Tableau de bord ».')
    assert.equal(ctx.stored(), stored, 'lire une présentation n’écrit rien')
  })

  it('un texte écrit à la main reste, à côté des chiffres du jour', async () => {
    const ctx = await generated()
    const kpis = ctx.slide(await ctx.read(), 'kpis')
    await ctx.call('PATCH', `/api/presentations/${ctx.presentation.id}/slides/${kpis.id}`, { title: 'Où en est-on ?', body: 'Le budget tient.' })
    const slide = ctx.slide(await ctx.read(), 'kpis')
    assert.deepEqual([slide.title, slide.body, slide.text_source], ['Où en est-on ?', 'Le budget tient.', 'manual'])
    assert.deepEqual([slide.live.auto_title, slide.live.figures.length], ['Chiffres clés', 4])
  })

  it('renommer la présentation change le titre de sa diapositive de titre', async () => {
    const ctx = await generated()
    assert.equal(ctx.slide(await ctx.read(), 'title').live.auto_title, 'KPI CGO — novembre 2026')
    await ctx.call('PATCH', `/api/presentations/${ctx.presentation.id}`, { title: 'Comité de pilotage' })
    const deck = await ctx.read()
    assert.equal(deck.presentation.title, 'Comité de pilotage')
    assert.deepEqual([ctx.slide(deck, 'title').live.auto_title, ctx.slide(deck, 'title').title], ['Comité de pilotage', null])
  })

  it('une app arrêtée donne une diapositive qui le dit, jamais une erreur', async () => {
    const ctx = await generated()
    for (const app of ['projets', 'wiki', 'viz', 'convert', 'nexus'] as const) ctx.down.add(app)
    const deck = await ctx.read()
    const state = (kind: string, ref: string | null = null) => [ctx.slide(deck, kind, ref).live.state, ctx.slide(deck, kind, ref).live.message]
    for (const kind of ['kpis', 'features', 'active', 'milestones']) assert.deepEqual(state(kind), ['down', 'Atelier Projets ne répond pas'], kind)
    assert.deepEqual(state('wiki'), ['down', 'Atelier Wiki ne répond pas'])
    assert.deepEqual(state('viz'), ['down', 'Atelier Viz ne répond pas'])
    assert.deepEqual(state('convert'), ['down', 'Atelier Convert ne répond pas'])
    assert.deepEqual(state('nexus'), ['down', 'Atelier Nexus ne répond pas'])
    // Ce que la fiche garde reste lisible : le rapport et l'agent épinglés, par leur libellé ; Tab (un fichier) et les sources.
    const report = ctx.slide(deck, 'viz', REPORT.ref)
    assert.deepEqual([report.live.state, report.live.auto_title, report.live.rows.map((r) => r.label)], ['down', REPORT.label, [REPORT.label]])
    assert.deepEqual(ctx.slide(deck, 'nexus').live.rows.map((r) => r.label), ['Data Analyst / Power BI'])
    assert.deepEqual([ctx.slide(deck, 'kpis').live.figures, ctx.slide(deck, 'kpis').live.auto_text], [[], ''])
    assert.deepEqual(state('tab'), ['ok', null])
    assert.deepEqual(state('sources'), ['ok', null])
    assert.match(ctx.slide(deck, 'summary').live.auto_text, /Atelier Projets, Atelier Wiki, Atelier Viz et Atelier Convert n’ont pas pu être lus/)

    // Les apps reviennent : la même présentation se remplit, sans rien régénérer.
    ctx.down.clear()
    const back = await ctx.read()
    assert.deepEqual(back.slides.map((s) => s.live.state), PLAN.map(() => 'ok'))
    assert.equal(ctx.slide(back, 'kpis').live.figures.length, 4)
  })

  it('une app arrêtée le jour de la génération garde sa section, qui se remplit ensuite', async () => {
    const hub = await startHub()
    const project = await kpiCgo(hub)
    await hub.call('POST', `/api/projects/${project.id}/links`, REPORT)
    for (const app of ['projets', 'wiki', 'viz'] as const) hub.down.add(app)
    const created = await hub.call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`)
    assert.equal(created.status, 201)
    const records = listSlides(hub.db, created.body.id)
    assert.deepEqual(kinds(records), PLAN)
    assert.deepEqual(records.filter((s) => s.ref !== null).map((s) => [s.ref, s.ref_label]), [[REPORT.ref, REPORT.label]])
    hub.down.clear()
    const deck = (await hub.call<Deck>('GET', `/api/presentations/${created.body.id}`)).body
    assert.deepEqual(deck.slides.map((s) => s.live.state), PLAN.map(() => 'ok'))
  })

  it('présentation vide sur demande ; fiche sans rattachement : titre et synthèse', async () => {
    const ctx = await setup()
    const before = ctx.suite.calls.length
    const empty = await deck(ctx)
    assert.deepEqual(kinds(listSlides(ctx.db, empty.id)), ['title'])
    assert.equal(ctx.suite.calls.length, before, 'une présentation vide ne lit aucune app')
    const other = (await ctx.call<HubProject>('POST', '/api/projects', { name: 'Clôture annuelle 2026' })).body
    const planned = await ctx.call<PresentationSummary>('POST', `/api/projects/${other.id}/presentations`, { plan: true })
    assert.deepEqual([planned.status, planned.body.title, planned.body.slides], [201, 'Clôture annuelle 2026 — novembre 2026', 2])
    assert.deepEqual(kinds(listSlides(ctx.db, planned.body.id)), ['title', 'summary'])
    const read = (await ctx.call<Deck>('GET', `/api/presentations/${planned.body.id}`)).body
    assert.deepEqual(read.slides.map((s) => s.live.auto_text), ['Présentation du projet Clôture annuelle 2026.', 'Rien n’est encore rattaché à cette fiche.'])
  })

  it('une création refusée n’interroge aucune app', async () => {
    const hub = await startHub()
    const project = await kpiCgo(hub)
    const before = hub.suite.calls.length
    assert.equal((await hub.call('POST', `/api/projects/${project.id}/presentations`, { title: 'x'.repeat(LIMITS.title + 1) })).status, 422)
    assert.equal((await hub.call('POST', '/api/projects/999/presentations')).status, 404)
    assert.equal((await hub.call('POST', `/api/projects/${project.id}/presentations`, { plan: 'oui' })).status, 422)
    assert.equal(hub.suite.calls.length, before)
  })
})
