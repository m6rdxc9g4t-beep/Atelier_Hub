// Moteur Claude : la CLI Claude Code lancée isolée (docs/SUITE.md §5.3 d'Atelier Projets). L'exécutant est toujours
// simulé : aucun test ne lance la vraie CLI (le seul processus lancé est un script shell écrit par le test).

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'

import {
  claudeArguments,
  claudeEnvironment,
  ClaudeError,
  CLAUDE_STATUS_REFRESH_MIN_MS,
  CLAUDE_STATUS_TTL_MS,
  createClaudeEngine,
  formatConversation,
  parseResult,
  spawnRunner,
  type ClaudeEngineOptions,
} from '../src/ai/claude.js'
import { claudeFallbackDirs, executableNames, findClaudeExecutable, resolveClaudeLaunch, searchDirs, sessionPath } from '../src/ai/claude-find.js'
import { WRITE_SYSTEM, writeSchema } from '../src/ai/prompts.js'
import { loadConfig } from '../src/config.js'
import type { AiStatus, PresentationSummary, SlideKind, WriteResult } from '../src/domain/types.js'
import { createAi } from '../src/services/ai.js'
import { listSlides } from '../src/services/presentations.js'
import { OFFLINE_MESSAGE } from '../src/services/settings.js'
import { fakeAi, fakeOllama } from './fixtures/ai.js'
import { failed, fakeCli, result, sandbox, scriptedRunner, written, type ScriptedRunner } from './fixtures/claude.js'
import { kpiCgo, startHub, type Failure } from './fixtures/hub.js'

const posixOnly = { skip: process.platform === 'win32' && 'scripts shell et PATH POSIX : macOS / Linux' }
const ISOLATION = ['-p', '--safe-mode', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']
const KPIS_TEXT = 'Le projet avance : 2 features terminées sur 6, soit 33\u00a0%.'
const SCHEMA = writeSchema(1)

const dir = sandbox()
const cli = fakeCli(dir, 'bin')

/** Environnement du Hub d'un test : ce que la CLI doit recevoir, et ce qu'elle ne doit jamais voir. */
const HUB_ENV: NodeJS.ProcessEnv = {
  HOME: '/home/moi',
  USER: 'moi',
  LOGNAME: 'moi',
  SHELL: '/bin/zsh',
  LANG: 'fr_FR.UTF-8',
  LC_ALL: 'fr_FR.UTF-8',
  TMPDIR: tmpdir(),
  TZ: 'Europe/Paris',
  CLAUDE_CONFIG_DIR: '/home/moi/.config/claude',
  PATH: `/usr/bin:relatif:.:/depot/node_modules/.bin:/bin`,
  ANTHROPIC_API_KEY: 'sk-ant-api03-CLE-DU-PROCESSUS',
  ANTHROPIC_AUTH_TOKEN: 'JETON-ANTHROPIC',
  ANTHROPIC_BASE_URL: 'https://ailleurs.exemple.fr',
  CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-JETON-HERITE',
  CLAUDE_CODE_USE_BEDROCK: '1',
  GITHUB_TOKEN: 'ghp_SECRET',
  HUB_DATA_DIR: '/data',
  OLLAMA_URL: 'http://127.0.0.1:11434',
  NODE_OPTIONS: '--inspect',
}

/** Ce que la CLI reçoit de `HUB_ENV` : la liste blanche de §5.3, rien d'autre. */
const CLI_ENV = {
  HOME: '/home/moi',
  USER: 'moi',
  LOGNAME: 'moi',
  SHELL: '/bin/zsh',
  LANG: 'fr_FR.UTF-8',
  LC_ALL: 'fr_FR.UTF-8',
  TMPDIR: tmpdir(),
  TZ: 'Europe/Paris',
  CLAUDE_CONFIG_DIR: '/home/moi/.config/claude',
  PATH: `${dirname(cli)}:/usr/bin:/bin`,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
}

const engineOf = (runner: ScriptedRunner, more: ClaudeEngineOptions = {}) => createClaudeEngine({ command: cli, env: HUB_ENV, fallbackDirs: [], runner: runner.runner, ...more })
const ask = (texte = 'Bonjour') => ({ model: 'sonnet' as const, messages: [{ role: 'system' as const, content: WRITE_SYSTEM }, { role: 'user' as const, content: texte }], schema: SCHEMA })

/** L'erreur levée par un appel, ou un échec du test s'il aboutit. */
async function failure(run: Promise<unknown>): Promise<ClaudeError> {
  try {
    await run
  } catch (error) {
    assert.ok(error instanceof ClaudeError, `ClaudeError attendue, reçu : ${String(error)}`)
    return error
  }
  throw new Error('une erreur était attendue')
}

/** Fiche « KPI CGO » et sa présentation générée, sur un Hub dont Claude est le vrai moteur, à l'exécutant simulé. */
async function setup(runner: ScriptedRunner, more: ClaudeEngineOptions = {}) {
  const ollama = fakeOllama()
  const hub = await startHub({ ai: fakeAi({ ollama, claude: engineOf(runner, more) }) })
  const project = await kpiCgo(hub)
  const pid = (await hub.call<PresentationSummary>('POST', `/api/projects/${project.id}/presentations`, {})).body.id
  const of = (kind: SlideKind) => listSlides(hub.db, pid).find((s) => s.kind === kind)!
  const write = <T = WriteResult>(body: object) => hub.call<T>('POST', `/api/presentations/${pid}/write`, body)
  const online = () => hub.call('PUT', '/api/settings/online-mode', { online: true })
  hub.suite.calls.length = 0
  return { ...hub, ollama, pid, of, write, online }
}

describe('Claude : arguments, environnement, conversation', () => {
  it('arguments exacts de §5.3, schéma en dernier', () => {
    assert.deepEqual(claudeArguments({ model: 'opus', system: 'Consignes', maxTurns: 2, schema: { type: 'object' } }), [
      ...ISOLATION, '--max-turns', '2', '--model', 'opus', '--system-prompt', 'Consignes', '--json-schema', '{"type":"object"}',
    ])
    assert.deepEqual(claudeArguments({ model: 'haiku', system: 'Consignes', maxTurns: 1 }), [...ISOLATION, '--max-turns', '1', '--model', 'haiku', '--system-prompt', 'Consignes'])
  })

  it('environnement = liste blanche exacte : ni clé Anthropic, ni jeton, ni secret ni réglage du Hub', () => {
    assert.deepEqual(claudeEnvironment(HUB_ENV, cli, 'linux'), CLI_ENV)
    // Sans PATH, la CLI garde de quoi trouver ses outils, précédés de son propre dossier.
    assert.equal(claudeEnvironment({ HOME: '/home/moi' }, cli, 'linux').PATH, `${dirname(cli)}:/usr/bin:/bin`)
  })

  it('Windows : liste blanche de §5.3 et de §9.6 (casse indifférente), « Path » sous ce nom, rien d’autre', () => {
    const env = claudeEnvironment(
      { Path: 'C:\\Windows\\system32;relatif;C:\\depot\\node_modules\\.bin', USERPROFILE: 'C:\\Users\\moi', SYSTEMROOT: 'C:\\Windows', AppData: 'C:\\Users\\moi\\AppData\\Roaming', ANTHROPIC_API_KEY: 'sk-ant-api03-X', HUB_DATA_DIR: 'C:\\data' },
      'C:\\Outils\\claude.exe',
      'win32',
    )
    assert.deepEqual(env, {
      USERPROFILE: 'C:\\Users\\moi',
      SYSTEMROOT: 'C:\\Windows',
      AppData: 'C:\\Users\\moi\\AppData\\Roaming',
      Path: 'C:\\Outils;C:\\Windows\\system32',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    })
  })

  it('le prompt système part à part ; une relance devient une transcription sur l’entrée standard', () => {
    assert.deepEqual(formatConversation([{ role: 'system', content: ' Consignes ' }, { role: 'user', content: 'Faits' }]), { system: 'Consignes', prompt: 'Faits' })
    const retry = formatConversation([{ role: 'system', content: 'Consignes' }, { role: 'user', content: 'Faits' }, { role: 'assistant', content: '{"n":1}' }, { role: 'user', content: 'Corrige' }])
    assert.equal(retry.system, 'Consignes')
    assert.equal(retry.prompt, 'Voici la conversation jusqu’ici :\n\nUtilisateur : Faits\n\nAssistant : {"n":1}\n\nUtilisateur : Corrige\n\nRéponds au dernier message de l’utilisateur, sans préfixe.')
    assert.ok(formatConversation([{ role: 'user', content: 'Faits' }]).system.length > 0, 'jamais de prompt système vide : celui de Claude Code reviendrait')
  })

  it('lit l’objet final de la sortie, même précédé d’autres lignes', () => {
    assert.deepEqual(parseResult(result({ result: 'ok' }))?.result, 'ok')
    assert.deepEqual(parseResult(`avertissement\n{"type":"system"}\n${result({ result: 'ok' })}\n`)?.result, 'ok')
    assert.equal(parseResult('pas du JSON'), null)
    assert.equal(parseResult('{"type":"system"}'), null)
  })
})

describe('Claude : recherche de l’exécutable', () => {
  it('CLAUDE_CLI absolu, puis le PATH, puis les dossiers habituels', posixOnly, async () => {
    const [inPath, inFallback] = [fakeCli(dir, 'chemin'), fakeCli(dir, 'habituel')]
    assert.equal(await findClaudeExecutable(cli, '/usr/bin', []), cli)
    assert.equal(await findClaudeExecutable('claude', `/usr/absent:${dirname(inPath)}`, [dirname(inFallback)]), inPath)
    assert.equal(await findClaudeExecutable('claude', '/usr/absent', ['/absent', dirname(inFallback)]), inFallback)
    assert.equal(await findClaudeExecutable('claude', '/usr/absent', ['/absent']), null)
    // Un chemin absolu qui n'existe pas n'est pas remplacé par une CLI trouvée ailleurs ; un dossier n'est pas un exécutable.
    assert.equal(await findClaudeExecutable(join(dir, 'absent', 'claude'), dirname(inPath), [dirname(inFallback)]), null)
    assert.equal(await findClaudeExecutable(dirname(cli), dirname(inPath), []), null)
    assert.deepEqual(claudeFallbackDirs('/home/moi', 'linux'), ['/home/moi/.local/bin', '/opt/homebrew/bin', '/usr/local/bin'])
    assert.deepEqual(claudeFallbackDirs('C:\\Users\\moi', 'win32'), ['C:\\Users\\moi\\.local\\bin'])
  })

  it('ni entrée relative ni node_modules/.bin ; CLAUDE_CLI relatif refusé', posixOnly, async () => {
    const npm = join(dir, 'depot', 'node_modules', '.bin')
    const planted = fakeCli(join(dir, 'depot', 'node_modules'), '.bin')
    assert.equal(dirname(planted), npm)
    assert.deepEqual(searchDirs(`/usr/bin:.:bin::${npm}:/usr/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/usr/bin`, 'linux'), ['/usr/bin'])
    assert.equal(await findClaudeExecutable('claude', `${npm}:.`, []), null, 'la CLI posée dans node_modules/.bin n’est pas retenue')
    assert.equal(await findClaudeExecutable('./claude', dirname(cli), [dirname(cli)]), null)
    assert.equal(await findClaudeExecutable('bin/claude', dirname(cli), [dirname(cli)]), null)
    assert.equal(sessionPath(`/usr/bin:relatif:${npm}`, cli, 'linux'), `${dirname(cli)}:/usr/bin`)

    const runner = scriptedRunner()
    const engine = engineOf(runner, { command: './claude', searchPath: dirname(cli) })
    assert.deepEqual(await engine.status(), { available: false, installed: false, error: 'CLAUDE_CLI doit être un chemin absolu (« ./claude » refusé)', warning: null })
    const error = await failure(engine.chatJson(ask()))
    assert.deepEqual([error.kind, error.message], ['unavailable', 'CLAUDE_CLI doit être un chemin absolu (« ./claude » refusé)'])
    assert.equal(runner.calls.length, 0, 'rien n’est lancé')
  })

  it('Windows : claude.exe, sinon claude.cmd de npm résolu en node.exe + cli.js, jamais par cmd.exe', async () => {
    assert.deepEqual(executableNames('claude', 'win32'), ['claude.exe', 'claude.cmd'])
    assert.deepEqual(executableNames('C:\\Outils\\claude', 'win32'), ['C:\\Outils\\claude.exe', 'C:\\Outils\\claude.cmd', 'C:\\Outils\\claude'])
    assert.deepEqual(executableNames('claude.bat', 'win32'), [])
    assert.deepEqual(executableNames('claude', 'linux'), ['claude'])
    const npm = 'C:\\Users\\moi\\AppData\\Roaming\\npm'
    const script = `${npm}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`
    const files = new Set([script, 'C:\\Program Files\\nodejs\\node.exe'])
    const options = { platform: 'win32' as const, searchPath: 'C:\\Program Files\\nodejs;relatif', exists: (file: string) => files.has(file), readFile: () => '{"bin":{"claude":"cli.js"}}' }
    assert.deepEqual(resolveClaudeLaunch(`${npm}\\claude.cmd`, options), { executable: 'C:\\Program Files\\nodejs\\node.exe', args: [script] })
    assert.deepEqual(resolveClaudeLaunch('C:\\Outils\\claude.exe', options), { executable: 'C:\\Outils\\claude.exe', args: [] })
    // Un « bin » qui sort du paquet, ou node.exe introuvable : refusé.
    assert.equal(resolveClaudeLaunch(`${npm}\\claude.cmd`, { ...options, readFile: () => '{"bin":"..\\\\..\\\\..\\\\autre.js"}' }), null)
    assert.equal(resolveClaudeLaunch(`${npm}\\claude.cmd`, { ...options, searchPath: '' }), null)
    const error = await failure(spawnRunner('C:\\Outils\\claude.cmd', [], { input: null, cwd: dir, env: {}, timeoutMs: 1000 }))
    assert.equal(error.kind, 'unavailable')
    assert.match(error.message, /jamais lancé par cmd\.exe/)
  })

  it('CLI absente : indisponible avec la raison, et rien n’est lancé', async () => {
    const runner = scriptedRunner()
    const engine = engineOf(runner, { command: join(dir, 'absent', 'claude') })
    const status = await engine.status()
    assert.deepEqual([status.available, status.installed], [false, false])
    assert.match(status.error ?? '', /^Claude CLI introuvable : installe Claude Code/)
    assert.equal((await failure(engine.chatJson(ask()))).kind, 'unavailable')
    assert.equal(runner.calls.length, 0)
  })

  it('réglages : CLAUDE_CLI et CLAUDE_TIMEOUT_MS ; le moteur construit est la CLI, et rien n’est lancé à la construction', () => {
    const env = (more: Record<string, string>) => loadConfig({ HUB_STATIC_DIR: '', ...more }).ai
    assert.deepEqual([env({}).claudeCli, env({}).claudeTimeoutMs], ['claude', 180_000])
    assert.deepEqual([env({ CLAUDE_CLI: ' /usr/local/bin/claude ', CLAUDE_TIMEOUT_MS: '60000' }).claudeCli, env({ CLAUDE_TIMEOUT_MS: '60000' }).claudeTimeoutMs], ['/usr/local/bin/claude', 60_000])
    assert.throws(() => env({ CLAUDE_TIMEOUT_MS: 'vite' }), /CLAUDE_TIMEOUT_MS doit être un entier/)
    const claude = createAi(env({ CLAUDE_CLI: join(dir, 'absent', 'claude'), CLAUDE_TIMEOUT_MS: '60000' })).claude
    assert.deepEqual([claude.mode, claude.timeoutMs], ['cli', 60_000])
  })
})

describe('Claude : un appel isolé', () => {
  it('sortie structurée : arguments du contrat, données sur l’entrée standard, dossier vide puis supprimé, environnement nettoyé', async () => {
    const runner = scriptedRunner([written([1, KPIS_TEXT])])
    const engine = engineOf(runner, { timeoutMs: 42_000 })
    const abandon = new AbortController()
    assert.equal(await engine.chatJson({ ...ask('FAIT-RECONNAISSABLE'), model: 'opus', signal: abandon.signal }), JSON.stringify({ diapositives: [{ n: 1, texte: KPIS_TEXT }] }))
    assert.equal(runner.calls.length, 1, 'une demande ne relit pas la connexion')
    const call = runner.calls[0]!
    assert.equal(call.executable, cli)
    assert.deepEqual(call.args, [...ISOLATION, '--max-turns', '2', '--model', 'opus', '--system-prompt', WRITE_SYSTEM, '--json-schema', JSON.stringify(SCHEMA)])
    assert.equal(call.options.input, 'FAIT-RECONNAISSABLE')
    assert.ok(!call.args.join('\n').includes('FAIT-RECONNAISSABLE'), 'aucune donnée en argument')
    assert.equal(call.options.timeoutMs, 42_000)
    assert.equal(call.options.signal, abandon.signal, 'une demande abandonnée par le navigateur arrête la CLI')
    assert.deepEqual(call.options.env, CLI_ENV)
    // Dossier de travail : temporaire, vide pendant l'appel, supprimé ensuite.
    assert.ok(call.options.cwd.startsWith(tmpdir()) && call.cwdExisted)
    assert.deepEqual(call.cwdEntries, [])
    assert.equal(existsSync(call.options.cwd), false)
  })

  it('sans sortie structurée, le texte de la réponse ; sans l’un ni l’autre, une erreur', async () => {
    const runner = scriptedRunner([{ stdout: result({ result: '{"diapositives":[]}' }) }, { stdout: result({}) }])
    const engine = engineOf(runner)
    assert.equal(await engine.chatJson(ask()), '{"diapositives":[]}')
    const error = await failure(engine.chatJson(ask()))
    assert.deepEqual([error.kind, error.message], ['failed', 'Réponse de Claude sans sortie structurée'])
  })

  it('erreurs dites en français : sortie illisible, erreur de Claude, CLI trop ancienne, connexion perdue', async () => {
    const runner = scriptedRunner([
      { stdout: 'pas du JSON', code: 1, stderr: 'boom' },
      failed('Prompt is too long'),
      { stdout: '', code: 1, stderr: "error: unknown option '--safe-mode'" },
      failed('Invalid API key · Please run /login'),
    ])
    const engine = engineOf(runner)
    assert.deepEqual(await failure(engine.chatJson(ask())).then((e) => [e.kind, e.message]), ['failed', 'Réponse illisible de Claude CLI : boom'])
    assert.deepEqual(await failure(engine.chatJson(ask())).then((e) => [e.kind, e.message]), ['failed', 'Erreur de Claude : Prompt is too long'])
    assert.match((await failure(engine.chatJson(ask()))).message, /unknown option '--safe-mode' — mets la CLI à jour : « claude update »$/)
    assert.equal((await engine.status()).available, true)
    const auth = await failure(engine.chatJson(ask()))
    assert.deepEqual([auth.kind, auth.message], ['unavailable', 'Claude CLI non connectée : lance « claude auth login » dans un terminal (Invalid API key · Please run /login)'])
    // La connexion est relue à la demande suivante, sans attendre la fin du cache.
    runner.state.auth = { loggedIn: false }
    assert.equal((await engine.status()).available, false)
    assert.equal(runner.checks().length, 2)
  })

  it('le délai et l’abandon de l’exécutant remontent tels quels', async () => {
    const runner = scriptedRunner([new ClaudeError('timeout', 'Claude n’a pas répondu en 180 s (CLAUDE_TIMEOUT_MS)'), new ClaudeError('cancelled', 'Rédaction annulée')])
    const engine = engineOf(runner)
    assert.equal((await failure(engine.chatJson(ask()))).kind, 'timeout')
    assert.equal((await failure(engine.chatJson(ask()))).kind, 'cancelled')
    assert.ok(runner.calls.every((call) => !existsSync(call.options.cwd)), 'le dossier de travail est supprimé même après un échec')
  })
})

describe('Claude : état de la connexion', () => {
  it('« claude auth status » dans le même isolement, en cache 60 s', async () => {
    let time = 1_000_000
    const runner = scriptedRunner()
    const engine = engineOf(runner, { now: () => time })
    assert.deepEqual(await engine.status(), { available: true, installed: true, error: null, warning: null })
    const check = runner.calls[0]!
    assert.deepEqual([check.executable, check.args, check.options.input, check.options.timeoutMs], [cli, ['auth', 'status'], null, 15_000])
    assert.deepEqual(check.options.env, CLI_ENV)
    assert.deepEqual([check.cwdEntries, existsSync(check.options.cwd)], [[], false])
    time += CLAUDE_STATUS_TTL_MS - 1
    await engine.status()
    assert.equal(runner.calls.length, 1, 'en cache')
    time += 1
    await engine.status()
    assert.equal(runner.calls.length, 2, 'relu après 60 s')
  })

  it('revérification forcée : au plus toutes les 10 s (une page étrangère peut la demander)', async () => {
    let time = 1_000_000
    const runner = scriptedRunner()
    const engine = engineOf(runner, { now: () => time })
    await engine.status({ refresh: true })
    for (let i = 0; i < 5; i += 1) await engine.status({ refresh: true })
    assert.equal(runner.calls.length, 1)
    time += CLAUDE_STATUS_REFRESH_MIN_MS
    await engine.status({ refresh: true })
    assert.equal(runner.calls.length, 2)
    time += CLAUDE_STATUS_REFRESH_MIN_MS
    await engine.status()
    assert.equal(runner.calls.length, 2, 'sans « refresh », le cache de 60 s tient')
  })

  it('non connectée, sortie illisible, clé API signalée', async () => {
    const state = async (auth: Record<string, unknown> | string) => engineOf(scriptedRunner([], { auth })).status()
    assert.deepEqual(await state({ loggedIn: false }), { available: false, installed: true, error: 'Claude CLI non connectée : lance « claude auth login » dans un terminal', warning: null })
    assert.deepEqual(await state('Usage: claude [options]'), { available: false, installed: true, error: '« claude auth status » illisible : mets la CLI à jour (« claude update »)', warning: null })
    assert.deepEqual(await state({ loggedIn: true, authMethod: 'api_key' }), { available: true, installed: true, error: null, warning: 'La CLI utilise une clé API : facturation à l’API, pas à l’abonnement' })
    assert.deepEqual(await state(''), { available: false, installed: true, error: 'Claude CLI non connectée : lance « claude auth login » dans un terminal', warning: null })
  })
})

describe('Claude dans le Hub : rédaction par la CLI isolée', () => {
  it('hors ligne : la CLI n’est jamais lancée, pas même pour son état', async () => {
    const runner = scriptedRunner([written([1, KPIS_TEXT])])
    const ctx = await setup(runner)
    const status = (await ctx.call<AiStatus>('GET', '/api/ai/status?refresh=true')).body
    assert.deepEqual([status.online, status.auto, status.claude.available, status.claude.mode, status.claude.error], [false, 'ollama', false, 'cli', OFFLINE_MESSAGE])
    const refused = await ctx.write<Failure>({ slide_ids: [ctx.of('kpis').id], engine: 'claude' })
    assert.deepEqual([refused.status, refused.body], [403, { detail: OFFLINE_MESSAGE, code: 'CLAUDE_OFFLINE' }])
    assert.equal(runner.calls.length, 0)
    assert.deepEqual(ctx.suite.calls, [])
  })

  it('en ligne : Claude rédige ; ni fait ni consigne dans les arguments, tout sur l’entrée standard', async () => {
    const runner = scriptedRunner([written([1, KPIS_TEXT], [2, 'Le prochain jalon est le comité de pilotage, le 26 novembre 2026.'])])
    const ctx = await setup(runner)
    await ctx.online()
    const status = (await ctx.call<AiStatus>('GET', '/api/ai/status')).body
    assert.deepEqual([status.auto, status.claude.available, status.claude.installed, status.claude.mode, status.claude.error], ['claude', true, true, 'cli', null])
    const [kpis, milestones] = [ctx.of('kpis'), ctx.of('milestones')]
    const { status: code, body } = await ctx.write({ slide_ids: [kpis.id, milestones.id], engine: 'claude', claude_model: 'haiku', instructions: 'CONSIGNE-RECONNAISSABLE' })
    assert.equal(code, 200)
    assert.deepEqual([body.engine, body.model, body.written, body.kept], ['claude', 'haiku', [kpis.id, milestones.id], []])
    assert.deepEqual([ctx.of('kpis').body, ctx.of('kpis').text_source, ctx.of('kpis').text_model], [KPIS_TEXT, 'claude', 'haiku'])
    assert.equal(runner.asks().length, 1, 'jusqu’à douze diapositives par appel')
    const call = runner.asks()[0]!
    assert.deepEqual(call.args.slice(0, 15), [...ISOLATION, '--max-turns', '2', '--model', 'haiku', '--system-prompt', WRITE_SYSTEM])
    assert.deepEqual(call.args.slice(15), ['--json-schema', JSON.stringify(writeSchema(2))])
    // Arguments (visibles par `ps`) : des consignes seulement. Les données — faits lus dans les apps, consignes de l'auteur — sont sur l'entrée standard.
    const args = call.args.join('\n')
    for (const data of ['CONSIGNE-RECONNAISSABLE', 'KPI CGO', 'Comité de pilotage', 'contrôle de gestion']) {
      assert.ok(!args.includes(data), `« ${data} » dans les arguments`)
      assert.ok(call.options.input?.includes(data), `« ${data} » sur l’entrée standard`)
    }
    assert.deepEqual(call.options.env, CLI_ENV)
    assert.equal(ctx.ollama.calls.length, 0)
  })

  it('« Auto » en ligne retient Claude ; non connectée, il retient Ollama et « Claude » est refusé avec la raison', async () => {
    const runner = scriptedRunner([written([1, KPIS_TEXT])])
    const ctx = await setup(runner)
    await ctx.online()
    const auto = (await ctx.write({ slide_ids: [ctx.of('kpis').id] })).body
    assert.deepEqual([auto.engine, auto.model, auto.written.length], ['claude', 'sonnet', 1])

    const logged = scriptedRunner([], { auth: { loggedIn: false } })
    const out = await setup(logged)
    await out.online()
    out.ollama.script.push(JSON.stringify({ diapositives: [{ n: 1, texte: KPIS_TEXT }] }))
    assert.equal((await out.write({ slide_ids: [out.of('kpis').id] })).body.engine, 'ollama')
    const refused = await out.write<Failure>({ slide_ids: [out.of('kpis').id], engine: 'claude' })
    assert.deepEqual([refused.status, refused.body], [502, { detail: 'Claude CLI non connectée : lance « claude auth login » dans un terminal', code: 'CLAUDE_UNAVAILABLE' }])
    assert.equal(logged.asks().length, 0)
  })

  it('nombre inventé par Claude : une relance, puis retrait — le même contrôle qu’Ollama', async () => {
    const runner = scriptedRunner([written([1, 'Déjà 75 % du chemin.']), written([1, 'Toujours 75 %.'])])
    const ctx = await setup(runner)
    await ctx.online()
    const kpis = ctx.of('kpis')
    const { status, body } = await ctx.write({ slide_ids: [kpis.id], engine: 'claude' })
    assert.equal(status, 200)
    assert.deepEqual([body.written, body.kept], [[], [{ slide_id: kpis.id, reason: 'chiffre non vérifiable : 75 %' }]])
    assert.equal(ctx.of('kpis').body, null)
    const asks = runner.asks()
    assert.equal(asks.length, 2)
    // La relance est une transcription : la réponse fautive et la correction demandée, toujours sur l'entrée standard.
    assert.match(asks[1]!.options.input ?? '', /^Voici la conversation jusqu’ici :/)
    assert.ok(asks[1]!.options.input?.includes('Déjà 75 % du chemin.'))
    assert.deepEqual(asks[1]!.args.slice(0, 15), asks[0]!.args.slice(0, 15))
  })

  it('délai dépassé : 504 ; sortie illisible ou erreur de Claude : 502 ; rien n’est écrit', async () => {
    const runner = scriptedRunner([new ClaudeError('timeout', 'Claude n’a pas répondu en 180 s (CLAUDE_TIMEOUT_MS)'), { stdout: '<html>', code: 1 }, failed('Overloaded')])
    const ctx = await setup(runner)
    await ctx.online()
    const body = { slide_ids: [ctx.of('kpis').id], engine: 'claude' }
    assert.deepEqual(await ctx.write<Failure>(body).then((r) => [r.status, r.body]), [504, { detail: 'Claude n’a pas répondu en 180 s (CLAUDE_TIMEOUT_MS)', code: 'AI_TIMEOUT' }])
    assert.deepEqual(await ctx.write<Failure>(body).then((r) => [r.status, r.body]), [502, { detail: 'Réponse illisible de Claude CLI : <html>', code: 'AI_ERROR' }])
    assert.deepEqual(await ctx.write<Failure>(body).then((r) => [r.status, r.body]), [502, { detail: 'Erreur de Claude : Overloaded', code: 'AI_ERROR' }])
    assert.equal(ctx.of('kpis').body, null)
  })
})

describe('Claude : exécutant réel, sur un script du test', () => {
  it('entrée standard, arguments, environnement et dossier reçus tels quels, sans shell', posixOnly, async () => {
    const echo = fakeCli(dir, 'echo', 'printf "%s|" "$@"; printf "\\n"; cat; printf "\\n%s|%s|%s\\n" "$PWD" "$SEUL" "${HOME:-vide}"')
    const out = await spawnRunner(echo, ['-p', '--tools', '', 'a b', '$(touch intrus)', '; rm -rf x'], { input: 'entrée « standard »', cwd: dir, env: { PATH: '/usr/bin:/bin', SEUL: 'oui' }, timeoutMs: 5000 })
    assert.equal(out.code, 0)
    assert.equal(out.stdout, `-p|--tools||a b|$(touch intrus)|; rm -rf x|\nentrée « standard »\n${dir}|oui|vide\n`)
    assert.equal(existsSync(join(dir, 'intrus')), false, 'aucun argument n’est interprété par un shell')
  })

  it('délai dépassé et abandon : le processus est arrêté', posixOnly, async () => {
    const slow = fakeCli(dir, 'lent', 'exec sleep 30')
    const started = Date.now()
    const late = await failure(spawnRunner(slow, [], { input: null, cwd: dir, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 150 }))
    assert.deepEqual([late.kind, late.message], ['timeout', 'Claude n’a pas répondu en 0 s (CLAUDE_TIMEOUT_MS)'])
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 100)
    assert.equal((await failure(spawnRunner(slow, [], { input: null, cwd: dir, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 5000, signal: abort.signal }))).kind, 'cancelled')
    const already = new AbortController()
    already.abort()
    assert.equal((await failure(spawnRunner(slow, [], { input: null, cwd: dir, env: {}, timeoutMs: 5000, signal: already.signal }))).kind, 'cancelled')
    assert.ok(Date.now() - started < 4000, 'personne n’attend la fin du processus')
    assert.equal((await failure(spawnRunner(join(dir, 'absent', 'claude'), [], { input: null, cwd: dir, env: {}, timeoutMs: 1000 }))).kind, 'failed')
  })
})
