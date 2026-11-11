import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, describe, it } from 'node:test'

import { AppUnavailable, requestJson, type HttpContext } from '../src/connectors/http.js'

const servers: Server[] = []
after(() => {
  for (const server of servers) {
    server.closeAllConnections()
    server.close()
  }
})

/** Vraie app locale d'essai : le connecteur est lu avec le `fetch` de Node, comme en service. */
async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const ctx = (timeoutMs: number): HttpContext => ({ fetch: (input, init) => fetch(input, init), timeoutMs })

const failure = async (run: Promise<unknown>): Promise<AppUnavailable> => {
  try {
    await run
  } catch (error) {
    assert.ok(error instanceof AppUnavailable, `AppUnavailable attendue, reçu ${String(error)}`)
    return error
  }
  throw new assert.AssertionError({ message: 'la lecture aurait dû échouer' })
}

describe('lecture d’une app (délai borné)', () => {
  it('rend le JSON d’une réponse correcte', async () => {
    const url = await serve((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'))
    assert.deepEqual(await requestJson(ctx(1000), url), { ok: true })
  })

  it('abandonne une app qui envoie ses en-têtes puis ne finit jamais sa réponse', { timeout: 5000 }, async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{"rows":[')
    })
    const started = Date.now()
    const error = await failure(requestJson(ctx(200), url))
    assert.equal(error.reason, 'down')
    assert.equal(error.message, 'ne répond pas à temps')
    assert.ok(Date.now() - started < 2000, 'le délai doit couvrir la lecture du corps')
  })

  it('abandonne une app qui ne répond pas du tout', { timeout: 5000 }, async () => {
    const url = await serve(() => undefined)
    const error = await failure(requestJson(ctx(200), url))
    assert.deepEqual([error.reason, error.message], ['down', 'ne répond pas à temps'])
  })

  it('reprend le message d’erreur de l’app, sinon le code HTTP', async () => {
    const url = await serve((req, res) => {
      if (req.url === '/detail') res.writeHead(404, { 'content-type': 'application/json' }).end('{"detail":"Projet introuvable","code":"NOT_FOUND"}')
      else res.writeHead(502, { 'content-type': 'text/html' }).end('<h1>Bad Gateway</h1>')
    })
    const withDetail = await failure(requestJson(ctx(1000), `${url}/detail`))
    assert.deepEqual([withDetail.reason, withDetail.message], ['error', 'Projet introuvable'])
    const bare = await failure(requestJson(ctx(1000), `${url}/autre`))
    assert.deepEqual([bare.reason, bare.message], ['error', 'HTTP 502'])
  })

  it('signale une réponse 200 qui n’est pas du JSON et une app arrêtée', async () => {
    const url = await serve((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html>'))
    const unreadable = await failure(requestJson(ctx(1000), url))
    assert.deepEqual([unreadable.reason, unreadable.message], ['error', 'réponse illisible'])
    const stopped = await failure(requestJson(ctx(1000), 'http://127.0.0.1:1/api'))
    assert.deepEqual([stopped.reason, stopped.message], ['down', 'ne répond pas'])
  })
})
