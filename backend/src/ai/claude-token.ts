// Jeton du forfait Claude (`claude setup-token`, valable un an) : mode du VPS, où aucune session `claude` n'est
// connectée. Décision de l'utilisateur : « je veux que Claude forfait cli soit actif car c'est personnel ça sera mon
// forfait Claude ». Le jeton est fourni par HUB_CLAUDE_OAUTH_TOKEN ; il est lu une fois au démarrage, retiré de
// l'environnement du processus (aucun autre sous-processus n'en hérite), et seule la CLI isolée le reçoit, sous le nom
// qu'elle lit (CLAUDE_CODE_OAUTH_TOKEN), dans son environnement. Il n'apparaît jamais dans une réponse d'API, une
// erreur, un journal, un argument de ligne de commande ni un fichier : `ClaudeToken` ne se montre ni par `String`, ni
// par `JSON.stringify`, ni par `util.inspect`, et `scrubSecrets` masque tout texte venu de la CLI.

import { chmod, mkdir } from 'node:fs/promises'
import { inspect } from 'node:util'
import path from 'node:path'

/** Variable lue par le Hub. */
export const TOKEN_ENV = 'HUB_CLAUDE_OAUTH_TOKEN'
/** Variable que lit la CLI Claude Code : posée dans SON environnement seulement, et seulement en mode jeton. */
export const CLI_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN'
/** Dossier privé de la CLI en mode jeton (HOME ; CLAUDE_CONFIG_DIR = son `.claude`), sous le dossier de données. */
export const PRIVATE_HOME_NAME = 'claude-forfait'
/**
 * Retirées de l'environnement du processus au démarrage : le jeton du Hub, et les secrets Anthropic qu'un autre
 * programme aurait laissés (le Hub ne s'en sert jamais ; la liste blanche de la CLI les écarte déjà).
 */
export const SECRET_ENV = [TOKEN_ENV, CLI_TOKEN_ENV, 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const

const MASK = '[jeton masqué]'
/** Forme des jetons d'Anthropic (forfait `sk-ant-oat…`, clé `sk-ant-api…`) : masquée même si ce n'est pas le nôtre. */
const TOKEN_SHAPE = /sk-ant-[A-Za-z0-9_-]{8,}/g

/** Jeton gardé en mémoire : sa valeur ne sort que par `reveal()`, pour l'environnement de la CLI. */
export class ClaudeToken {
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  reveal(): string {
    return this.#value
  }

  toString(): string {
    return 'ClaudeToken(***)'
  }

  toJSON(): string {
    return MASK
  }

  [inspect.custom](): string {
    return 'ClaudeToken(***)'
  }
}

/** Jeton de l'environnement (noms sans casse, comme sous Windows), ou null. Ne modifie rien. */
export function readClaudeToken(env: Record<string, string | undefined>): ClaudeToken | null {
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() === TOKEN_ENV && value?.trim()) return new ClaudeToken(value.trim())
  }
  return null
}

/** Retire de `env` le jeton et les secrets Anthropic (`SECRET_ENV`, noms sans casse). */
export function forgetSecrets(env: Record<string, string | undefined>): void {
  const names = new Set<string>(SECRET_ENV)
  for (const key of Object.keys(env)) if (names.has(key.toUpperCase())) delete env[key]
}

/** Le texte sans le jeton, ni rien qui ait la forme d'un jeton d'Anthropic. */
export function scrubSecrets(text: string, token: ClaudeToken | null = null): string {
  const value = token?.reveal()
  const masked = value ? text.split(value).join(MASK) : text
  return masked.replace(TOKEN_SHAPE, MASK)
}

/** Dossier privé de la CLI en mode jeton, sous le dossier de données du Hub. */
export function privateHome(dataDir: string): string {
  return path.resolve(dataDir, PRIVATE_HOME_NAME)
}

/** Crée le dossier privé et son `.claude`, lisibles par ce seul utilisateur ; rend le dossier de configuration. */
export async function ensurePrivateHome(home: string): Promise<string> {
  const config = path.join(home, '.claude')
  for (const dir of [home, config]) {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    // Hors Windows : droits resserrés même si le dossier existait déjà (sous Windows, droits du profil).
    if (process.platform !== 'win32') await chmod(dir, 0o700)
  }
  return config
}
