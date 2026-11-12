import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { capitalized, countText, hoursText, localDay, longDate, monthYear, percentText, pluralText, quoted, shortDate, SOURCE_KIND_TEXT, STATUS_TEXT, TYPE_TEXT } from '../src/domain/french.js'
import { defaultTitle } from '../src/domain/plan.js'
import { KIND_INFO } from '../src/domain/slides.js'
import { SLIDE_KINDS, SOURCE_KINDS } from '../src/domain/types.js'
import { LINK_KINDS } from '../src/services/projects.js'

// Séparateur de milliers de `toLocaleString('fr-FR')` : espace fine insécable.
const FINE = ' '

describe('mise en forme française', () => {
  it('écrit les heures, les nombres et les pourcentages comme la fiche', () => {
    assert.equal(hoursText(42), '42 h')
    assert.equal(hoursText(42.5), '42,5 h')
    assert.equal(hoursText(67.49), '67,5 h')
    assert.equal(hoursText(0), '0 h')
    assert.equal(countText(1240), `1${FINE}240`)
    assert.equal(countText(7), '7')
    assert.equal(percentText(5, 8), '63 %')
    assert.equal(percentText(0, 8), '0 %')
    assert.equal(percentText(3, 0), null)
    assert.equal(percentText(3, -1), null)
  })

  it('écrit les dates en toutes lettres, sans date relative', () => {
    assert.equal(longDate('2026-12-15'), '15 décembre 2026')
    assert.equal(longDate('2026-03-01'), '1er mars 2026')
    assert.equal(longDate('2026-11-09T12:00:00Z'), '9 novembre 2026')
    assert.equal(shortDate('2026-11-26'), '26 nov. 2026')
    assert.equal(monthYear('2026-11-10'), 'novembre 2026')
    assert.equal(monthYear('2026-08-31'), 'août 2026')
    assert.equal(localDay('2026-11-26'), '2026-11-26')
    assert.equal(localDay('2026-11-09T12:00:00Z'), '2026-11-09')
    assert.equal(localDay('pas une date du tout'), 'pas une da')
    assert.equal(longDate('bientôt'), 'bientôt')
    assert.equal(defaultTitle('KPI CGO', '2026-11-10'), 'KPI CGO — novembre 2026')
  })

  it('accorde, cite et coupe', () => {
    assert.equal(pluralText(0, 'page', 'pages'), '0 page')
    assert.equal(pluralText(1, 'page', 'pages'), '1 page')
    assert.equal(pluralText(6, 'page', 'pages'), '6 pages')
    assert.equal(pluralText(5320, 'ligne', 'lignes'), `5${FINE}320 lignes`)
    assert.equal(quoted('Recette'), '« Recette »')
    assert.equal(quoted('  Sur\ndeux   lignes '), '« Sur deux lignes »')
    assert.equal(quoted('abcdefghij', 5), '« abcd… »')
    assert.equal(quoted('x'.repeat(80)), `« ${'x'.repeat(80)} »`)
    assert.equal(quoted('x'.repeat(81)), `« ${'x'.repeat(79)}… »`)
    assert.equal(capitalized('modifié le 9'), 'Modifié le 9')
    assert.equal(capitalized(''), '')
  })

  it('nomme les 8 statuts, les types et les sortes de source', () => {
    assert.deepEqual(Object.keys(STATUS_TEXT), ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'ON_HOLD', 'BLOCKED', 'RESOLVED', 'CLOSED', 'REJECTED'])
    assert.equal(STATUS_TEXT.CLOSED, 'Terminée')
    assert.deepEqual(TYPE_TEXT, { FEATURE: 'Feature', TASK: 'Tâche', BUG: 'Bug' })
    assert.deepEqual(Object.keys(SOURCE_KIND_TEXT).sort(), [...SOURCE_KINDS].sort())
    assert.deepEqual(SOURCE_KIND_TEXT.database, ['base de données', 'bases de données'])
  })
})

describe('sortes de diapositives', () => {
  it('chaque sorte est décrite ; un élément visé est d’une sorte que la fiche sait épingler', () => {
    assert.deepEqual(Object.keys(KIND_INFO), [...SLIDE_KINDS])
    for (const kind of SLIDE_KINDS) {
      const info = KIND_INFO[kind]
      assert.ok(info.label && info.defaultTitle, kind)
      if (info.refKind) {
        assert.ok(info.app, `${kind} : un élément visé vient d’une app`)
        assert.ok(LINK_KINDS[info.app].includes(info.refKind), `${kind} : ${info.refKind}`)
      }
    }
    assert.deepEqual(SLIDE_KINDS.filter((kind) => KIND_INFO[kind].refKind), ['wiki', 'viz', 'tab', 'convert', 'nexus'])
  })
})
