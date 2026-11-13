import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { countText, hoursText, percentText } from '../src/domain/french.js'
import { grounded, numbers, ungrounded } from '../src/domain/numbers.js'

const read = (text: string) => numbers(text).map((n) => [n.text, n.value, n.percent])

describe('nombres d’un texte', () => {
  it('lit les formats français (cas d’Atelier Viz)', () => {
    assert.deepEqual(read('4,4 M ; 974 k ; 22,4 % ; 1 234 567 ; 2 millions ; T1'), [
      ['4,4 M', 4.4e6, false],
      ['974 k', 974e3, false],
      ['22,4 %', 22.4, true],
      ['1 234 567', 1234567, false],
      ['2 millions', 2e6, false],
    ])
    assert.deepEqual(read('3 Md ; 2 milliards ; 5 milliers ; +48 % ; −12'), [
      ['3 Md', 3e9, false],
      ['2 milliards', 2e9, false],
      ['5 milliers', 5e3, false],
      ['+48 %', 48, true],
      ['−12', 12, false],
    ])
  })

  it('lit les séparateurs du Hub : espace insécable (U+00A0) et espace fine insécable (U+202F)', () => {
    assert.deepEqual(
      numbers('1 234 567 ; 974 k ; 4,4 M ; +48 %').map((n) => [n.value, n.percent]),
      [
        [1234567, false],
        [974e3, false],
        [4.4e6, false],
        [48, true],
      ],
    )
    // Ce que le Hub écrit lui-même se relit.
    assert.deepEqual(numbers(countText(5320)).map((n) => n.value), [5320])
    assert.deepEqual(numbers(hoursText(42.5)).map((n) => [n.value, n.precision]), [[42.5, 0.05]])
    assert.deepEqual(numbers(percentText(5, 8)!).map((n) => [n.value, n.percent]), [[63, true]])
  })

  it('lit les heures et les dates longues, pas un chiffre collé à un mot', () => {
    assert.deepEqual(numbers('42,5 h passées sur 80 h, le 15 décembre 2026').map((n) => n.value), [42.5, 80, 15, 2026])
    assert.deepEqual(numbers('12 h / 16 h · 5 / 8').map((n) => n.value), [12, 16, 5, 8])
    assert.deepEqual(numbers('le 1er mars, au T3, en v2, la facture n°A12'), [])
    assert.deepEqual(numbers('aucun chiffre ici'), [])
  })
})

describe('nombres présents dans les faits', () => {
  const pool = numbers(`Total : 4,4 M ; hausse de 48 % ; 5 320 lignes ; 1 bloqué ; 5 features terminées sur 8 (63 %) ; 42,5 h ; le 15 décembre 2026`)

  it('admet un nombre recopié, même écrit autrement', () => {
    assert.deepEqual(ungrounded('Environ 4,4 millions ; hausse de 48 %', pool), [])
    // Recopié sans espace de milliers, ou avec une autre espace.
    assert.deepEqual(ungrounded('5320 lignes, ou 5 320, ou 5 320', pool), [])
    assert.deepEqual(ungrounded('42,5 h passées ; 5 features sur 8, soit 63 % ; le 15 décembre 2026', pool), [])
  })

  it('refuse un nombre inventé, sans aucune exemption', () => {
    assert.deepEqual(ungrounded('Une marge de 12 % et 7,5 M de commandes', pool), ['12 %', '7,5 M'])
    // Petit entier inventé : « 3 bloqués » pour « 1 bloqué » (Viz l'admettrait, pas le Hub).
    assert.deepEqual(ungrounded('3 bloqués', pool), ['3'])
    // Année absente des faits.
    assert.deepEqual(ungrounded('comme en 2025', pool), ['2025'])
    // Pourcentage recalculé par le modèle (le complément, une autre base).
    assert.deepEqual(ungrounded('il reste 37 %', pool), ['37 %'])
    assert.deepEqual(ungrounded('soit 60 % des features', pool), ['60 %'])
    // À la précision du nombre écrit par l'IA, jamais à celle du fait : « 62,5 % » ou « 4 412 000 » sont plus
    // précis que « 63 % » et « 4,4 M », donc invérifiables (Viz les admettait).
    assert.deepEqual(ungrounded('soit 62,5 % des features', pool), ['62,5 %'])
    assert.deepEqual(ungrounded('soit 62,4 % des features', pool), ['62,4 %'])
    assert.deepEqual(ungrounded('soit 4 412 000', pool), ['4 412 000'])
  })

  it('compare pourcentage contre pourcentage, et ne répète pas un nombre refusé', () => {
    assert.deepEqual(ungrounded('48 k', pool), ['48 k'])
    assert.deepEqual(ungrounded('63 features', pool), ['63'])
    assert.deepEqual(ungrounded('8 %', pool), ['8 %'])
    assert.deepEqual(ungrounded('7 jours, puis encore 7 jours', pool), ['7'])
    assert.equal(grounded(numbers('4 M')[0]!, pool), true, 'à la précision écrite près')
    assert.equal(grounded(numbers('4,9 M')[0]!, pool), false)
  })

  it('refuse une décimale ajoutée à un fait arrondi, admet un arrondi plus grossier', () => {
    const facts = numbers('Temps passé : 1 h ; Budget : 13 k€ ; Avancement : 63 % ; Estimé : 100 h ; Total : 1 280 lignes')
    assert.deepEqual(ungrounded('1,4 h passées', facts), ['1,4'])
    assert.deepEqual(ungrounded('un budget de 13 499 €', facts), ['13 499'])
    assert.deepEqual(ungrounded('avancement de 63,4 %', facts), ['63,4 %'])
    assert.deepEqual(ungrounded('100,4 h estimées', facts), ['100,4'])
    assert.deepEqual(ungrounded('1 h passée, 13 k€ de budget, 63 %, 100 h, environ 1,3 k lignes', facts), [])
  })

  it('compare le signe comme Viz', () => {
    const facts = numbers('Retard : −12 % ; Avance : 5 j')
    assert.deepEqual(ungrounded('un retard de +12 %', facts), ['+12 %'])
    assert.deepEqual(ungrounded('un écart de −12 %', facts), [])
    assert.deepEqual(ungrounded('un retard de 12 %', facts), [], 'sans signe, si la phrase dit le retard')
    assert.deepEqual(ungrounded('un écart de 12 %', facts), ['12 %'], 'sans signe ni mot de baisse')
    assert.deepEqual(ungrounded('une avance de -5 j', facts), ['-5'])
    assert.deepEqual(ungrounded('une avance de +5 j', facts), [])
    assert.deepEqual(numbers('−12 %').map((n) => [n.value, n.sign]), [[12, '-']])
  })

  it('limite connue : un nombre présent mais mal attribué passe', () => {
    assert.deepEqual(ungrounded('8 features bloquées', pool), [])
  })
})
