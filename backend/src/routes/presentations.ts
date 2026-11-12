// Routes minces des présentations : validation, puis appel d'un service. Les bornes de texte (titre, texte) sont
// contrôlées par le service, qui les dit en français ; le schéma refuse les types faux et tout champ inconnu (422).

import type { FastifyInstance } from 'fastify'

import type { Db } from '../db/database.js'
import { SLIDE_KINDS } from '../domain/types.js'
import { createDeck, type PresentationInput } from '../services/decks.js'
import type { SuiteContext } from '../services/overview.js'
import {
  addSlide,
  deletePresentation,
  LIMITS,
  listPresentations,
  removeSlide,
  renamePresentation,
  reorderSlides,
  updateSlide,
  type SlideInput,
  type SlidePatch,
} from '../services/presentations.js'

const id = { type: 'integer', minimum: 1 } as const
const projectParam = { type: 'object', required: ['id'], properties: { id } } as const
const deckParam = { type: 'object', required: ['pid'], properties: { pid: id } } as const
const slideParam = { type: 'object', required: ['pid', 'sid'], properties: { pid: id, sid: id } } as const

// Bornes larges du schéma : la vraie limite (120, 600 caractères après nettoyage) est celle du service.
const text = { type: 'string', maxLength: 4000 } as const
const nullableText = { anyOf: [{ type: 'null' }, text] } as const

const presentationBody = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: { title: text, plan: { type: 'boolean' } },
} as const

const renameBody = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: { title: text },
} as const

const slideBody = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: [...SLIDE_KINDS] },
    title: nullableText,
    body: nullableText,
    ref: nullableText,
    ref_label: nullableText,
    after: { anyOf: [{ type: 'null' }, id] },
  },
} as const

const slidePatchBody = {
  type: 'object',
  additionalProperties: false,
  properties: { title: nullableText, body: nullableText },
} as const

const orderBody = {
  type: 'object',
  additionalProperties: false,
  required: ['slide_ids'],
  properties: { slide_ids: { type: 'array', maxItems: LIMITS.slides, items: id } },
} as const

export function presentationRoutes(app: FastifyInstance, db: Db, suite: SuiteContext): void {
  app.get<{ Params: { id: number } }>('/api/projects/:id/presentations', { schema: { params: projectParam } }, async (request) => listPresentations(db, request.params.id))

  app.post<{ Params: { id: number }; Body: PresentationInput | null }>(
    '/api/projects/:id/presentations',
    { schema: { params: projectParam, body: presentationBody } },
    async (request, reply) => {
      reply.code(201)
      return createDeck(db, suite, request.params.id, request.body ?? {})
    },
  )

  app.patch<{ Params: { pid: number }; Body: { title: string } }>('/api/presentations/:pid', { schema: { params: deckParam, body: renameBody } }, async (request) =>
    renamePresentation(db, request.params.pid, request.body.title),
  )

  app.delete<{ Params: { pid: number } }>('/api/presentations/:pid', { schema: { params: deckParam } }, async (request, reply) => {
    deletePresentation(db, request.params.pid)
    reply.code(204)
  })

  app.post<{ Params: { pid: number }; Body: SlideInput }>('/api/presentations/:pid/slides', { schema: { params: deckParam, body: slideBody } }, async (request, reply) => {
    reply.code(201)
    return addSlide(db, request.params.pid, request.body)
  })

  app.patch<{ Params: { pid: number; sid: number }; Body: SlidePatch }>(
    '/api/presentations/:pid/slides/:sid',
    { schema: { params: slideParam, body: slidePatchBody } },
    async (request) => updateSlide(db, request.params.pid, request.params.sid, request.body),
  )

  app.delete<{ Params: { pid: number; sid: number } }>('/api/presentations/:pid/slides/:sid', { schema: { params: slideParam } }, async (request, reply) => {
    removeSlide(db, request.params.pid, request.params.sid)
    reply.code(204)
  })

  app.put<{ Params: { pid: number }; Body: { slide_ids: number[] } }>('/api/presentations/:pid/order', { schema: { params: deckParam, body: orderBody } }, async (request) =>
    reorderSlides(db, request.params.pid, request.body.slide_ids),
  )
}
