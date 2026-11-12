// Routes minces de l'IA : état des moteurs, mode en ligne, rédaction d'une présentation.
// Toute écriture passe par les gardes Host / Origin de l'application (`http/guards.ts`) : le mode en ligne ne se
// change que depuis cette machine ou un hôte déclaré, jamais depuis un autre site.

import type { FastifyInstance, FastifyReply } from 'fastify'

import { WRITE_LIMITS } from '../ai/prompts.js'
import type { Db } from '../db/database.js'
import { CLAUDE_MODELS } from '../domain/types.js'
import { getAiStatus, type AiDeps } from '../services/ai.js'
import type { SuiteContext } from '../services/overview.js'
import { setOnline } from '../services/settings.js'
import { writeSlides, type WriteInput } from '../services/writing.js'

const id = { type: 'integer', minimum: 1 } as const

const statusQuery = { type: 'object', additionalProperties: false, properties: { refresh: { type: 'boolean' } } } as const

const onlineBody = { type: 'object', additionalProperties: false, required: ['online'], properties: { online: { type: 'boolean' } } } as const

const writeBody = {
  type: 'object',
  additionalProperties: false,
  required: ['slide_ids'],
  properties: {
    slide_ids: { type: 'array', minItems: 1, maxItems: WRITE_LIMITS.claudeBatch, uniqueItems: true, items: id },
    engine: { type: 'string', enum: ['auto', 'ollama', 'claude'] },
    model: { type: 'string', minLength: 1, maxLength: 100 },
    claude_model: { type: 'string', enum: [...CLAUDE_MODELS] },
    instructions: { type: 'string', maxLength: WRITE_LIMITS.instructions },
    overwrite_manual: { type: 'boolean' },
  },
} as const

/** Signal levé quand le navigateur abandonne la requête : l'appel au moteur est interrompu au lieu d'aller au bout. */
function abandonSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController()
  reply.raw.once('close', () => {
    if (!reply.raw.writableFinished) controller.abort()
  })
  return controller.signal
}

export function aiRoutes(app: FastifyInstance, db: Db, suite: SuiteContext, ai: AiDeps): void {
  app.get<{ Querystring: { refresh?: boolean } }>('/api/ai/status', { schema: { querystring: statusQuery } }, async (request) => getAiStatus(db, ai, { refresh: request.query.refresh === true }))

  // Seule route qui change le mode en ligne.
  app.put<{ Body: { online: boolean } }>('/api/settings/online-mode', { schema: { body: onlineBody } }, async (request) => setOnline(db, request.body.online))

  app.post<{ Params: { pid: number }; Body: WriteInput }>(
    '/api/presentations/:pid/write',
    { schema: { params: { type: 'object', required: ['pid'], properties: { pid: id } }, body: writeBody } },
    async (request, reply) => writeSlides(db, suite, ai, request.params.pid, request.body, abandonSignal(reply)),
  )
}
