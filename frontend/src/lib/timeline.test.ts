import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildTimeline } from './timeline.ts'

describe('frise des features', () => {
  it('place les barres, les mois et aujourd’hui', () => {
    const tl = buildTimeline(
      [
        { start: '2026-10-05', due: '2026-10-16' },
        { start: null, due: '2026-11-20' },
        { start: null, due: null },
      ],
      '2026-11-10',
    )!
    assert.ok(tl)
    assert.equal(tl.bars[2], null)
    const [a, b] = [tl.bars[0]!, tl.bars[1]!]
    assert.ok(a.left > 0 && a.left < 10, `départ près du bord : ${a.left}`)
    assert.ok(b.left + b.width <= 100 && b.left + b.width > 90)
    assert.deepEqual(tl.months.map((m) => m.label), ['oct.', 'nov.'])
    assert.equal(tl.months[0]!.left, 0)
    assert.ok(tl.today !== null && tl.today > tl.months[1]!.left)
  })

  it('ne rend rien sans aucune date et ignore un « aujourd’hui » hors de la frise', () => {
    assert.equal(buildTimeline([{ start: null, due: null }], '2026-11-10'), null)
    assert.equal(buildTimeline([{ start: '2026-01-01', due: '2026-01-31' }], '2026-11-10')!.today, null)
  })
})
