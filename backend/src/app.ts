// Application Fastify : gardes Host / Origin, erreurs { detail, code }, routes du Hub, interface compilée.

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { HubConfig } from './config.js'
import type { Fetcher } from './connectors/http.js'
import type { Db } from './db/database.js'
import { ApiError } from './http/errors.js'
import { isAllowedHost, isAllowedOrigin, isWrite } from './http/guards.js'
import { hubRoutes } from './routes/hub.js'
import { localToday, type SuiteContext } from './services/overview.js'

export interface BuildOptions {
  config: HubConfig
  db: Db
  /** Lecteur HTTP des autres apps (remplacé par un double dans les tests). */
  fetch?: Fetcher
  today?: () => string
  logger?: boolean
}

export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const { config, db } = options
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 64 * 1024,
    // Un champ inconnu est une erreur (422), pas un champ ignoré en silence.
    ajv: { customOptions: { removeAdditional: false } },
  })

  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHost(request.headers.host, config.allowedHosts)) {
      return reply.code(403).send({ detail: 'Hôte non autorisé', code: 'FORBIDDEN_HOST' })
    }
    if (isWrite(request.method) && !isAllowedOrigin(request.headers.origin, config.allowedHosts)) {
      return reply.code(403).send({ detail: 'Origine non autorisée', code: 'FORBIDDEN_ORIGIN' })
    }
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) return reply.code(error.status).send({ detail: error.message, code: error.code })
    const err = error as { validation?: unknown; statusCode?: number; message?: string }
    if (err.validation) return reply.code(422).send({ detail: `Requête invalide : ${err.message ?? ''}`.trim(), code: 'VALIDATION' })
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ detail: err.message ?? 'Requête refusée', code: 'BAD_REQUEST' })
    app.log.error(error)
    return reply.code(500).send({ detail: 'Erreur interne du Hub', code: 'INTERNAL' })
  })

  const suite: SuiteContext = {
    config,
    http: { fetch: options.fetch ?? ((input, init) => fetch(input, init)), timeoutMs: config.timeoutMs },
    today: options.today ?? localToday,
  }

  app.get('/api/health', async () => ({ status: 'ok', app: 'atelier-hub' }))
  hubRoutes(app, db, suite)

  if (config.staticDir && existsSync(join(config.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.staticDir, wildcard: false })
    // Routeur de l'interface (History API) : toute adresse hors /api renvoie l'interface.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html')
      return reply.code(404).send({ detail: 'Route inconnue', code: 'NOT_FOUND' })
    })
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ detail: 'Route inconnue', code: 'NOT_FOUND' }))
  }

  return app
}
