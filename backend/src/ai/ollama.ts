// Ollama (IA locale, sur cette machine) derrière une interface minimale, remplaçable dans les tests.
// Repris d'Atelier Projets (`ai-bridge/ollama.ts`), avec un `fetch` injectable et une réponse bornée.
// L'adresse est toujours de bouclage (`config.ts`) : avec Ollama, rien ne quitte la machine qui héberge le Hub.

import type { ChatMessage } from './data.js'

export interface OllamaModel {
  name: string
  /** Taille du modèle sur le disque, en octets. */
  size: number
}

export interface OllamaChatRequest {
  model: string
  messages: ChatMessage[]
  /** Schéma JSON imposé à la réponse (sorties structurées d'Ollama). */
  format?: Record<string, unknown>
  temperature?: number
  /** Annulation par l'appelant (requête abandonnée par le navigateur). */
  signal?: AbortSignal
}

export interface OllamaClient {
  readonly baseUrl: string
  /** Modèles installés (GET /api/tags). */
  listModels(): Promise<OllamaModel[]>
  /** Réponse complète du modèle (POST /api/chat, lue en flux puis assemblée). */
  chat(request: OllamaChatRequest): Promise<string>
}

/**
 * Échec d'un appel à Ollama — unreachable : Ollama ne répond pas · model : modèle absent · timeout : génération
 * trop longue · cancelled : abandonnée par l'appelant · failed : autre erreur renvoyée par Ollama.
 */
export class OllamaError extends Error {
  constructor(
    readonly kind: 'unreachable' | 'model' | 'timeout' | 'cancelled' | 'failed',
    message: string,
  ) {
    super(message)
    this.name = 'OllamaError'
  }
}

/** Une réponse plus longue est coupée : un modèle qui s'emballe n'occupe pas la mémoire du Hub. */
export const OLLAMA_MAX_ANSWER = 100_000

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

interface TagsResponse {
  models?: { name?: string; model?: string; size?: number }[]
}

export const missingModel = (model: string) => new OllamaError('model', `Modèle absent d’Ollama (${model}) : installe-le avec « ollama pull ${model} »`)

export function createOllamaClient(options: { baseUrl: string; timeoutMs: number; contextTokens: number; fetch?: Fetch }): OllamaClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const send: Fetch = options.fetch ?? ((input, init) => fetch(input, init))

  function translate(error: unknown, timeout: AbortSignal, timeoutMs: number, signal?: AbortSignal): OllamaError {
    if (error instanceof OllamaError) return error
    if (signal?.aborted) return new OllamaError('cancelled', 'Rédaction annulée')
    if (timeout.aborted) return new OllamaError('timeout', `Ollama n’a pas répondu en ${Math.round(timeoutMs / 1000)} s (OLLAMA_TIMEOUT_MS)`)
    return new OllamaError('unreachable', `Ollama est injoignable sur ${baseUrl} : lance Ollama. La présentation garde ses phrases automatiques.`)
  }

  async function failure(response: Response, model?: string): Promise<OllamaError> {
    const text = await response.text().catch(() => '')
    let detail: unknown
    try {
      detail = (JSON.parse(text) as { error?: unknown }).error
    } catch {
      detail = undefined
    }
    const message = typeof detail === 'string' ? detail.slice(0, 300) : `HTTP ${response.status}`
    if (response.status === 404 && model && /model/i.test(message)) return missingModel(model)
    return new OllamaError('failed', `Erreur d’Ollama : ${message}`)
  }

  return {
    baseUrl,
    async listModels() {
      const timeoutMs = Math.min(options.timeoutMs, 5000)
      const timeout = AbortSignal.timeout(timeoutMs)
      let body: TagsResponse | null
      try {
        const response = await send(`${baseUrl}/api/tags`, { method: 'GET', signal: timeout })
        if (!response.ok) throw await failure(response)
        body = (await response.json()) as TagsResponse | null
      } catch (error) {
        throw translate(error, timeout, timeoutMs)
      }
      return (body?.models ?? [])
        .map((model) => ({ name: model.name ?? model.model ?? '', size: typeof model.size === 'number' ? model.size : 0 }))
        .filter((model) => model.name !== '')
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async chat({ model, messages, format, temperature = 0.2, signal }) {
      // Flux NDJSON : les en-têtes arrivent tout de suite, le texte est assemblé au fil des morceaux.
      const timeout = AbortSignal.timeout(options.timeoutMs)
      const combined = signal ? AbortSignal.any([timeout, signal]) : timeout
      let content = ''
      try {
        const response = await send(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true, ...(format && { format }), options: { temperature, num_ctx: options.contextTokens } }),
          signal: combined,
        })
        if (!response.ok) throw await failure(response, model)
        if (!response.body) throw new OllamaError('failed', 'Réponse d’Ollama vide')
        const decoder = new TextDecoder()
        let buffer = ''
        const consume = (line: string) => {
          if (line.trim() === '') return
          let chunk: { message?: { content?: string }; error?: unknown }
          try {
            chunk = JSON.parse(line) as typeof chunk
          } catch {
            throw new OllamaError('failed', 'Réponse d’Ollama illisible')
          }
          if (typeof chunk.error === 'string') throw new OllamaError('failed', `Erreur d’Ollama : ${chunk.error.slice(0, 300)}`)
          content += chunk.message?.content ?? ''
        }
        for await (const part of response.body) {
          buffer += decoder.decode(part, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) consume(line)
          if (content.length >= OLLAMA_MAX_ANSWER) break
        }
        if (content.length < OLLAMA_MAX_ANSWER) consume(buffer + decoder.decode())
      } catch (error) {
        throw translate(error, timeout, options.timeoutMs, signal)
      }
      return content.slice(0, OLLAMA_MAX_ANSWER)
    },
  }
}

/**
 * Modèle installé correspondant au nom demandé : nom exact, sinon « nom:latest », sinon l'unique étiquette installée
 * de ce modèle (« llama3.2 » → « llama3.2:1b » si c'est la seule).
 */
export function findInstalledModel(models: readonly OllamaModel[], wanted: string): OllamaModel | undefined {
  const exact = models.find((model) => model.name === wanted || model.name === `${wanted}:latest`)
  if (exact || wanted.includes(':')) return exact
  const tagged = models.filter((model) => model.name.startsWith(`${wanted}:`))
  return tagged.length === 1 ? tagged[0] : undefined
}
