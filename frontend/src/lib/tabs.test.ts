import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { tabTarget } from './tabs.ts'

describe('onglets au clavier', () => {
  const count = 6 // Projets, Wiki, Tab, Viz, Convert, Nexus

  it('← et → passent à l’onglet voisin', () => {
    assert.equal(tabTarget('ArrowRight', 0, count), 1)
    assert.equal(tabTarget('ArrowRight', 3, count), 4)
    assert.equal(tabTarget('ArrowLeft', 3, count), 2)
  })

  it('les extrémités bouclent', () => {
    assert.equal(tabTarget('ArrowRight', count - 1, count), 0)
    assert.equal(tabTarget('ArrowLeft', 0, count), count - 1)
  })

  it('Début et Fin vont au premier et au dernier onglet', () => {
    assert.equal(tabTarget('Home', 4, count), 0)
    assert.equal(tabTarget('End', 1, count), count - 1)
  })

  it('les autres touches ne déplacent rien (Tab passe à la recherche, Entrée et Espace activent)', () => {
    for (const key of ['Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'a', 'Escape']) assert.equal(tabTarget(key, 2, count), null, key)
  })

  it('un seul onglet reste sur place, aucun onglet ne vise rien', () => {
    assert.equal(tabTarget('ArrowRight', 0, 1), 0)
    assert.equal(tabTarget('ArrowLeft', 0, 1), 0)
    assert.equal(tabTarget('End', 0, 0), null)
  })
})
