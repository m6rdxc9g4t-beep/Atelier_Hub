import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deckPath, hashToPath, parseRoute, pathToHash, presentationsPath, projectPath } from './routes.ts'

describe('adresses de l’interface', () => {
  it('reconnaît l’accueil, la fiche, ses présentations et une présentation', () => {
    assert.deepEqual(parseRoute('/'), { name: 'home' })
    assert.deepEqual(parseRoute(''), { name: 'home' })
    assert.deepEqual(parseRoute('/projet/kpi-cgo'), { name: 'project', slug: 'kpi-cgo' })
    assert.deepEqual(parseRoute('/projet/kpi-cgo/'), { name: 'project', slug: 'kpi-cgo' })
    assert.deepEqual(parseRoute('/projet/kpi-cgo/presentations'), { name: 'presentations', slug: 'kpi-cgo' })
    assert.deepEqual(parseRoute('/projet/kpi-cgo/presentation/12'), { name: 'deck', slug: 'kpi-cgo', id: 12 })
  })

  it('une adresse inconnue est introuvable', () => {
    for (const path of [
      '/autre',
      '/projet',
      '/projet/KPI',
      '/projet/kpi-cgo/presentation',
      '/projet/kpi-cgo/presentation/0',
      '/projet/kpi-cgo/presentation/abc',
      '/projet/kpi-cgo/presentation/1/2',
      '/projet/kpi-cgo/presentations/1',
      '/projet/kpi-cgo/autre',
      '/projet/%E0%A4%A',
    ]) {
      assert.deepEqual(parseRoute(path), { name: 'notFound' }, path)
    }
  })

  it('construit les adresses que le routeur relit', () => {
    assert.deepEqual(parseRoute(projectPath('kpi-cgo')), { name: 'project', slug: 'kpi-cgo' })
    assert.deepEqual(parseRoute(presentationsPath('kpi-cgo')), { name: 'presentations', slug: 'kpi-cgo' })
    assert.deepEqual(parseRoute(deckPath('kpi-cgo', 3)), { name: 'deck', slug: 'kpi-cgo', id: 3 })
  })

  it('aperçu : le fragment reste dans l’alphabet des slugs', () => {
    assert.equal(pathToHash('/'), '#')
    assert.equal(pathToHash(projectPath('kpi-cgo')), '#kpi-cgo')
    assert.equal(pathToHash(presentationsPath('kpi-cgo')), '#kpi-cgo--p')
    assert.equal(pathToHash(deckPath('kpi-cgo', 12)), '#kpi-cgo--p12')
    for (const path of [projectPath('kpi-cgo'), presentationsPath('kpi-cgo'), deckPath('kpi-cgo', 12)]) assert.match(pathToHash(path), /^#[a-z0-9-]+$/)
  })

  it('aperçu : aller-retour du fragment, y compris pour un slug qui ressemble au séparateur', () => {
    // « plan-p12 », « p », « projet-p » : un seul tiret avant le « p », ce n'est pas le séparateur. « cap- » : un slug
    // coupé à 60 caractères peut finir par un tiret.
    for (const slug of ['kpi-cgo', 'plan-p12', 'p', 'p12', 'projet-p', 'cap-', 'cloture-annuelle-2026']) {
      for (const path of [projectPath(slug), presentationsPath(slug), deckPath(slug, 12), deckPath(slug, 1)]) {
        assert.equal(hashToPath(pathToHash(path)), path, path)
      }
    }
    assert.equal(hashToPath(''), '/')
    assert.equal(hashToPath('#'), '/')
    assert.deepEqual(parseRoute(hashToPath('#plan-p12')), { name: 'project', slug: 'plan-p12' })
    assert.deepEqual(parseRoute(hashToPath('#plan-p12--p')), { name: 'presentations', slug: 'plan-p12' })
    assert.deepEqual(parseRoute(hashToPath('#plan-p12--p7')), { name: 'deck', slug: 'plan-p12', id: 7 })
  })

  it('aperçu : un fragment hors de l’alphabet est introuvable', () => {
    assert.deepEqual(parseRoute(hashToPath('#Kpi.Cgo')), { name: 'notFound' })
    assert.deepEqual(parseRoute(hashToPath('#a/b')), { name: 'notFound' })
    assert.deepEqual(parseRoute(hashToPath('#a/presentations')), { name: 'notFound' })
  })
})
