// Moteurs d'IA du Hub : état, choix du moteur, génération. `ai/` est le seul dossier qui parle à Ollama ou à
// Claude ; ici se décide lequel répond, et ce qu'on dit quand il ne répond pas.
// Hors ligne (défaut), rien ne part vers Claude : son état n'est même pas demandé (la CLI n'est pas lancée), une
// demande explicite est refusée (403), « Auto » retient Ollama.

import { absentClaude, ClaudeError, DEFAULT_CLAUDE_MODEL, type ClaudeEngine } from '../ai/claude.js'
import type { ChatMessage } from '../ai/data.js'
import { createOllamaClient, findInstalledModel, missingModel, OllamaError, type OllamaClient } from '../ai/ollama.js'
import { WRITE_TEMPERATURE } from '../ai/prompts.js'
import type { AiConfig } from '../config.js'
import type { Db } from '../db/database.js'
import { CLAUDE_MODELS, type AiEngineName, type AiStatus, type ClaudeModel, type EngineChoice } from '../domain/types.js'
import { ApiError, forbidden, gateway } from '../http/errors.js'
import { isOnline, OFFLINE_MESSAGE } from './settings.js'

export interface AiDeps {
  /** null : Ollama est désactivé (`ollamaRefused` dit pourquoi). */
  ollama: OllamaClient | null
  ollamaRefused: string | null
  claude: ClaudeEngine
  /** Modèle d'Ollama par défaut (OLLAMA_MODEL). */
  model: string
  /** Taille maximale de ce qui part vers une IA en un appel (caractères). */
  maxChars: number
}

/** Les vrais moteurs, d'après les réglages. Les tests et l'aperçu passent des doubles à `buildApp`. */
export function createAi(config: AiConfig): AiDeps {
  return {
    ollama: config.ollamaUrl ? createOllamaClient({ baseUrl: config.ollamaUrl, timeoutMs: config.ollamaTimeoutMs, contextTokens: config.ollamaNumCtx }) : null,
    ollamaRefused: config.ollamaRefused,
    claude: absentClaude(),
    model: config.ollamaModel,
    maxChars: config.maxChars,
  }
}

export interface ResolvedEngine {
  engine: AiEngineName
  model: string
}

const OLLAMA_OFF = 'Ollama est désactivé'

function ollamaFailure(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!(error instanceof OllamaError)) return gateway(502, 'AI_ERROR', 'Erreur inattendue d’Ollama')
  switch (error.kind) {
    case 'unreachable':
      return gateway(502, 'AI_UNAVAILABLE', error.message)
    case 'model':
      return gateway(502, 'AI_MODEL_MISSING', error.message)
    case 'timeout':
      return gateway(504, 'AI_TIMEOUT', error.message)
    case 'cancelled':
      return new ApiError(499, 'AI_CANCELLED', error.message)
    case 'failed':
      return gateway(502, 'AI_ERROR', error.message)
  }
}

function claudeFailure(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!(error instanceof ClaudeError)) return gateway(502, 'AI_ERROR', 'Erreur inattendue de Claude')
  switch (error.kind) {
    case 'unavailable':
      return gateway(502, 'CLAUDE_UNAVAILABLE', error.message)
    case 'timeout':
      return gateway(504, 'AI_TIMEOUT', error.message)
    case 'cancelled':
      return new ApiError(499, 'AI_CANCELLED', error.message)
    case 'failed':
      return gateway(502, 'AI_ERROR', error.message)
  }
}

const claudeModel = (model: ClaudeModel | undefined): ClaudeModel => (model && CLAUDE_MODELS.includes(model) ? model : DEFAULT_CLAUDE_MODEL)

/** État des moteurs, pour le choix « Auto · Ollama · Claude ». Hors ligne, Claude n'est pas interrogé. */
export async function getAiStatus(db: Db, ai: AiDeps, options: { refresh?: boolean } = {}): Promise<AiStatus> {
  const online = isOnline(db)
  const ollama: AiStatus['ollama'] = { reachable: false, error: ai.ollamaRefused ?? OLLAMA_OFF, default_model: ai.model, default_installed: false, models: [] }
  if (ai.ollama) {
    try {
      const models = await ai.ollama.listModels()
      ollama.reachable = true
      ollama.error = null
      ollama.models = models.map((model) => ({ name: model.name, size: model.size }))
      ollama.default_installed = findInstalledModel(models, ai.model) !== undefined
    } catch (error) {
      ollama.error = ollamaFailure(error).message
    }
  }
  const claude: AiStatus['claude'] = { available: false, installed: false, mode: ai.claude.mode, error: OFFLINE_MESSAGE, warning: null, models: [...CLAUDE_MODELS], default_model: DEFAULT_CLAUDE_MODEL }
  if (online) {
    const state = await ai.claude.status({ refresh: options.refresh === true }).catch(() => ({ available: false, installed: false, error: 'L’état de Claude n’a pas pu être lu', warning: null }))
    Object.assign(claude, { available: state.available, installed: state.installed, error: state.error, warning: state.warning })
  }
  return { online, auto: online && claude.available ? 'claude' : 'ollama', ollama, claude, max_chars: ai.maxChars }
}

/**
 * Moteur et modèle d'une demande — `ollama` : tel quel ; `claude` : 403 `CLAUDE_OFFLINE` hors ligne, 502
 * `CLAUDE_UNAVAILABLE` s'il n'est pas utilisable ; `auto` (défaut) : Claude si le Hub est en ligne et Claude
 * disponible, sinon Ollama. Pour Ollama, le modèle est contrôlé ici (injoignable, modèle absent : 502) : une
 * demande qui ne peut pas aboutir est refusée avant toute lecture des apps.
 */
export async function resolveEngine(db: Db, ai: AiDeps, input: { engine?: EngineChoice; model?: string; claude_model?: ClaudeModel }): Promise<ResolvedEngine> {
  const choice = input.engine ?? 'auto'
  if (choice !== 'ollama') {
    const online = isOnline(db)
    if (choice === 'claude' && !online) throw forbidden('CLAUDE_OFFLINE', OFFLINE_MESSAGE)
    if (online) {
      const state = await ai.claude.status().catch(() => ({ available: false, error: 'L’état de Claude n’a pas pu être lu' }))
      if (state.available) return { engine: 'claude', model: claudeModel(input.claude_model) }
      if (choice === 'claude') throw gateway(502, 'CLAUDE_UNAVAILABLE', state.error ?? 'Claude n’est pas disponible')
    }
  }
  if (!ai.ollama) throw gateway(502, 'AI_UNAVAILABLE', `${ai.ollamaRefused ?? OLLAMA_OFF}. La présentation garde ses phrases automatiques.`)
  const wanted = input.model?.trim() || ai.model
  let installed
  try {
    installed = findInstalledModel(await ai.ollama.listModels(), wanted)
  } catch (error) {
    throw ollamaFailure(error)
  }
  if (!installed) throw ollamaFailure(missingModel(wanted))
  return { engine: 'ollama', model: installed.name }
}

/**
 * Un appel au moteur retenu : la réponse brute (JSON contraint par le schéma). Le mode en ligne est revérifié juste
 * avant de parler à Claude (il a pu changer pendant la lecture des apps). Les erreurs du moteur deviennent des
 * erreurs d'API en français ; aucune ne porte un secret.
 */
export async function generate(
  db: Db,
  ai: AiDeps,
  resolved: ResolvedEngine,
  request: { messages: ChatMessage[]; schema: Record<string, unknown>; signal?: AbortSignal },
): Promise<string> {
  if (resolved.engine === 'claude') {
    if (!isOnline(db)) throw forbidden('CLAUDE_OFFLINE', OFFLINE_MESSAGE)
    return ai.claude.chatJson({ model: claudeModel(resolved.model as ClaudeModel), messages: request.messages, schema: request.schema, signal: request.signal }).catch((error: unknown) => {
      throw claudeFailure(error)
    })
  }
  if (!ai.ollama) throw gateway(502, 'AI_UNAVAILABLE', ai.ollamaRefused ?? OLLAMA_OFF)
  return ai.ollama.chat({ model: resolved.model, messages: request.messages, format: request.schema, temperature: WRITE_TEMPERATURE, signal: request.signal }).catch((error: unknown) => {
    throw ollamaFailure(error)
  })
}
