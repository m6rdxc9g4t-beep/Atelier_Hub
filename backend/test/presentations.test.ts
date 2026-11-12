import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { buildApp } from '../src/app.js'
import { loadConfig, type HubConfig } from '../src/config.js'
import { migrate, openDatabase } from '../src/db/database.js'
import type { HubProject, PresentationSummary, SlideRecord } from '../src/domain/types.js'
import { LIMITS, listSlides } from '../src/services/presentations.js'
import { fakeAppsConfig, fakeSuite } from './fixtures/suite.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
after(async () => {
  for (const app of apps) await app.close()
})

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
interface Failure {
  detail: string
  code: string
}

async function setup() {
  const suite = fakeSuite()
  const base = loadConfig({ HUB_STATIC_DIR: '', HUB_DATA_DIR: '/tmp/inutilise' })
  const config: HubConfig = { ...base, apps: fakeAppsConfig(suite.tabDir) }
  const db = openDatabase(':memory:')
  const app = await buildApp({ config, db, fetch: suite.fetch, today: () => '2026-11-10' })
  apps.push(app)
  const call = async <T>(method: Method, url: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.inject({ method, url, payload: payload as object, headers: { host: '127.0.0.1:3700', ...headers } })
    return { status: response.statusCode, body: (response.body ? JSON.parse(response.body) : null) as T }
  }
  const project = (await call<HubProject>('POST', '/api/projects', { name: 'KPI CGO', description: 'Interface KPI du contrôle de gestion' })).body
  return { db, call, suite, project }
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
    db.exec('DROP TABLE slides; DROP TABLE presentations;')
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
