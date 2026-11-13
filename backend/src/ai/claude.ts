// Moteur Claude : la CLI Claude Code de la machine (abonnement de l'utilisateur, jamais une clé d'API) appelée en
// mode « print » (`claude -p`), isolée comme dans Atelier Projets et Atelier Viz (docs/SUITE.md §5.3) :
// - --safe-mode : ni CLAUDE.md, ni mémoire, ni hooks, ni plugins, ni MCP de l'utilisateur ;
// - --tools "" + --strict-mcp-config + --disable-slash-commands : aucun outil (ni shell, ni fichiers, ni MCP) ;
// - --system-prompt : remplace entièrement le prompt système de Claude Code ;
// - --no-session-persistence : rien n'est écrit dans l'historique des sessions ;
// - dossier de travail temporaire vide, supprimé ensuite ; environnement en liste blanche (HOME, USER, PATH… ; ni
//   ANTHROPIC_*, ni secret du Hub), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 (ni télémétrie, ni mise à jour).
// Le prompt système et le schéma ne contiennent que des consignes ; les données (faits des diapositives, consignes
// de l'auteur) passent par l'entrée standard, jamais dans les arguments (visibles par `ps`). Sortie JSON
// (`--output-format json`), contrainte par `--json-schema`. L'exécutant est injectable : aucun test ne lance la CLI.
// Repris d'`Atelier_Projets/backend/src/ai-bridge/claude-print.ts`. À ne jamais assouplir.

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ClaudeModel } from '../domain/types.js'
import {
  claudeFallbackDirs,
  findClaudeExecutable,
  isRelativeCommand,
  relativeCommandMessage,
  resolveClaudeLaunch,
  sessionPath,
  unresolvedCmdMessage,
  type ClaudeLaunch,
} from './claude-find.js'
import type { ChatMessage } from './data.js'

export const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'sonnet'

/** Délai maximal d'une réponse par défaut (CLAUDE_TIMEOUT_MS). */
export const DEFAULT_CLAUDE_TIMEOUT_MS = 180_000
/** Durée de validité de l'état de Claude (contrat : 60 s). */
export const CLAUDE_STATUS_TTL_MS = 60_000
/**
 * Intervalle minimal entre deux revérifications forcées (`refresh`, contrat : 10 s) : `GET /api/ai/status?refresh=true`
 * se déclenche aussi depuis une page étrangère (balise <img>), qui ne doit pas pouvoir lancer la CLI en boucle.
 */
export const CLAUDE_STATUS_REFRESH_MIN_MS = 10_000
/** Délai de « claude auth status ». */
const AUTH_STATUS_TIMEOUT_MS = 15_000
/** Méthodes d'authentification facturées à l'API (et non à l'abonnement). */
const API_KEY_AUTH_METHODS = new Set(['api_key', 'api_key_helper', 'apiKey', 'apiKeyHelper'])
/** Sortie lue au plus (protection mémoire). */
const MAX_OUTPUT_CHARS = 5_000_000
/** Détail d'une erreur de la CLI repris dans un message, au plus. */
const MAX_DETAIL_CHARS = 300

export interface ClaudeEngineStatus {
  /** Utilisable maintenant : installé et connecté. */
  available: boolean
  installed: boolean
  /** Pourquoi Claude n'est pas utilisable (français), sinon null. */
  error: string | null
  warning: string | null
}

export interface ClaudeChatRequest {
  model: ClaudeModel
  /** Le prompt système ne contient que des consignes ; les données voyagent dans les autres messages (entrée standard). */
  messages: ChatMessage[]
  schema: Record<string, unknown>
  signal?: AbortSignal
}

export interface ClaudeEngine {
  readonly timeoutMs: number
  readonly mode: 'cli' | 'token'
  /** N'est jamais appelé hors ligne : la CLI n'est même pas lancée. En cache 60 s ; `refresh` : au plus toutes les 10 s. */
  status(options?: { refresh?: boolean }): Promise<ClaudeEngineStatus>
  /** Réponse contrainte par le schéma (`--json-schema`) : le texte JSON de `structured_output`. */
  chatJson(request: ClaudeChatRequest): Promise<string>
}

/** unavailable : absent ou non connecté · timeout · cancelled : abandonné par l'appelant · failed : autre erreur. */
export class ClaudeError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'timeout' | 'cancelled' | 'failed',
    message: string,
  ) {
    super(message)
    this.name = 'ClaudeError'
  }
}

export const CLAUDE_ABSENT = 'Claude n’est pas installé sur cette machine'

/** Moteur absent : jamais disponible, ne lance rien. */
export function absentClaude(): ClaudeEngine {
  return {
    timeoutMs: 0,
    mode: 'cli',
    status: async () => ({ available: false, installed: false, error: CLAUDE_ABSENT, warning: null }),
    chatJson: async () => {
      throw new ClaudeError('unavailable', CLAUDE_ABSENT)
    },
  }
}

// ─── Exécutant ───────────────────────────────────────────────────

export interface RunResult {
  /** Code de sortie (null : processus tué). */
  code: number | null
  stdout: string
  stderr: string
}

export interface RunOptions {
  /** Texte écrit sur l'entrée standard (null : entrée fermée tout de suite). */
  input: string | null
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  signal?: AbortSignal
}

/** Lance un exécutable ; lève `ClaudeError` (timeout, cancelled, failed) si le processus ne peut aboutir. */
export type ClaudeRunner = (executable: string, args: readonly string[], options: RunOptions) => Promise<RunResult>

const CANCELLED = 'Rédaction annulée'

/** Exécutant par défaut : processus enfant sans shell, entrée standard, délai et annulation (SIGTERM puis SIGKILL). */
export const spawnRunner: ClaudeRunner = (executable, args, { input, cwd, env, timeoutMs, signal }) =>
  new Promise<RunResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ClaudeError('cancelled', CANCELLED))
      return
    }
    // Jamais de shell (ni cmd.exe sous Windows : il réinterpréterait le prompt système et le schéma JSON), aucune console.
    if (/\.(cmd|bat)$/i.test(executable)) {
      reject(new ClaudeError('unavailable', unresolvedCmdMessage(executable)))
      return
    }
    const child = spawn(executable, [...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false
    const stop = () => {
      child.kill('SIGTERM')
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 2000).unref()
    }
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      action()
    }
    const timer = setTimeout(() => {
      stop()
      finish(() => reject(new ClaudeError('timeout', `Claude n’a pas répondu en ${Math.round(timeoutMs / 1000)} s (CLAUDE_TIMEOUT_MS)`)))
    }, timeoutMs)
    const onAbort = () => {
      stop()
      finish(() => reject(new ClaudeError('cancelled', CANCELLED)))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (stdout.length < MAX_OUTPUT_CHARS) stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (stderr.length < 100_000) stderr += chunk
    })
    child.on('error', (error) => finish(() => reject(new ClaudeError('failed', `Lancement de Claude impossible : ${error.message}`))))
    child.on('close', (code) => finish(() => resolve({ code, stdout, stderr })))
    child.stdin.on('error', () => undefined)
    child.stdin.end(input ?? '')
  })

// ─── Arguments, environnement, conversation ──────────────────────

/** Arguments exacts d'un appel isolé (docs/SUITE.md §5.3). `system` et `schema` ne portent que des consignes. */
export function claudeArguments(options: { model: ClaudeModel; system: string; maxTurns: number; schema?: Record<string, unknown> }): string[] {
  return [
    '-p',
    '--safe-mode',
    '--output-format',
    'json',
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--max-turns',
    String(options.maxTurns),
    '--model',
    options.model,
    '--system-prompt',
    options.system,
    ...(options.schema ? ['--json-schema', JSON.stringify(options.schema)] : []),
  ]
}

/** Variables transmises à la CLI (docs/SUITE.md §5.3), plus les LC_* ; rien d'autre. */
export const CLAUDE_ENV_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'LANG', 'TMPDIR', 'TZ', 'CLAUDE_CONFIG_DIR'] as const

/**
 * Variables ajoutées sous Windows seulement (docs/SUITE.md §9.6) : profil, dossiers de l'utilisateur et du système
 * dont la CLI a besoin pour trouver sa configuration et sa connexion. Noms comparés sans tenir compte de la casse.
 */
export const CLAUDE_ENV_WINDOWS_ALLOWLIST = [
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'USERNAME',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'ProgramData',
] as const

/**
 * Environnement de la CLI, en liste blanche (docs/SUITE.md §5.3) : ni ANTHROPIC_* (clé, jeton, adresse : c'est
 * l'abonnement qui répond), ni CLAUDE_CODE_USE_BEDROCK / VERTEX, ni réglage ou secret du Hub. PATH : dossier de
 * l'exécutable en tête, sans entrée relative ni node_modules/.bin (`sessionPath`).
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 : ni télémétrie, ni rapport d'erreur, ni mise à jour automatique.
 */
export function claudeEnvironment(base: NodeJS.ProcessEnv, executable: string, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const windows = platform === 'win32'
  // Sous Windows, les noms sont insensibles à la casse (Path, SYSTEMROOT…) ; PATH est traité à part.
  const normalize = (key: string) => (windows ? key.toUpperCase() : key)
  const allowed = new Set<string>([...CLAUDE_ENV_ALLOWLIST, ...(windows ? CLAUDE_ENV_WINDOWS_ALLOWLIST : [])].filter((key) => key !== 'PATH').map(normalize))
  const env: NodeJS.ProcessEnv = {}
  let basePath: string | undefined
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue
    if (normalize(key) === 'PATH') basePath ??= value
    else if (allowed.has(normalize(key)) || key.startsWith('LC_')) env[key] = value
  }
  env[windows ? 'Path' : 'PATH'] = sessionPath(basePath, executable, platform)
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  return env
}

const DEFAULT_SYSTEM_PROMPT = 'Tu es l’assistant d’Atelier Hub. Réponds en français.'
const ROLE_LABEL: Record<ChatMessage['role'], string> = { system: 'Système', user: 'Utilisateur', assistant: 'Assistant' }

/** `claude -p` reçoit un seul prompt : le prompt système à part, la conversation (relance comprise) en transcription. */
export function formatConversation(messages: readonly ChatMessage[]): { system: string; prompt: string } {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')
  const turns = messages.filter((message) => message.role !== 'system')
  const prompt =
    turns.length === 1
      ? (turns[0]?.content ?? '')
      : `Voici la conversation jusqu’ici :\n\n${turns.map((message) => `${ROLE_LABEL[message.role]} : ${message.content}`).join('\n\n')}\n\nRéponds au dernier message de l’utilisateur, sans préfixe.`
  return { system: system || DEFAULT_SYSTEM_PROMPT, prompt }
}

/** Objet JSON final (`type: "result"`) de la sortie standard, ou null. */
export function parseResult(stdout: string): Record<string, unknown> | null {
  const lines = stdout.trim().split('\n').reverse()
  for (const candidate of [stdout.trim(), ...lines]) {
    try {
      const data: unknown = JSON.parse(candidate)
      if (typeof data === 'object' && data !== null && !Array.isArray(data) && (data as { type?: unknown }).type === 'result') return data as Record<string, unknown>
    } catch {
      /* ligne suivante */
    }
  }
  return null
}

// ─── Moteur ──────────────────────────────────────────────────────

export interface ClaudeEngineOptions {
  /** Commande ou chemin (CLAUDE_CLI, défaut « claude »). */
  command?: string
  /** PATH où chercher la CLI, transmis nettoyé à la CLI (défaut : celui du Hub). */
  searchPath?: string
  /** Dossiers essayés après le PATH (défaut : `claudeFallbackDirs()`). */
  fallbackDirs?: readonly string[]
  /** Délai maximal d'une réponse (CLAUDE_TIMEOUT_MS). */
  timeoutMs?: number
  runner?: ClaudeRunner
  /** Environnement de base (défaut : celui du Hub), dont seule la liste blanche est transmise. */
  env?: NodeJS.ProcessEnv
  now?: () => number
}

const NOT_FOUND = 'Claude CLI introuvable : installe Claude Code puis lance « claude auth login » dans un terminal (ou renseigne CLAUDE_CLI)'
const LOGIN = 'Claude CLI non connectée : lance « claude auth login » dans un terminal'
const AUTH_UNREADABLE = '« claude auth status » illisible : mets la CLI à jour (« claude update »)'
const API_KEY_WARNING = 'La CLI utilise une clé API : facturation à l’API, pas à l’abonnement'

export function createClaudeEngine(options: ClaudeEngineOptions = {}): ClaudeEngine {
  const command = options.command?.trim() || 'claude'
  const baseEnv = options.env ?? process.env
  const searchPath = options.searchPath ?? baseEnv.PATH
  const fallbackDirs = options.fallbackDirs ?? claudeFallbackDirs()
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS
  const runner = options.runner ?? spawnRunner
  const now = options.now ?? Date.now
  let cached: { at: number; value: Promise<ClaudeEngineStatus> } | null = null

  /** CLI introuvable, ou CLAUDE_CLI relatif (refusé). */
  const missing = () => (isRelativeCommand(command) ? relativeCommandMessage(command) : NOT_FOUND)

  /** Exécutable et lancement, ou la raison (français) pour laquelle la CLI ne peut pas être lancée. */
  async function locate(): Promise<{ launch: ClaudeLaunch } | { installed: boolean; error: string }> {
    const executable = await findClaudeExecutable(command, searchPath, fallbackDirs)
    if (executable === null) return { installed: false, error: missing() }
    const launch = resolveClaudeLaunch(executable, { searchPath })
    return launch === null ? { installed: true, error: unresolvedCmdMessage(executable) } : { launch }
  }

  /** Lance la CLI dans un dossier temporaire vide, supprimé ensuite, avec l'environnement en liste blanche. */
  async function run(launch: ClaudeLaunch, args: readonly string[], input: string | null, limitMs: number, signal?: AbortSignal): Promise<RunResult> {
    const cwd = await mkdtemp(path.join(tmpdir(), 'atelier-hub-claude-'))
    try {
      const env = claudeEnvironment(baseEnv, launch.executable)
      return await runner(launch.executable, [...launch.args, ...args], { input, cwd, env, timeoutMs: limitMs, signal })
    } finally {
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async function readStatus(): Promise<ClaudeEngineStatus> {
    const found = await locate()
    if (!('launch' in found)) return { available: false, installed: found.installed, error: found.error, warning: null }
    let info: { loggedIn?: unknown; authMethod?: unknown }
    try {
      const result = await run(found.launch, ['auth', 'status'], null, AUTH_STATUS_TIMEOUT_MS)
      info = JSON.parse(result.stdout.trim() || '{}') as typeof info
    } catch {
      return { available: false, installed: true, error: AUTH_UNREADABLE, warning: null }
    }
    if (info.loggedIn !== true) return { available: false, installed: true, error: LOGIN, warning: null }
    const apiKey = typeof info.authMethod === 'string' && API_KEY_AUTH_METHODS.has(info.authMethod)
    return { available: true, installed: true, error: null, warning: apiKey ? API_KEY_WARNING : null }
  }

  async function ask(request: ClaudeChatRequest): Promise<Record<string, unknown>> {
    const found = await locate()
    if (!('launch' in found)) throw new ClaudeError('unavailable', found.error)
    const { system, prompt } = formatConversation(request.messages)
    // Sortie structurée : un tour de plus, pour la réponse contrainte par le schéma (comme Projets et Viz).
    const args = claudeArguments({ model: request.model, system, maxTurns: 2, schema: request.schema })
    const result = await run(found.launch, args, prompt, timeoutMs, request.signal)
    const payload = parseResult(result.stdout)
    if (payload === null) {
      let detail = (result.stderr || result.stdout).trim().slice(0, MAX_DETAIL_CHARS)
      if (/unknown option/i.test(detail)) detail += ' — mets la CLI à jour : « claude update »'
      throw new ClaudeError('failed', `Réponse illisible de Claude CLI${detail ? ` : ${detail}` : ''}`)
    }
    if (payload.is_error === true || result.code !== 0) {
      const detail = typeof payload.result === 'string' && payload.result.trim() !== '' ? payload.result.trim().slice(0, MAX_DETAIL_CHARS) : 'erreur inconnue'
      const auth = /log ?in|authenticat|api key|credential/i.test(detail)
      // La connexion a changé : l'état est relu à la prochaine demande, sans attendre la fin du cache.
      if (auth) cached = null
      throw auth ? new ClaudeError('unavailable', `${LOGIN} (${detail})`) : new ClaudeError('failed', `Erreur de Claude : ${detail}`)
    }
    return payload
  }

  return {
    timeoutMs,
    mode: 'cli',
    status({ refresh = false } = {}) {
      const age = cached === null ? Infinity : now() - cached.at
      if (cached === null || age >= CLAUDE_STATUS_TTL_MS || (refresh && age >= CLAUDE_STATUS_REFRESH_MIN_MS)) cached = { at: now(), value: readStatus() }
      return cached.value
    },
    async chatJson(request) {
      const payload = await ask(request)
      const structured = payload.structured_output
      if (typeof structured === 'object' && structured !== null) return JSON.stringify(structured)
      if (typeof payload.result === 'string') return payload.result
      throw new ClaudeError('failed', 'Réponse de Claude sans sortie structurée')
    },
  }
}
