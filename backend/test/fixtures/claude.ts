// Fausse CLI Claude pour les tests du vrai moteur (`ai/claude.ts`) : un fichier exécutable que la recherche trouve,
// et un exécutant simulé qui enregistre chaque lancement. La vraie CLI n'est jamais lancée par un test.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ClaudeRunner, RunOptions } from '../../src/ai/claude.js'

/** Dossier temporaire du fichier de test (faux exécutables, dossiers de données). */
export const sandbox = () => mkdtempSync(join(tmpdir(), 'hub-claude-'))

/** Fichier exécutable nommé `claude` dans `<dir>/<name>/` (script shell : lancé seulement par le test de l'exécutant). */
export function fakeCli(dir: string, name: string, script = 'exit 0'): string {
  const bin = join(dir, name)
  mkdirSync(bin, { recursive: true })
  const file = join(bin, 'claude')
  writeFileSync(file, `#!/bin/sh\n${script}\n`)
  chmodSync(file, 0o755)
  return file
}

export interface RunnerCall {
  executable: string
  args: readonly string[]
  options: RunOptions
  /** Contenu du dossier de travail pendant l'appel. */
  cwdEntries: string[]
  /** Le dossier de travail existait pendant l'appel. */
  cwdExisted: boolean
}

export type Reply = { stdout: string; code?: number; stderr?: string } | Error | ((call: RunnerCall) => { stdout: string; code?: number; stderr?: string })

/** Sortie de la CLI pour une réponse aboutie (`--output-format json`). */
export const result = (fields: Record<string, unknown>) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...fields })
/** Réponse structurée au format de la rédaction : un texte par numéro de diapositive. */
export const written = (...texts: [number, string][]) => ({ stdout: result({ structured_output: { diapositives: texts.map(([n, texte]) => ({ n, texte })) } }) })
/** Erreur renvoyée par la CLI (`is_error`). */
export const failed = (message: string) => ({ stdout: JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: message }), code: 1 })

/**
 * Exécutant simulé. `claude auth status` répond selon `auth` (modifiable en cours de test) ; les demandes (`-p`)
 * prennent leurs réponses dans la file, et un appel que le script ne prévoit pas fait échouer le test.
 */
export function scriptedRunner(replies: Reply[] = [], options: { auth?: Record<string, unknown> | string } = {}) {
  const state = { auth: options.auth ?? ({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' } as Record<string, unknown> | string) }
  /** Tous les lancements, dans l'ordre. */
  const calls: RunnerCall[] = []
  const runner: ClaudeRunner = async (executable, args, runOptions) => {
    const cwdExisted = existsSync(runOptions.cwd)
    const call: RunnerCall = { executable, args, options: runOptions, cwdEntries: cwdExisted ? readdirSync(runOptions.cwd) : [], cwdExisted }
    calls.push(call)
    if (args.includes('auth')) return { code: 0, stdout: typeof state.auth === 'string' ? state.auth : JSON.stringify(state.auth), stderr: '' }
    const reply = replies.shift()
    if (reply === undefined) throw new Error('Lancement inattendu de la CLI (script épuisé)')
    if (reply instanceof Error) throw reply
    const out = typeof reply === 'function' ? reply(call) : reply
    return { code: out.code ?? 0, stdout: out.stdout, stderr: out.stderr ?? '' }
  }
  return {
    runner,
    calls,
    state,
    /** Les seules demandes (`claude -p …`). */
    asks: () => calls.filter((call) => call.args.includes('-p')),
    /** Les lectures de la connexion (`claude auth status`). */
    checks: () => calls.filter((call) => call.args.includes('auth')),
  }
}

export type ScriptedRunner = ReturnType<typeof scriptedRunner>
