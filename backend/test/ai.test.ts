import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { absentClaude } from '../src/ai/claude.js'
import { buildApp } from '../src/app.js'
import { createOllamaClient, findInstalledModel, OLLAMA_MAX_ANSWER, OllamaError } from '../src/ai/ollama.js'
import { WRITE_LIMITS, WRITE_SYSTEM } from '../src/ai/prompts.js'
import { loadConfig } from '../src/config.js'
import { migrate, openDatabase } from '../src/db/database.js'
import type { AiStatus, Deck, PresentationSummary, SlideKind, SlideRecord, WriteResult } from '../src/domain/types.js'
import { createAi, type AiDeps } from '../src/services/ai.js'
import { listSlides } from '../src/services/presentations.js'
import { isOnline, OFFLINE_MESSAGE, setOnline } from '../src/services/settings.js'
import { answer, fakeAi, fakeClaude, fakeOllama } from './fixtures/ai.js'
import { kpiCgo, startHub, type Failure } from './fixtures/hub.js'

const NBSP = ' '
const KPIS_TEXT = `2 features terminées sur 6, soit 33${NBSP}% : le projet avance.`

/** Fiche « KPI CGO » et sa présentation générée (12 diapositives), sur un Hub aux moteurs simulés. */
async function setup(ai: AiDeps) {
  const hub = await startHub({ ai })
  const project = await kpiCgo(hub)
  const created = await hub.call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, {})
  assert.equal(created.status, 201)
  const pid = created.body.id
  const slides = () => listSlides(hub.db, pid)
  const of = (kind: SlideKind) => slides().find((s) => s.kind === kind)!
  const write = <T = WriteResult>(body: object, headers?: Record<string, string>) => hub.call<T>('POST', `/api/presentations/${pid}/write`, body, headers)
  // Seules les lectures faites pendant la rédaction comptent.
  hub.suite.calls.length = 0
  return { ...hub, project, pid, slides, of, write }
}

describe('migration 4 : réglages', () => {
  it('s’ajoute à une base en version 3 ; hors ligne par défaut', () => {
    const db = openDatabase(':memory:')
    db.exec('DROP TABLE settings;')
    db.pragma('user_version = 3')
    db.prepare("INSERT INTO projects (slug, name, created_at, updated_at) VALUES ('kpi-cgo', 'KPI CGO', '2026-11-01', '2026-11-01')").run()
    migrate(db)
    assert.ok((db.pragma('user_version', { simple: true }) as number) >= 4)
    assert.deepEqual(db.prepare('SELECT name FROM projects').all(), [{ name: 'KPI CGO' }])
    assert.equal(isOnline(db), false)
    assert.deepEqual(setOnline(db, true), { online: true })
    assert.equal(isOnline(db), true)
    assert.deepEqual(setOnline(db, false), { online: false })
    // Une valeur illisible, ou autre chose que `true`, vaut hors ligne.
    for (const value of ['oui', '"true"', '1', '{']) {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'online_mode'").run(value)
      assert.equal(isOnline(db), false, value)
    }
  })
})

describe('réglages de l’IA', () => {
  const env = (more: Record<string, string>) => loadConfig({ HUB_STATIC_DIR: '', ...more }).ai

  it('Ollama par défaut, sur cette machine', () => {
    assert.deepEqual(env({}), { ollamaUrl: 'http://127.0.0.1:11434', ollamaRefused: null, ollamaModel: 'llama3.1:8b', ollamaTimeoutMs: 120_000, ollamaNumCtx: 8192, maxChars: 12_000 })
    assert.equal(env({ OLLAMA_URL: 'http://localhost:11500/' }).ollamaUrl, 'http://localhost:11500')
    assert.equal(env({ OLLAMA_BASE_URL: 'http://[::1]:11434' }).ollamaUrl, 'http://[::1]:11434')
    assert.equal(env({ OLLAMA_URL: 'http://127.0.0.1:1', OLLAMA_BASE_URL: 'http://127.0.0.1:2' }).ollamaUrl, 'http://127.0.0.1:1')
    assert.deepEqual(env({ OLLAMA_MODEL: 'llama3.2:1b', OLLAMA_TIMEOUT_MS: '600000', OLLAMA_NUM_CTX: '4096', HUB_AI_MAX_CHARS: '6000' }), {
      ollamaUrl: 'http://127.0.0.1:11434', ollamaRefused: null, ollamaModel: 'llama3.2:1b', ollamaTimeoutMs: 600_000, ollamaNumCtx: 4096, maxChars: 6000,
    })
    // Seule l'origine est gardée : ni identifiants ni chemin ne passent dans un message d'erreur.
    assert.equal(env({ OLLAMA_URL: 'http://moi:secret@127.0.0.1:11434/v1' }).ollamaUrl, 'http://127.0.0.1:11434')
  })

  it('une adresse qui n’est pas de cette machine désactive Ollama, sans empêcher le Hub de démarrer', () => {
    for (const url of ['http://192.168.1.20:11434', 'https://ollama.exemple.fr', 'http://127.0.0.1.exemple.fr:11434', 'pas une adresse', 'file:///etc/passwd']) {
      const ai = env({ OLLAMA_URL: url })
      assert.deepEqual([ai.ollamaUrl, ai.ollamaRefused], [null, 'OLLAMA_URL n’est pas une adresse de cette machine : Ollama est désactivé'], url)
    }
    const deps = createAi(env({ OLLAMA_URL: 'http://192.168.1.20:11434' }))
    assert.equal(deps.ollama, null)
    assert.equal(createAi(env({})).ollama?.baseUrl, 'http://127.0.0.1:11434')
  })

  it('le Hub démarre avec ses vrais moteurs quand Ollama est désactivé : état dit, rédaction refusée, aucun appel', async () => {
    // Sans double : `buildApp` construit les moteurs d'après les réglages. Ollama désactivé et Claude absent ne parlent à personne.
    const config = loadConfig({ HUB_STATIC_DIR: '', HUB_DATA_DIR: '/tmp/inutilise', OLLAMA_URL: 'http://192.168.1.20:11434' })
    const db = openDatabase(':memory:')
    const app = await buildApp({ config, db, fetch: async () => { throw new Error('aucune app ne doit être lue') } })
    try {
      const headers = { host: '127.0.0.1:3700' }
      const status = (await app.inject({ method: 'GET', url: '/api/ai/status', headers })).json<AiStatus>()
      assert.deepEqual([status.online, status.auto, status.ollama.reachable, status.ollama.error], [false, 'ollama', false, 'OLLAMA_URL n’est pas une adresse de cette machine : Ollama est désactivé'])
      assert.deepEqual([status.claude.available, status.claude.mode, status.max_chars], [false, 'cli', 12_000])
      const project = (await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name: 'KPI CGO' } })).json<{ id: number }>()
      const deck = (await app.inject({ method: 'POST', url: `/api/projects/${project.id}/presentations`, headers, payload: { plan: false } })).json<PresentationSummary>()
      const slide = listSlides(db, deck.id)[0]!
      const refused = await app.inject({ method: 'POST', url: `/api/presentations/${deck.id}/write`, headers, payload: { slide_ids: [slide.id] } })
      assert.deepEqual([refused.statusCode, refused.json<Failure>().code], [502, 'AI_UNAVAILABLE'])
      // En ligne, Claude n'est pas encore branché : jamais disponible.
      setOnline(db, true)
      const claude = await app.inject({ method: 'POST', url: `/api/presentations/${deck.id}/write`, headers, payload: { slide_ids: [slide.id], engine: 'claude' } })
      assert.deepEqual([claude.statusCode, claude.json<Failure>().code], [502, 'CLAUDE_UNAVAILABLE'])
    } finally {
      await app.close()
    }
  })
})

describe('client Ollama (fetch simulé)', () => {
  const ndjson = (...chunks: object[]) => new Response(chunks.map((c) => `${JSON.stringify(c)}\n`).join(''), { status: 200 })
  const client = (fetch: (input: string, init?: RequestInit) => Promise<Response>, timeoutMs = 2000) => createOllamaClient({ baseUrl: 'http://127.0.0.1:11434/', timeoutMs, contextTokens: 8192, fetch })
  const kind = async (run: Promise<unknown>) => {
    try {
      await run
    } catch (error) {
      assert.ok(error instanceof OllamaError, String(error))
      return [error.kind, error.message]
    }
    return ['aucune erreur', '']
  }
  const chat = { model: 'llama3.2:1b', messages: [{ role: 'user' as const, content: 'Bonjour' }] }
  /** Un Ollama qui ne répond jamais : seul l'abandon (délai, appelant) termine l'appel. Le minuteur tient la boucle d'événements en vie, comme une vraie connexion. */
  const never = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const hold = setTimeout(() => reject(new Error('jamais abandonné')), 5000)
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(hold)
        reject(new DOMException('abandon', 'AbortError'))
      })
    })

  it('assemble la réponse lue en flux et envoie le schéma, la température et la fenêtre de contexte', async () => {
    const seen: { url: string; body: Record<string, unknown> }[] = []
    const ollama = client(async (url, init) => {
      seen.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return ndjson({ message: { content: '{"diapo' } }, { message: { content: 'sitives":[]}' } }, { done: true })
    })
    assert.equal(await ollama.chat({ ...chat, format: { type: 'object' } }), '{"diapositives":[]}')
    assert.equal(seen[0]!.url, 'http://127.0.0.1:11434/api/chat')
    assert.deepEqual(seen[0]!.body, { model: 'llama3.2:1b', messages: chat.messages, stream: true, format: { type: 'object' }, options: { temperature: 0.2, num_ctx: 8192 } })
  })

  it('coupe une réponse qui s’emballe', async () => {
    const ollama = client(async () => ndjson(...Array.from({ length: 30 }, () => ({ message: { content: 'x'.repeat(5000) } }))))
    assert.equal((await ollama.chat(chat)).length, OLLAMA_MAX_ANSWER)
  })

  it('liste les modèles installés et retrouve celui qui est demandé', async () => {
    const ollama = client(async (url) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/tags')
      return new Response(JSON.stringify({ models: [{ name: 'llama3.2:1b', size: 1300 }, { model: 'gemma3:latest' }, { size: 3 }] }))
    })
    const models = await ollama.listModels()
    assert.deepEqual(models, [{ name: 'gemma3:latest', size: 0 }, { name: 'llama3.2:1b', size: 1300 }])
    assert.equal(findInstalledModel(models, 'llama3.2')?.name, 'llama3.2:1b')
    assert.equal(findInstalledModel(models, 'gemma3')?.name, 'gemma3:latest')
    assert.equal(findInstalledModel(models, 'llama3.2:3b'), undefined)
  })

  it('dit en français ce qui ne va pas : injoignable, modèle absent, délai, abandon, erreur', async () => {
    const down = client(async () => {
      throw new TypeError('fetch failed')
    })
    assert.deepEqual(await kind(down.chat(chat)), ['unreachable', 'Ollama est injoignable sur http://127.0.0.1:11434 : lance Ollama. La présentation garde ses phrases automatiques.'])
    assert.equal((await kind(down.listModels()))[0], 'unreachable')
    const missing = client(async () => new Response(JSON.stringify({ error: 'model "llama3.2:1b" not found, try pulling it first' }), { status: 404 }))
    assert.deepEqual(await kind(missing.chat(chat)), ['model', 'Modèle absent d’Ollama (llama3.2:1b) : installe-le avec « ollama pull llama3.2:1b »'])
    const broken = client(async () => new Response(JSON.stringify({ error: 'out of memory' }), { status: 500 }))
    assert.deepEqual(await kind(broken.chat(chat)), ['failed', 'Erreur d’Ollama : out of memory'])
    assert.deepEqual(await kind(client(async () => ndjson({ error: 'context too long' })).chat(chat)), ['failed', 'Erreur d’Ollama : context too long'])
    assert.equal((await kind(client(async () => new Response('pas du JSON\n')).chat(chat)))[0], 'failed')
    const slow = client(never, 30)
    assert.deepEqual(await kind(slow.chat(chat)), ['timeout', 'Ollama n’a pas répondu en 0 s (OLLAMA_TIMEOUT_MS)'])
    const waiting = client(never)
    const controller = new AbortController()
    const pending = kind(waiting.chat({ ...chat, signal: controller.signal }))
    controller.abort()
    assert.deepEqual(await pending, ['cancelled', 'Rédaction annulée'])
  })
})

describe('état des moteurs et mode en ligne', () => {
  it('hors ligne par défaut : Claude n’est pas interrogé', async () => {
    const claude = fakeClaude()
    const ollama = fakeOllama()
    const hub = await startHub({ ai: fakeAi({ ollama, claude }) })
    const status = await hub.call<AiStatus>('GET', '/api/ai/status?refresh=true')
    assert.equal(status.status, 200)
    assert.deepEqual(status.body, {
      online: false,
      auto: 'ollama',
      ollama: { reachable: true, error: null, default_model: 'llama3.1:8b', default_installed: true, models: [{ name: 'llama3.1:8b', size: 1_300_000_000 }, { name: 'llama3.2:1b', size: 1_300_000_000 }] },
      claude: { available: false, installed: false, mode: 'cli', error: OFFLINE_MESSAGE, warning: null, models: ['sonnet', 'opus', 'haiku'], default_model: 'sonnet' },
      max_chars: 12_000,
    })
    assert.equal(claude.state.statusCalls, 0, 'hors ligne, la CLI n’est même pas lancée')
    assert.deepEqual(hub.suite.calls, [], 'l’état des moteurs ne lit aucune app')
  })

  it('en ligne : Claude est interrogé, « Auto » le retient s’il est disponible', async () => {
    const claude = fakeClaude()
    const hub = await startHub({ ai: fakeAi({ claude }) })
    assert.deepEqual((await hub.call('PUT', '/api/settings/online-mode', { online: true })).body, { online: true })
    const status = (await hub.call<AiStatus>('GET', '/api/ai/status')).body
    assert.deepEqual([status.online, status.auto, status.claude.available, status.claude.installed, status.claude.error], [true, 'claude', true, true, null])
    assert.deepEqual([claude.state.statusCalls, claude.state.refreshes], [1, 0])
    await hub.call('GET', '/api/ai/status?refresh=true')
    assert.equal(claude.state.refreshes, 1)
    claude.state.available = false
    const off = (await hub.call<AiStatus>('GET', '/api/ai/status')).body
    assert.deepEqual([off.auto, off.claude.available, off.claude.installed], ['ollama', false, true])
    assert.match(off.claude.error ?? '', /pas connecté/)
    // Retour hors ligne : enregistré, et Claude n'est plus interrogé.
    assert.deepEqual((await hub.call('PUT', '/api/settings/online-mode', { online: false })).body, { online: false })
    const calls = claude.state.statusCalls
    assert.equal((await hub.call<AiStatus>('GET', '/api/ai/status')).body.online, false)
    assert.equal(claude.state.statusCalls, calls)
  })

  it('Ollama injoignable, modèle par défaut absent, Ollama désactivé : dits dans l’état', async () => {
    const ollama = fakeOllama([], { models: ['gemma3:4b'] })
    const hub = await startHub({ ai: fakeAi({ ollama }) })
    const missing = (await hub.call<AiStatus>('GET', '/api/ai/status')).body.ollama
    assert.deepEqual([missing.reachable, missing.default_installed, missing.models.map((m) => m.name)], [true, false, ['gemma3:4b']])
    ollama.state.down = true
    const down = (await hub.call<AiStatus>('GET', '/api/ai/status')).body.ollama
    assert.deepEqual([down.reachable, down.models], [false, []])
    assert.match(down.error ?? '', /^Ollama est injoignable sur http:\/\/127\.0\.0\.1:11434/)
    const disabled = await startHub({ ai: fakeAi({ ollama: null }) })
    const state = (await disabled.call<AiStatus>('GET', '/api/ai/status')).body
    assert.deepEqual([state.ollama.reachable, state.ollama.error, state.auto], [false, 'OLLAMA_URL n’est pas une adresse de cette machine : Ollama est désactivé', 'ollama'])
  })

  it('le mode en ligne ne se change que par sa route, depuis cette machine', async () => {
    const hub = await startHub()
    const foreign = await hub.call<Failure>('PUT', '/api/settings/online-mode', { online: true }, { origin: 'https://exemple.fr' })
    assert.deepEqual([foreign.status, foreign.body.code], [403, 'FORBIDDEN_ORIGIN'])
    assert.equal((await hub.call<Failure>('PUT', '/api/settings/online-mode', { online: true }, { origin: 'null' })).status, 403)
    assert.equal((await hub.call<Failure>('PUT', '/api/settings/online-mode', { online: true }, { host: 'hub.exemple.fr' })).status, 403)
    assert.equal(isOnline(hub.db), false)
    for (const body of [{}, { online: 'oui' }, { online: true, engine: 'claude' }]) {
      assert.equal((await hub.call<Failure>('PUT', '/api/settings/online-mode', body)).status, 422, JSON.stringify(body))
    }
    assert.equal(isOnline(hub.db), false)
    assert.equal((await hub.call('PUT', '/api/settings/online-mode', { online: true }, { origin: 'http://127.0.0.1:5177' })).status, 200)
    assert.equal(isOnline(hub.db), true)
    assert.equal((await hub.call<Failure>('GET', '/api/ai/status?refresh=peut-etre')).status, 422)
  })
})

describe('rédaction avec Ollama', () => {
  it('réponse valide : le texte est enregistré, avec son moteur, son modèle et sa date', async () => {
    const ollama = fakeOllama([answer([1, KPIS_TEXT])])
    const ctx = await setup(fakeAi({ ollama }))
    const kpis = ctx.of('kpis')
    const { status, body } = await ctx.write({ slide_ids: [kpis.id] })
    assert.equal(status, 200)
    assert.deepEqual([body.engine, body.model, body.written, body.kept], ['ollama', 'llama3.1:8b', [kpis.id], []])
    assert.deepEqual(body.slides.map((s) => [s.id, s.body, s.text_source, s.text_model, s.title]), [[kpis.id, KPIS_TEXT, 'ollama', 'llama3.1:8b', null]])
    assert.match(body.slides[0]!.text_at ?? '', /^\d{4}-\d\d-\d\dT/)
    assert.deepEqual(ctx.of('kpis'), body.slides[0])
    assert.equal(ollama.calls.length, 1)
    // À la lecture : le texte est affiché, daté, et correspond aux chiffres du jour.
    const read = (await ctx.call<Deck>('GET', `/api/presentations/${ctx.pid}`)).body.slides.find((s) => s.id === kpis.id)!
    assert.deepEqual([read.body, read.text_source, read.stale], [KPIS_TEXT, 'ollama', []])
    // Les autres diapositives gardent leur phrase automatique.
    assert.ok(ctx.slides().every((s) => s.id === kpis.id || (s.body === null && s.text_source === 'auto')))
  })

  it('ce qui part : consignes dans le prompt système, faits dans des blocs, schéma, modèle choisi', async () => {
    const ollama = fakeOllama([answer([1, KPIS_TEXT], [2, 'Le prochain jalon est le comité de pilotage, le 26 novembre 2026.'])])
    const ctx = await setup(fakeAi({ ollama }))
    const { body } = await ctx.write({ slide_ids: [ctx.of('kpis').id, ctx.of('milestones').id], model: 'llama3.2', instructions: 'Pour la DAF, ton direct.' })
    assert.deepEqual([body.model, body.written.length], ['llama3.2:1b', 2])
    const call = ollama.calls[0]!
    assert.deepEqual([call.model, call.temperature], ['llama3.2:1b', 0.2])
    assert.deepEqual(call.messages.map((m) => m.role), ['system', 'user'])
    assert.equal(call.messages[0]!.content, WRITE_SYSTEM)
    const user = call.messages[1]!.content
    assert.ok(user.startsWith("Consignes de l'auteur : Pour la DAF, ton direct.\n<donnees type=\"faits généraux\">\n- Fiche : KPI CGO\n"))
    assert.ok(user.includes('<donnees type="diapositive" n="1" sorte="Chiffres clés (Projets)">\n- Titre : Chiffres clés\n'))
    assert.ok(user.includes('<donnees type="diapositive" n="2" sorte="Jalons (Projets)">\n- Titre : Jalons\n'))
    assert.ok(user.includes('- « Comité de pilotage » — 26 novembre 2026'))
    assert.deepEqual((call.format as { properties: { diapositives: { maxItems: number } } }).properties.diapositives.maxItems, 2)
    // Les apps ont été relues une fois (les faits sont ceux du moment).
    assert.ok(ctx.suite.calls.length > 0)
  })

  it('nombre inventé : une relance, puis retrait avec la raison', async () => {
    const invented = answer([1, '3 features terminées sur 6, soit 50 %.'])
    const ollama = fakeOllama([invented, answer([1, 'Désormais 4 features sont terminées sur 6.'])])
    const ctx = await setup(fakeAi({ ollama }))
    const kpis = ctx.of('kpis')
    const { status, body } = await ctx.write({ slide_ids: [kpis.id] })
    assert.equal(status, 200)
    assert.deepEqual([body.written, body.slides, body.kept], [[], [], [{ slide_id: kpis.id, reason: 'chiffre non vérifiable : 4' }]])
    assert.equal(ollama.calls.length, 2, 'un appel et une seule relance')
    const retry = ollama.calls[1]!.messages
    assert.deepEqual(retry.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
    assert.equal(retry[2]!.content, invented)
    assert.match(retry[3]!.content, /^Ta réponse contient des erreurs :\n- Diapositive 1 : cite « 3 », « 50 % », absents des faits\.\n/)
    // La diapositive garde sa phrase automatique.
    assert.deepEqual([ctx.of('kpis').body, ctx.of('kpis').text_source], [null, 'auto'])
  })

  it('la relance ne porte que sur les diapositives fautives ; ce qui était juste est gardé', async () => {
    const good = 'Le prochain jalon est le comité de pilotage, le 26 novembre 2026.'
    const ollama = fakeOllama([answer([1, 'Déjà 75 % du chemin.'], [2, good]), answer([1, KPIS_TEXT])])
    const ctx = await setup(fakeAi({ ollama }))
    const [kpis, milestones] = [ctx.of('kpis'), ctx.of('milestones')]
    const { body } = await ctx.write({ slide_ids: [kpis.id, milestones.id] })
    assert.deepEqual([body.written.sort(), body.kept], [[kpis.id, milestones.id].sort(), []])
    assert.deepEqual([ctx.of('kpis').body, ctx.of('milestones').body], [KPIS_TEXT, good])
    assert.equal(ollama.calls.length, 2)
    assert.match(ollama.calls[1]!.messages[3]!.content, /Réécris seulement cette diapositive/)
  })

  it('réponse illisible : la diapositive est gardée telle quelle', async () => {
    const ollama = fakeOllama(['Je ne sais pas.', '{"diapositives": [{"n": 1, "texte": '])
    const ctx = await setup(fakeAi({ ollama }))
    const kpis = ctx.of('kpis')
    const { status, body } = await ctx.write({ slide_ids: [kpis.id] })
    assert.deepEqual([status, body.written, body.kept], [200, [], [{ slide_id: kpis.id, reason: 'réponse illisible' }]])
    assert.equal(ollama.calls.length, 2)
    assert.equal(ctx.of('kpis').body, null)
  })

  it('Ollama injoignable : 502, aucun appel, rien n’est changé, aucune app lue', async () => {
    const ollama = fakeOllama([], { down: true })
    const ctx = await setup(fakeAi({ ollama }))
    const before = ctx.slides()
    const { status, body } = await ctx.write<Failure>({ slide_ids: [ctx.of('kpis').id] })
    assert.deepEqual([status, body.code], [502, 'AI_UNAVAILABLE'])
    assert.match(body.detail, /^Ollama est injoignable sur http:\/\/127\.0\.0\.1:11434 : lance Ollama\./)
    assert.deepEqual([ollama.calls.length, ctx.suite.calls], [0, []])
    assert.deepEqual(ctx.slides(), before)
  })

  it('modèle absent : 502 AI_MODEL_MISSING, avec la commande pour l’installer', async () => {
    const ollama = fakeOllama([], { models: ['gemma3:4b'] })
    const ctx = await setup(fakeAi({ ollama }))
    const missing = await ctx.write<Failure>({ slide_ids: [ctx.of('kpis').id] })
    assert.deepEqual([missing.status, missing.body], [502, { detail: 'Modèle absent d’Ollama (llama3.1:8b) : installe-le avec « ollama pull llama3.1:8b »', code: 'AI_MODEL_MISSING' }])
    const asked = await ctx.write<Failure>({ slide_ids: [ctx.of('kpis').id], model: 'qwen3' })
    assert.deepEqual([asked.status, asked.body.code], [502, 'AI_MODEL_MISSING'])
    assert.match(asked.body.detail, /ollama pull qwen3/)
    assert.deepEqual([ollama.calls.length, ctx.suite.calls], [0, []])
  })

  it('erreur du moteur pendant l’appel : 502 ou 504, rien n’est écrit', async () => {
    const ollama = fakeOllama([new OllamaError('failed', 'Erreur d’Ollama : out of memory'), new OllamaError('timeout', 'Ollama n’a pas répondu en 120 s (OLLAMA_TIMEOUT_MS)'), answer([1, 'Déjà 75 % du chemin.']), new Error('ECONNRESET /Users/moi/secret')])
    const ctx = await setup(fakeAi({ ollama }))
    const id = ctx.of('kpis').id
    assert.deepEqual((await ctx.write<Failure>({ slide_ids: [id] })).body, { detail: 'Erreur d’Ollama : out of memory', code: 'AI_ERROR' })
    const late = await ctx.write<Failure>({ slide_ids: [id] })
    assert.deepEqual([late.status, late.body], [504, { detail: 'Ollama n’a pas répondu en 120 s (OLLAMA_TIMEOUT_MS)', code: 'AI_TIMEOUT' }])
    // Une erreur inattendue pendant la relance : rien n'est écrit, et son texte ne sort pas du Hub.
    const odd = await ctx.write<Failure>({ slide_ids: [id] })
    assert.deepEqual([odd.status, odd.body], [502, { detail: 'Erreur inattendue d’Ollama', code: 'AI_ERROR' }])
    assert.equal(ctx.of('kpis').body, null)
  })

  it('aucune candidate : 200, aucune lecture d’un moteur, les raisons sont dites', async () => {
    const ollama = fakeOllama()
    const ctx = await setup(fakeAi({ ollama }))
    const text = (await ctx.call<SlideRecord>('POST', `/api/presentations/${ctx.pid}/slides`, { kind: 'text' })).body
    const page = (await ctx.call<SlideRecord>('POST', `/api/presentations/${ctx.pid}/slides`, { kind: 'wiki', ref: '41', ref_label: 'Dictionnaire des indicateurs' })).body
    const gone = (await ctx.call<SlideRecord>('POST', `/api/presentations/${ctx.pid}/slides`, { kind: 'viz', ref: 'disparu', ref_label: 'Ancien rapport' })).body
    const features = ctx.of('features')
    await ctx.call('PATCH', `/api/presentations/${ctx.pid}/slides/${features.id}`, { body: 'Mon analyse des features.' })
    ctx.down.add('convert')
    const { status, body } = await ctx.write({ slide_ids: [text.id, page.id, gone.id, features.id, ctx.of('convert').id] })
    assert.equal(status, 200)
    assert.deepEqual([body.engine, body.model, body.written, body.slides], ['ollama', 'llama3.1:8b', [], []])
    assert.deepEqual(body.kept, [
      { slide_id: text.id, reason: 'pas de données à commenter' },
      { slide_id: page.id, reason: 'le contenu d’une page du Wiki ne part pas vers l’IA' },
      { slide_id: gone.id, reason: '« Ancien rapport » n’est plus rattaché à cette fiche, ou n’existe plus dans Atelier Viz.' },
      { slide_id: features.id, reason: 'ton texte est gardé' },
      { slide_id: ctx.of('convert').id, reason: (await ctx.call<Deck>('GET', `/api/presentations/${ctx.pid}`)).body.slides.find((s) => s.kind === 'convert' && !s.ref)!.live.message },
    ])
    assert.equal(ollama.calls.length, 0)
  })

  it('un texte écrit à la main est gardé, sauf « Réécrire aussi mes textes »', async () => {
    const ollama = fakeOllama([answer([1, KPIS_TEXT]), answer([1, KPIS_TEXT])])
    const ctx = await setup(fakeAi({ ollama }))
    const kpis = ctx.of('kpis')
    await ctx.call('PATCH', `/api/presentations/${ctx.pid}/slides/${kpis.id}`, { body: 'Mon texte.' })
    const kept = (await ctx.write({ slide_ids: [kpis.id] })).body
    assert.deepEqual([kept.written, kept.kept], [[], [{ slide_id: kpis.id, reason: 'ton texte est gardé' }]])
    assert.deepEqual([ctx.of('kpis').body, ctx.of('kpis').text_source, ollama.calls.length], ['Mon texte.', 'manual', 0])
    const forced = (await ctx.write({ slide_ids: [kpis.id], overwrite_manual: true })).body
    assert.deepEqual([forced.written, ctx.of('kpis').body, ctx.of('kpis').text_source], [[kpis.id], KPIS_TEXT, 'ollama'])
    // Un texte déjà rédigé par l'IA se réécrit sans la case.
    assert.deepEqual((await ctx.write({ slide_ids: [kpis.id] })).body.written, [kpis.id])
  })

  it('un texte écrit à la main pendant l’appel n’est pas écrasé', async () => {
    const ollama = fakeOllama()
    const ctx = await setup(fakeAi({ ollama }))
    const kpis = ctx.of('kpis')
    // La saisie arrive pendant que le moteur rédige (un appel dure des dizaines de secondes).
    ollama.script.push(async () => {
      await ctx.call('PATCH', `/api/presentations/${ctx.pid}/slides/${kpis.id}`, { body: 'Écrit pendant que l’IA rédigeait.' })
      return answer([1, KPIS_TEXT])
    })
    const { body } = await ctx.write({ slide_ids: [kpis.id] })
    assert.deepEqual([body.written, body.kept], [[], [{ slide_id: kpis.id, reason: 'ton texte est gardé' }]])
    assert.deepEqual([ctx.of('kpis').body, ctx.of('kpis').text_source], ['Écrit pendant que l’IA rédigeait.', 'manual'])
    // De même pour une diapositive supprimée pendant l'appel.
    const viz = ctx.of('viz')
    ollama.script.push(async () => {
      await ctx.call('DELETE', `/api/presentations/${ctx.pid}/slides/${viz.id}`)
      return answer([1, 'Deux rapports dans Atelier Viz.'])
    })
    const gone = (await ctx.write({ slide_ids: [viz.id] })).body
    assert.deepEqual([gone.written, gone.kept], [[], [{ slide_id: viz.id, reason: 'la diapositive a été supprimée entre-temps' }]])
  })

  it('demande abandonnée par le navigateur : l’appel au moteur est interrompu, rien n’est écrit', async () => {
    const ollama = fakeOllama()
    const ctx = await setup(fakeAi({ ollama }))
    const kpis = ctx.of('kpis')
    let interrupted: (value: boolean) => void = () => {}
    const aborted = new Promise<boolean>((resolve) => (interrupted = resolve))
    ollama.script.push(
      (request) =>
        new Promise<string>((_resolve, reject) => {
          const hold = setTimeout(() => interrupted(false), 5000)
          request.signal?.addEventListener('abort', () => {
            clearTimeout(hold)
            interrupted(true)
            reject(new OllamaError('cancelled', 'Rédaction annulée'))
          })
        }),
    )
    // Une vraie connexion (port libre, bouclage) : c'est sa fermeture qui interrompt le moteur.
    const address = await ctx.app.listen({ host: '127.0.0.1', port: 0 })
    const controller = new AbortController()
    const pending = fetch(`${address}/api/presentations/${ctx.pid}/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slide_ids: [kpis.id] }),
      signal: controller.signal,
    }).catch((error: unknown) => (error as Error).name)
    while (ollama.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    assert.equal(await pending, 'AbortError')
    assert.equal(await aborted, true, 'le moteur a reçu l’abandon')
    assert.equal(ollama.calls.length, 1, 'pas de relance')
    assert.equal(ctx.of('kpis').body, null)
  })

  it('ce qui part vers Ollama tient en 3 000 caractères, même pour douze diapositives', async () => {
    const ollama = fakeOllama(['{}', '{}'])
    const ctx = await setup(fakeAi({ ollama }))
    const all = ctx.slides()
    assert.equal(all.length, 12)
    const { status, body } = await ctx.write({ slide_ids: all.map((s) => s.id), instructions: 'x'.repeat(WRITE_LIMITS.instructions) })
    assert.equal(status, 200)
    assert.equal(body.kept.length, 12)
    for (const call of ollama.calls.slice(0, 1)) {
      const user = call.messages[1]!.content
      assert.ok(user.length <= WRITE_LIMITS.ollamaChars, String(user.length))
      assert.ok(user.length > 2000, 'la place admise est utilisée')
      // Chaque diapositive garde au moins son titre.
      assert.equal(user.match(/<donnees type="diapositive"/g)?.length, 12)
      assert.equal(user.match(/\n- Titre : /g)?.length, 12)
    }
    const long = await ctx.write<Failure>({ slide_ids: [all[2]!.id], instructions: 'x'.repeat(WRITE_LIMITS.instructions + 1) })
    assert.deepEqual([long.status, long.body.code], [422, 'VALIDATION'])
  })

  it('ni adresse, ni chemin, ni identifiant, ni extrait d’une page du Wiki dans ce qui part', async () => {
    const ollama = fakeOllama(Array.from({ length: 24 }, () => '{}'))
    const ctx = await setup(fakeAi({ ollama, maxChars: 100_000 }))
    // Les pages du Wiki ont un extrait de leur contenu.
    ctx.replaced.set('http://wiki/api/atelier/pages', {
      format: 'atelier-table/1', name: 'pages', label: 'pages', columns: [], total: 1, truncated: false,
      rows: [{ id: '41', titre: 'Dictionnaire des indicateurs', espace_id: '7', espace: 'KPI CGO', maj_le: '2026-11-09T16:20:00+01:00', extrait: 'CONTENU-DE-LA-PAGE : la marge se calcule ainsi.' }],
    })
    const deck = (await ctx.call<Deck>('GET', `/api/presentations/${ctx.pid}`)).body
    assert.equal(deck.slides.find((s) => s.kind === 'wiki')!.live.rows[0]!.detail, 'CONTENU-DE-LA-PAGE : la marge se calcule ainsi.', 'la diapositive, elle, montre l’extrait')
    assert.equal(deck.slides.length, 12)
    // Une diapositive par requête (comme l'interface avec Ollama) et une taille large : rien n'est retiré faute de place.
    for (const slide of deck.slides) assert.equal((await ctx.write({ slide_ids: [slide.id] })).status, 200)
    assert.equal(ollama.calls.length, 24)
    const sent = JSON.stringify(ollama.calls.map((call) => [call.messages, call.format]))
    assert.ok(sent.includes('Dictionnaire des indicateurs') && sent.includes('Support du comité'), 'les titres et les noms partent')
    for (const secret of ['CONTENU', 'la marge se calcule', 'http', '127.0.0.1', '~/Documents', '0COPA_C01', 'Extraction mensuelle', 'exemple.fr', 'a1b2c3d4e5f6', 'c00000000001', 'data_analyst', 'FBL3N']) assert.ok(!sent.includes(secret), secret)
  })

  it('refuse une demande mal formée ou qui vise une autre présentation', async () => {
    const ollama = fakeOllama()
    const ctx = await setup(fakeAi({ ollama }))
    const id = ctx.of('kpis').id
    const bad: object[] = [
      {},
      { slide_ids: [] },
      { slide_ids: Array.from({ length: 13 }, (_, i) => i + 1) },
      { slide_ids: [id, id] },
      { slide_ids: [id], engine: 'gpt' },
      { slide_ids: [id], claude_model: 'fable' },
      { slide_ids: [id], model: 'x'.repeat(101) },
      { slide_ids: [id], overwrite_manual: 'oui' },
      { slide_ids: [id], title: 'Un titre écrit par l’IA' },
    ]
    for (const body of bad) assert.equal((await ctx.write<Failure>(body)).status, 422, JSON.stringify(body))
    const other = (await ctx.call<PresentationSummary>('POST', `/api/projects/${ctx.project.id}/presentations`, { plan: false })).body
    const foreign = listSlides(ctx.db, other.id)[0]!
    assert.deepEqual((await ctx.write<Failure>({ slide_ids: [id, foreign.id] })).body, { detail: 'Diapositive introuvable', code: 'NOT_FOUND' })
    assert.equal((await ctx.call<Failure>('POST', '/api/presentations/9999/write', { slide_ids: [id] })).status, 404)
    assert.equal((await ctx.write<Failure>({ slide_ids: [id] }, { origin: 'https://exemple.fr' })).status, 403)
    assert.deepEqual([ollama.calls.length, ollama.state.lists, ctx.suite.calls], [0, 0, []])
  })

  it('Ollama désactivé (OLLAMA_URL non local) : 502, sans aucun appel', async () => {
    const claude = fakeClaude()
    const ctx = await setup(fakeAi({ ollama: null, claude }))
    for (const engine of ['ollama', 'auto']) {
      const { status, body } = await ctx.write<Failure>({ slide_ids: [ctx.of('kpis').id], engine })
      assert.deepEqual([status, body], [502, { detail: 'OLLAMA_URL n’est pas une adresse de cette machine : Ollama est désactivé. La présentation garde ses phrases automatiques.', code: 'AI_UNAVAILABLE' }], engine)
    }
    assert.deepEqual([ctx.suite.calls, claude.calls.length, claude.state.statusCalls], [[], 0, 0])
  })
})

describe('Claude : seulement en ligne', () => {
  it('hors ligne : 403 CLAUDE_OFFLINE, la CLI n’est pas lancée, aucune app n’est lue', async () => {
    const claude = fakeClaude([answer([1, KPIS_TEXT])])
    const ollama = fakeOllama()
    const ctx = await setup(fakeAi({ ollama, claude }))
    const { status, body } = await ctx.write<Failure>({ slide_ids: [ctx.of('kpis').id], engine: 'claude', claude_model: 'opus' })
    assert.deepEqual([status, body], [403, { detail: OFFLINE_MESSAGE, code: 'CLAUDE_OFFLINE' }])
    assert.deepEqual([claude.calls.length, claude.state.statusCalls], [0, 0], 'zéro appel au moteur Claude, pas même son état')
    assert.deepEqual(ctx.suite.calls, [], 'zéro lecture des apps')
    assert.deepEqual([ollama.calls.length, ollama.state.lists], [0, 0])
    assert.equal(ctx.of('kpis').body, null)
  })

  it('hors ligne, « Auto » (et l’absence de choix) retient Ollama sans interroger Claude', async () => {
    const claude = fakeClaude()
    const ollama = fakeOllama([answer([1, KPIS_TEXT]), answer([1, KPIS_TEXT])])
    const ctx = await setup(fakeAi({ ollama, claude }))
    const id = ctx.of('kpis').id
    assert.equal((await ctx.write({ slide_ids: [id], engine: 'auto' })).body.engine, 'ollama')
    assert.equal((await ctx.write({ slide_ids: [id] })).body.engine, 'ollama')
    assert.deepEqual([claude.calls.length, claude.state.statusCalls, ollama.calls.length], [0, 0, 2])
  })

  it('en ligne, le moteur n’est pas encore là : 502 CLAUDE_UNAVAILABLE ; « Auto » retient Ollama', async () => {
    const ollama = fakeOllama([answer([1, KPIS_TEXT])])
    const ctx = await setup(fakeAi({ ollama, claude: absentClaude() }))
    await ctx.call('PUT', '/api/settings/online-mode', { online: true })
    const id = ctx.of('kpis').id
    const { status, body } = await ctx.write<Failure>({ slide_ids: [id], engine: 'claude' })
    assert.deepEqual([status, body], [502, { detail: 'Claude n’est pas installé sur cette machine', code: 'CLAUDE_UNAVAILABLE' }])
    assert.deepEqual([ctx.suite.calls, ollama.calls.length], [[], 0])
    const status2 = (await ctx.call<AiStatus>('GET', '/api/ai/status')).body
    assert.deepEqual([status2.online, status2.auto, status2.claude.available, status2.claude.installed, status2.claude.error], [true, 'ollama', false, false, 'Claude n’est pas installé sur cette machine'])
    assert.equal((await ctx.write({ slide_ids: [id], engine: 'auto' })).body.engine, 'ollama')
  })

  it('en ligne et disponible : Claude rédige (même contrôle, même relance), « Auto » le retient', async () => {
    const good = 'Le prochain jalon est le comité de pilotage, le 26 novembre 2026.'
    const claude = fakeClaude([answer([1, 'Déjà 75 % du chemin.'], [2, good]), answer([1, 'Toujours 75 %.']), answer([1, KPIS_TEXT])])
    const ollama = fakeOllama()
    const ctx = await setup(fakeAi({ ollama, claude }))
    await ctx.call('PUT', '/api/settings/online-mode', { online: true })
    const [kpis, milestones] = [ctx.of('kpis'), ctx.of('milestones')]
    const { status, body } = await ctx.write({ slide_ids: [kpis.id, milestones.id], engine: 'claude', claude_model: 'opus', instructions: 'CONSIGNE-RECONNAISSABLE' })
    assert.equal(status, 200)
    assert.deepEqual([body.engine, body.model, body.written, body.kept], ['claude', 'opus', [milestones.id], [{ slide_id: kpis.id, reason: 'chiffre non vérifiable : 75 %' }]])
    assert.deepEqual(body.slides.map((s) => [s.body, s.text_source, s.text_model]), [[good, 'claude', 'opus']])
    assert.equal(claude.calls.length, 2)
    // Le prompt système (un argument de ligne de commande pour la CLI) ne porte aucune donnée : tout est dans la conversation.
    const call = claude.calls[0]!
    assert.deepEqual([call.model, call.messages[0]!.role, call.messages[0]!.content], ['opus', 'system', WRITE_SYSTEM])
    assert.ok(!JSON.stringify([call.messages[0], call.schema]).match(/CONSIGNE|KPI CGO|Comité de pilotage/))
    assert.ok(call.messages[1]!.content.includes('CONSIGNE-RECONNAISSABLE') && call.messages[1]!.content.includes('Comité de pilotage'))
    // « Auto » en ligne : Claude, modèle Sonnet par défaut.
    const auto = (await ctx.write({ slide_ids: [kpis.id] })).body
    assert.deepEqual([auto.engine, auto.model, auto.written], ['claude', 'sonnet', [kpis.id]])
    assert.deepEqual([ctx.of('kpis').text_source, ctx.of('kpis').text_model], ['claude', 'sonnet'])
    assert.equal(ollama.calls.length, 0)
  })

  it('le Hub repasse hors ligne pendant la lecture des apps : rien ne part vers Claude', async () => {
    const claude = fakeClaude([answer([1, KPIS_TEXT])])
    const hub = await startHub({ ai: fakeAi({ claude }) })
    const project = await kpiCgo(hub)
    const pid = (await hub.call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, {})).body.id
    const kpis = listSlides(hub.db, pid).find((s) => s.kind === 'kpis')!
    setOnline(hub.db, true)
    // L'utilisateur coupe le mode en ligne alors que la demande est en route (le moteur est déjà choisi).
    const status = claude.engine.status.bind(claude.engine)
    claude.engine.status = async (options) => {
      const state = await status(options)
      setOnline(hub.db, false)
      return state
    }
    const { status: code, body } = await hub.call<Failure>('POST', `/api/presentations/${pid}/write`, { slide_ids: [kpis.id], engine: 'claude' })
    assert.deepEqual([code, body.code], [403, 'CLAUDE_OFFLINE'])
    assert.equal(claude.calls.length, 0)
    assert.equal(listSlides(hub.db, pid).find((s) => s.id === kpis.id)!.body, null)
  })
})
