// Réglages du Hub (variables d'environnement). Chaque app de la suite a deux adresses :
// - `api` : où le backend du Hub la lit (toujours en bouclage, docs/SUITE.md §7 d'Atelier Projets) ;
// - `ui`  : où le navigateur l'ouvre (lien profond). Sur le VPS, c'est le sous-domaine de l'app.

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { forgetSecrets, privateHome, readClaudeToken, type ClaudeToken } from './ai/claude-token.js'
import { isLoopbackHost } from './http/guards.js'

export interface AppAddress {
  api: string
  ui: string
}

/** Réglages des moteurs d'IA (rédaction des présentations). */
export interface AiConfig {
  /** Adresse d'Ollama, toujours sur cette machine ; null : Ollama est désactivé (`ollamaRefused` dit pourquoi). */
  ollamaUrl: string | null
  ollamaRefused: string | null
  ollamaModel: string
  ollamaTimeoutMs: number
  /** Fenêtre de contexte demandée à Ollama (num_ctx). */
  ollamaNumCtx: number
  /** Exécutable de Claude Code : un nom cherché sur la machine (« claude ») ou un chemin absolu ; un chemin relatif est refusé. */
  claudeCli: string
  /** Délai maximal d'une réponse de Claude. */
  claudeTimeoutMs: number
  /** Jeton du forfait (HUB_CLAUDE_OAUTH_TOKEN) → mode jeton ; null : session `claude` de la machine. Jamais montré. */
  claudeToken: ClaudeToken | null
  /** Dossier privé de la CLI en mode jeton (HOME), sous le dossier de données. */
  claudeHome: string
  /** Taille maximale de ce qui part vers une IA en un appel (caractères). */
  maxChars: number
}

export interface HubConfig {
  host: string
  port: number
  dataDir: string
  staticDir: string | null
  allowedHosts: string[]
  /** Délai maximal d'une lecture dans une autre app (une app lente ne bloque pas la fiche). */
  timeoutMs: number
  apps: {
    projets: AppAddress
    wiki: AppAddress
    viz: AppAddress
    convert: AppAddress
    nexus: AppAddress
    /** Atelier Tab n'a pas d'API de données : le Hub lit son index (`<exports>/_atelier/index.json`, §7.3). */
    tab: { ui: string; exportsDir: string }
  }
  ai: AiConfig
}

type Env = Record<string, string | undefined>

const trimUrl = (value: string) => value.trim().replace(/\/+$/, '')

function url(env: Env, name: string, fallback: string): string {
  const value = env[name]?.trim()
  return trimUrl(value ? value : fallback)
}

function int(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} doit être un entier entre ${min} et ${max} (reçu : ${raw})`)
  return n
}

const OLLAMA_DEFAULT = 'http://127.0.0.1:11434'

/**
 * Adresse d'Ollama : sur cette machine seulement — la promesse « avec Ollama, rien ne quitte la machine » tient à
 * cela. Une autre adresse (variable héritée du terminal, par exemple) ne fait pas échouer le démarrage du Hub pour
 * une fonction facultative : elle désactive Ollama, avec l'explication. Seule l'origine est gardée (ni chemin, ni
 * identifiants : l'adresse apparaît dans les messages d'erreur).
 */
function ollamaAddress(env: Env): Pick<AiConfig, 'ollamaUrl' | 'ollamaRefused'> {
  const raw = env.OLLAMA_URL?.trim() || env.OLLAMA_BASE_URL?.trim() || OLLAMA_DEFAULT
  try {
    const parsed = new URL(raw)
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLoopbackHost(parsed.hostname.toLowerCase())) return { ollamaUrl: parsed.origin, ollamaRefused: null }
  } catch {
    // Adresse illisible : refusée comme une adresse qui n'est pas locale.
  }
  return { ollamaUrl: null, ollamaRefused: 'OLLAMA_URL n’est pas une adresse de cette machine : Ollama est désactivé' }
}

const backendRoot = resolve(import.meta.dirname, '..')

export function loadConfig(env: Env = process.env): HubConfig {
  const dataDir = resolve(env.HUB_DATA_DIR?.trim() || join(backendRoot, 'data'))
  const builtUi = resolve(backendRoot, '..', 'frontend', 'dist')
  const staticEnv = env.HUB_STATIC_DIR
  const staticDir = staticEnv === undefined ? (existsSync(builtUi) ? builtUi : null) : staticEnv.trim() ? resolve(staticEnv) : null
  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: int(env, 'PORT', 3700, 1, 65535),
    dataDir,
    staticDir,
    allowedHosts: (env.ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    timeoutMs: int(env, 'HUB_TIMEOUT_MS', 2500, 200, 30000),
    apps: {
      projets: { api: url(env, 'PROJETS_API_URL', 'http://127.0.0.1:3000'), ui: url(env, 'PROJETS_URL', 'http://127.0.0.1:4174') },
      wiki: { api: url(env, 'WIKI_API_URL', 'http://127.0.0.1:3200'), ui: url(env, 'WIKI_URL', 'http://127.0.0.1:3200') },
      viz: { api: url(env, 'VIZ_API_URL', 'http://127.0.0.1:8000'), ui: url(env, 'VIZ_URL', 'http://127.0.0.1:8000') },
      convert: { api: url(env, 'CONVERT_API_URL', 'http://127.0.0.1:8010'), ui: url(env, 'CONVERT_URL', 'http://127.0.0.1:8010') },
      nexus: { api: url(env, 'NEXUS_API_URL', 'http://127.0.0.1:8100'), ui: url(env, 'NEXUS_URL', 'http://127.0.0.1:3100') },
      tab: {
        ui: url(env, 'TAB_URL', 'http://127.0.0.1:4175'),
        exportsDir: resolve(env.TAB_EXPORTS_DIR?.trim() || join(homedir(), 'Atelier_Tab', 'exports')),
      },
    },
    ai: {
      ...ollamaAddress(env),
      ollamaModel: env.OLLAMA_MODEL?.trim() || 'llama3.1:8b',
      ollamaTimeoutMs: int(env, 'OLLAMA_TIMEOUT_MS', 120_000, 1000, 3_600_000),
      ollamaNumCtx: int(env, 'OLLAMA_NUM_CTX', 8192, 1024, 262_144),
      claudeCli: env.CLAUDE_CLI?.trim() || 'claude',
      claudeTimeoutMs: int(env, 'CLAUDE_TIMEOUT_MS', 180_000, 1000, 3_600_000),
      claudeToken: readClaudeToken(env),
      claudeHome: privateHome(dataDir),
      maxChars: int(env, 'HUB_AI_MAX_CHARS', 12_000, 2000, 100_000),
    },
  }
}

/**
 * Réglages du démarrage : lus une fois, puis le jeton du forfait et les secrets Anthropic sont retirés de `env`
 * (l'environnement du processus) : aucun sous-processus n'en hérite, seule la CLI isolée reçoit le jeton.
 */
export function loadStartupConfig(env: Env = process.env): HubConfig {
  const config = loadConfig(env)
  forgetSecrets(env)
  return config
}
