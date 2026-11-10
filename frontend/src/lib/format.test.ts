import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { dueIn, hours, relativeDay, shortDate } from './format.ts'

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
})
