// Doubles des moteurs d'IA : réponses scriptées, appels comptés, messages gardés. Aucun test n'appelle Ollama ni
// Claude ; un appel que le script ne prévoit pas fait échouer le test.

import { ClaudeError, type ClaudeChatRequest, type ClaudeEngine } from '../../src/ai/claude.js'
import { missingModel, OllamaError, type OllamaChatRequest, type OllamaClient } from '../../src/ai/ollama.js'
import type { AiDeps } from '../../src/services/ai.js'

/** Une réponse du moteur : son texte brut, une erreur à lever, ou une fonction de la demande. */
export type Step<R> = string | Error | ((request: R) => string | Promise<string>)

async function play<R>(script: Step<R>[], request: R, engine: string): Promise<string> {
  const step = script.shift()
  if (step === undefined) throw new Error(`Appel inattendu à ${engine} (script épuisé)`)
  if (step instanceof Error) throw step
  return typeof step === 'function' ? step(request) : step
}

/** Réponse au format demandé : un texte par numéro de diapositive. */
export const answer = (...texts: [number, string][]) => JSON.stringify({ diapositives: texts.map(([n, texte]) => ({ n, texte })) })

export function fakeOllama(script: Step<OllamaChatRequest>[] = [], options: { models?: string[]; down?: boolean } = {}) {
  const state = { down: options.down ?? false, models: options.models ?? ['llama3.1:8b', 'llama3.2:1b'], lists: 0 }
  const calls: OllamaChatRequest[] = []
  const baseUrl = 'http://127.0.0.1:11434'
  const client: OllamaClient = {
    baseUrl,
    async listModels() {
      state.lists += 1
      if (state.down) throw new OllamaError('unreachable', `Ollama est injoignable sur ${baseUrl} : lance Ollama. La présentation garde ses phrases automatiques.`)
      return state.models.map((name) => ({ name, size: 1_300_000_000 }))
    },
    async chat(request) {
      calls.push(request)
      if (!state.models.includes(request.model)) throw missingModel(request.model)
      return play(script, request, 'Ollama')
    },
  }
  return { client, calls, script, state }
}

export function fakeClaude(script: Step<ClaudeChatRequest>[] = [], options: { available?: boolean; error?: string } = {}) {
  const state = { available: options.available ?? true, statusCalls: 0, refreshes: 0 }
  const calls: ClaudeChatRequest[] = []
  const engine: ClaudeEngine = {
    timeoutMs: 180_000,
    mode: 'cli',
    async status(statusOptions) {
      state.statusCalls += 1
      if (statusOptions?.refresh) state.refreshes += 1
      return state.available
        ? { available: true, installed: true, error: null, warning: null }
        : { available: false, installed: true, error: options.error ?? 'Claude n’est pas connecté : lance « claude » une fois dans un terminal', warning: null }
    },
    async chatJson(request) {
      calls.push(request)
      if (!state.available) throw new ClaudeError('unavailable', 'Claude n’est pas connecté')
      return play(script, request, 'Claude')
    },
  }
  return { engine, calls, script, state }
}

export type FakeOllama = ReturnType<typeof fakeOllama>
export type FakeClaude = ReturnType<typeof fakeClaude>

/** Moteurs d'un Hub de test : par défaut un Ollama et un Claude disponibles, sans aucune réponse prévue. */
export function fakeAi(options: { ollama?: FakeOllama | null; claude?: FakeClaude | ClaudeEngine; model?: string; maxChars?: number; ollamaRefused?: string } = {}) {
  const ollama = options.ollama === undefined ? fakeOllama() : options.ollama
  const claude = options.claude ?? fakeClaude()
  const deps: AiDeps = {
    ollama: ollama?.client ?? null,
    ollamaRefused: ollama ? null : (options.ollamaRefused ?? 'OLLAMA_URL n’est pas une adresse de cette machine : Ollama est désactivé'),
    claude: 'engine' in claude ? claude.engine : claude,
    model: options.model ?? 'llama3.1:8b',
    maxChars: options.maxChars ?? 12_000,
  }
  return deps
}
