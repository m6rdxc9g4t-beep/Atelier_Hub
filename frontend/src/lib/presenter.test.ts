import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { presenterKey, slideAnnouncement } from './presenter.ts'

const key = (k: string, more: { shiftKey?: boolean; repeat?: boolean } = {}) => ({ key: k, shiftKey: false, repeat: false, ...more })

describe('plein écran : clavier', () => {
  it('avance avec →, ↓, PageDown, Espace et Entrée', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) assert.deepEqual(presenterKey(key(k), 2, 9, false), { go: 3 }, k)
  })

  it('recule avec ←, ↑, PageUp et Maj+Espace', () => {
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) assert.deepEqual(presenterKey(key(k), 2, 9, false), { go: 1 }, k)
    assert.deepEqual(presenterKey(key(' ', { shiftKey: true }), 2, 9, false), { go: 1 })
    // Maj+Entrée reste « suivante » : seule Maj+Espace recule.
    assert.deepEqual(presenterKey(key('Enter', { shiftKey: true }), 2, 9, false), { go: 3 })
  })

  it('va au début et à la fin', () => {
    assert.deepEqual(presenterKey(key('Home'), 4, 9, false), { go: 0 })
    assert.deepEqual(presenterKey(key('End'), 4, 9, false), { go: 8 })
    assert.equal(presenterKey(key('Home'), 0, 9, false), null)
    assert.equal(presenterKey(key('End'), 8, 9, false), null)
  })

  it('ne boucle pas aux bords', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) assert.equal(presenterKey(key(k), 8, 9, false), null, k)
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) assert.equal(presenterKey(key(k), 0, 9, false), null, k)
    assert.equal(presenterKey(key(' ', { shiftKey: true }), 0, 9, false), null)
    // Une seule diapositive, ou aucune : rien ne bouge.
    assert.equal(presenterKey(key('ArrowRight'), 0, 1, false), null)
    assert.equal(presenterKey(key('ArrowRight'), 0, 0, false), null)
  })

  it('quitte avec Échap, où que soit le focus', () => {
    assert.equal(presenterKey(key('Escape'), 3, 9, false), 'exit')
    assert.equal(presenterKey(key('Escape'), 3, 9, true), 'exit')
    assert.equal(presenterKey(key('Escape'), 0, 0, false), 'exit')
  })

  it('sur un lien ou un bouton, Espace et Entrée activent l’élément', () => {
    assert.equal(presenterKey(key(' '), 2, 9, true), null)
    assert.equal(presenterKey(key('Enter'), 2, 9, true), null)
    assert.equal(presenterKey(key(' ', { shiftKey: true }), 2, 9, true), null)
    // Les flèches, elles, changent toujours de diapositive.
    assert.deepEqual(presenterKey(key('ArrowRight'), 2, 9, true), { go: 3 })
    assert.deepEqual(presenterKey(key('ArrowLeft'), 2, 9, true), { go: 1 })
  })

  it('ignore Entrée et Espace maintenues, pas les flèches', () => {
    // La touche qui a ouvert la présentation, encore enfoncée, n'avance pas toute seule.
    assert.equal(presenterKey(key('Enter', { repeat: true }), 0, 9, false), null)
    assert.equal(presenterKey(key(' ', { repeat: true }), 0, 9, false), null)
    assert.deepEqual(presenterKey(key('ArrowRight', { repeat: true }), 0, 9, false), { go: 1 })
    assert.deepEqual(presenterKey(key('PageUp', { repeat: true }), 5, 9, false), { go: 4 })
  })

  it('laisse passer les autres touches', () => {
    for (const k of ['a', 'Tab', 'F5', 'Shift', 'Backspace']) assert.equal(presenterKey(key(k), 2, 9, false), null, k)
  })

  it('annonce la diapositive affichée', () => {
    assert.equal(slideAnnouncement(2, 9, 'Avancement des features'), 'Diapositive 3 sur 9 : Avancement des features')
    assert.equal(slideAnnouncement(0, 1, ''), 'Diapositive 1 sur 1')
  })
})
