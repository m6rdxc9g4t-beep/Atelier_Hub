// Moteur Claude : l'interface que le Hub attend, et le moteur « absent ».
// Le vrai moteur — la CLI Claude Code lancée isolée (`claude -p --safe-mode --tools "" …`, docs/SUITE.md §5.3),
// par l'abonnement de la machine, jamais par une clé d'API — n'est pas encore branché : tant qu'il ne l'est pas, le
// Hub répond que Claude n'est pas disponible, et rien ne part.

import type { ClaudeModel } from '../domain/types.js'
import type { ChatMessage } from './data.js'

export const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'sonnet'

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
  /** N'est jamais appelé hors ligne : la CLI n'est même pas lancée. */
  status(options?: { refresh?: boolean }): Promise<ClaudeEngineStatus>
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
