import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// Fuseau fixé pour les essais : les horodatages des apps sont en UTC, l'affichage est local.
process.env.TZ = 'Europe/Paris'

import { dueIn, hours, localDay, relativeDay, shortDate } from './format.ts'

describe('mise en forme', () => {
  it('écrit les heures à la française', () => {
    assert.equal(hours(66.5), '66,5 h')
    assert.equal(hours(4), '4 h')
    assert.equal(hours(2.25), '2,3 h')
  })

  it('écrit les dates courtes, avec l’année si elle change', () => {
    assert.equal(shortDate('2026-11-13', '2026-11-10'), '13 nov.')
    assert.equal(shortDate('2027-01-02T10:00:00+01:00', '2026-11-10'), '2 janv. 2027')
    assert.equal(shortDate(null, '2026-11-10'), '')
  })

  it('dit quand c’était et quand ce sera', () => {
    assert.equal(relativeDay('2026-11-10T08:00:00+01:00', '2026-11-10'), 'aujourd’hui')
    assert.equal(relativeDay('2026-11-09', '2026-11-10'), 'hier')
    assert.equal(relativeDay('2026-11-06', '2026-11-10'), 'il y a 4 j')
    assert.equal(relativeDay('2026-10-08', '2026-11-10'), '8 oct.')
    assert.equal(dueIn('2026-11-13', '2026-11-10'), 'dans 3 j')
    assert.equal(dueIn('2026-11-11', '2026-11-10'), 'demain')
    assert.equal(dueIn('2026-11-08', '2026-11-10'), 'en retard de 2 j')
  })

  it('compte les jours dans le fuseau de l’appareil, pas en UTC', () => {
    // 0 h 30 à Paris le 10 novembre = 23 h 30 UTC le 9 : c'est « aujourd'hui », pas « hier ».
    assert.equal(localDay('2026-11-09T23:30:00.000Z'), '2026-11-10')
    assert.equal(relativeDay('2026-11-09T23:30:00.000Z', '2026-11-10'), 'aujourd’hui')
    assert.equal(relativeDay('2026-11-08T23:30:00Z', '2026-11-10'), 'hier')
    assert.equal(shortDate('2026-10-31T23:30:00Z', '2026-11-10'), '1 nov.')
    // Heure d'été : 1 h 30 à Paris le 2 juillet = 23 h 30 UTC le 1er.
    assert.equal(localDay('2026-07-01T23:30:00Z'), '2026-07-02')
    // Une date seule n'a pas de fuseau ; un horodatage illisible garde ses dix premiers caractères.
    assert.equal(localDay('2026-11-13'), '2026-11-13')
    assert.equal(dueIn('2026-11-13', '2026-11-10'), 'dans 3 j')
    assert.equal(localDay('2026-11-13Tpas-une-heure'), '2026-11-13')
  })
})
