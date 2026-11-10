// Routes minces : validation, puis appel d'un service.

import type { FastifyInstance } from 'fastify'

import type { Db } from '../db/database.js'
import { SOURCE_KINDS } from '../domain/types.js'
import { invalid } from '../http/errors.js'
import { buildCatalog, isAppId } from '../services/catalog.js'
import { buildOverview, type SuiteContext } from '../services/overview.js'
import { addLink, createProject, deleteProject, getProject, listProjects, removeLink, updateProject, type LinkInput, type ProjectInput } from '../services/projects.js'

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const

const nullableText = (maxLength: number) => ({ anyOf: [{ type: 'string', maxLength }, { type: 'null' }] }) as const

const projectBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 120 },
    description: { type: 'string', maxLength: 2000 },
    keywords: { type: 'string', maxLength: 500 },
    projets_id: nullableText(80),
    projets_name: nullableText(200),
    wiki_space_id: nullableText(80),
    wiki_space: nullableText(200),
    tab_project: nullableText(200),
  },
} as const

const linkBody = {
  type: 'object',
  additionalProperties: false,
  required: ['app', 'kind', 'ref', 'label'],
  properties: {
    app: { type: 'string', enum: ['wiki', 'viz', 'tab', 'convert', 'nexus', 'source'] },
    kind: { type: 'string', enum: ['page', 'report', 'dataset', 'table', 'conversion', 'agent', ...SOURCE_KINDS] },
    ref: { type: 'string', minLength: 1, maxLength: 1000 },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    note: { type: 'string', maxLength: 500 },
  },
} as const

export function hubRoutes(app: FastifyInstance, db: Db, suite: SuiteContext): void {
  app.get('/api/projects', async () => listProjects(db))

  app.post<{ Body: ProjectInput }>('/api/projects', { schema: { body: { ...projectBody, required: ['name'] } } }, async (request, reply) => {
    reply.code(201)
    return createProject(db, request.body)
  })

  app.get<{ Params: { id: number } }>('/api/projects/:id', { schema: { params: idParam } }, async (request) => getProject(db, request.params.id))

  app.patch<{ Params: { id: number }; Body: ProjectInput }>('/api/projects/:id', { schema: { params: idParam, body: projectBody } }, async (request) =>
    updateProject(db, request.params.id, request.body),
  )

  app.delete<{ Params: { id: number } }>('/api/projects/:id', { schema: { params: idParam } }, async (request, reply) => {
    deleteProject(db, request.params.id)
    reply.code(204)
  })

  app.get<{ Params: { id: number } }>('/api/projects/:id/overview', { schema: { params: idParam } }, async (request) => buildOverview(db, suite, request.params.id))

  app.post<{ Params: { id: number }; Body: LinkInput }>('/api/projects/:id/links', { schema: { params: idParam, body: linkBody } }, async (request, reply) => {
    reply.code(201)
    return addLink(db, request.params.id, request.body)
  })

  app.delete<{ Params: { id: number; linkId: number } }>(
    '/api/projects/:id/links/:linkId',
    {
      schema: {
        params: { type: 'object', required: ['id', 'linkId'], properties: { id: { type: 'integer', minimum: 1 }, linkId: { type: 'integer', minimum: 1 } } },
      },
    },
    async (request, reply) => {
      removeLink(db, request.params.id, request.params.linkId)
      reply.code(204)
    },
  )

  app.get<{ Params: { app: string }; Querystring: { q?: string } }>(
    '/api/catalog/:app',
    { schema: { querystring: { type: 'object', properties: { q: { type: 'string', maxLength: 200 } } } } },
    async (request) => {
      const target = request.params.app
      if (!isAppId(target)) throw invalid(`App inconnue : ${target}`)
      return buildCatalog(suite, target, request.query.q ?? '')
    },
  )
}
