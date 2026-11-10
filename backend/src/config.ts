// Réglages du Hub (variables d'environnement). Chaque app de la suite a deux adresses :
// - `api` : où le backend du Hub la lit (toujours en bouclage, docs/SUITE.md §7 d'Atelier Projets) ;
// - `ui`  : où le navigateur l'ouvre (lien profond). Sur le VPS, c'est le sous-domaine de l'app.

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'

export interface AppAddress {
  api: string
  ui: string
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

const backendRoot = resolve(import.meta.dirname, '..')

export function loadConfig(env: Env = process.env): HubConfig {
  const builtUi = resolve(backendRoot, '..', 'frontend', 'dist')
  const staticEnv = env.HUB_STATIC_DIR
  const staticDir = staticEnv === undefined ? (existsSync(builtUi) ? builtUi : null) : staticEnv.trim() ? resolve(staticEnv) : null
  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: int(env, 'PORT', 3700, 1, 65535),
    dataDir: resolve(env.HUB_DATA_DIR?.trim() || join(backendRoot, 'data')),
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
  }
}
