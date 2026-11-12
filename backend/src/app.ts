// Application Fastify : gardes Host / Origin, erreurs { detail, code }, routes du Hub, interface compilée.

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'

import type { HubConfig } from './config.js'
import type { Fetcher } from './connectors/http.js'
import type { Db } from './db/database.js'
import { ApiError } from './http/errors.js'
import { isAllowedHost, isAllowedOrigin, isWrite } from './http/guards.js'
import { hubRoutes } from './routes/hub.js'
import { presentationRoutes } from './routes/presentations.js'
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
  presentationRoutes(app, db, suite)

  if (config.staticDir && existsSync(join(config.staticDir, 'index.html'))) {
    const assetsDir = join(config.staticDir, 'assets') + sep
    await app.register(fastifyStatic, {
      root: config.staticDir,
      wildcard: false,
      // Les fichiers de /assets portent une empreinte dans leur nom : gardés un an sans revalidation.
      // Le reste (index.html, atelier-theme.js, icône) est revalidé à chaque visite (ETag → 304).
      setHeaders(reply, path) {
        reply.header('Cache-Control', path.startsWith(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
    // Routeur de l'interface (History API) : toute adresse hors /api renvoie l'interface. Un fichier de /assets
    // absent (onglet resté ouvert pendant une mise à jour) est une vraie 404, pas une page HTML servie comme du code.
    app.setNotFoundHandler((request, reply) => {
      const page = (request.method === 'GET' || request.method === 'HEAD') && !request.url.startsWith('/api/') && !request.url.startsWith('/assets/')
      if (page) return reply.sendFile('index.html')
      return reply.code(404).send({ detail: 'Route inconnue', code: 'NOT_FOUND' })
    })
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ detail: 'Route inconnue', code: 'NOT_FOUND' }))
  }

  return app
}
