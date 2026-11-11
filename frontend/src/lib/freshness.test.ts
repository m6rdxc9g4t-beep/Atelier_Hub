import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { clockTime, shouldRefresh, STALE_AFTER_MS } from './freshness.ts'

describe('fraîcheur de la fiche', () => {
  const t0 = 1_800_000_000_000

  it('relit au retour sur l’onglet quand la lecture date', () => {
    assert.equal(shouldRefresh({ visible: true, busy: false, loadedAt: t0 }, t0 + STALE_AFTER_MS), true)
    assert.equal(shouldRefresh({ visible: true, busy: false, loadedAt: t0 }, t0 + 5 * 60_000), true)
  })

  it('ne relit pas une fiche qui vient d’être lue', () => {
    assert.equal(shouldRefresh({ visible: true, busy: false, loadedAt: t0 }, t0 + STALE_AFTER_MS - 1), false)
  })

  it('ne relit ni un onglet caché, ni pendant une lecture, ni avant la première', () => {
    const late = t0 + 10 * 60_000
    assert.equal(shouldRefresh({ visible: false, busy: false, loadedAt: t0 }, late), false)
    assert.equal(shouldRefresh({ visible: true, busy: true, loadedAt: t0 }, late), false)
    assert.equal(shouldRefresh({ visible: true, busy: false, loadedAt: null }, late), false)
  })

  it('écrit l’heure locale de la lecture', () => {
    const d = new Date(2026, 10, 10, 9, 5, 30)
    assert.equal(clockTime(d.toISOString()), '09:05')
    assert.equal(clockTime('pas une date'), '')
  })
})
