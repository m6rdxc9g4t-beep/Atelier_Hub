import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db/database.js'

const dir = mkdtempSync(join(tmpdir(), 'hub-ui-'))
mkdirSync(join(dir, 'assets'))
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Atelier Hub</title>')
writeFileSync(join(dir, 'atelier-theme.js'), '/* thème */')
writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')

const app = await buildApp({ config: loadConfig({ HUB_STATIC_DIR: dir, HUB_DATA_DIR: '/tmp/inutilise' }), db: openDatabase(':memory:') })
after(() => app.close())

const get = (url: string, method: 'GET' | 'HEAD' = 'GET') => app.inject({ method, url, headers: { host: '127.0.0.1:3700' } })

describe('interface compilée', () => {
  it('garde un an les fichiers à empreinte de /assets', async () => {
    const res = await get('/assets/index-abc123.js')
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable')
  })

  it('fait revalider la page et les fichiers sans empreinte', async () => {
    for (const url of ['/', '/projet/kpi-cgo', '/atelier-theme.js']) {
      const res = await get(url)
      assert.equal(res.statusCode, 200, url)
      assert.equal(res.headers['cache-control'], 'no-cache', url)
    }
    const page = await get('/projet/kpi-cgo')
    assert.match(String(page.headers['content-type']), /text\/html/)
    assert.equal((await get('/projet/kpi-cgo', 'HEAD')).statusCode, 200)
  })

  it('répond 404 pour un fichier de /assets absent et pour une route d’API inconnue', async () => {
    const asset = await get('/assets/index-ancien.js')
    assert.equal(asset.statusCode, 404)
    assert.match(String(asset.headers['content-type']), /application\/json/)
    assert.equal((await get('/api/inconnue')).statusCode, 404)
  })
})
