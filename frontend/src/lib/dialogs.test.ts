import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AUTOFOCUS, confirmFocus, focusOnClose, focusOnOpen, isHeldEnter } from './dialogs.ts'

/** Fenêtre réduite à ce que la règle lit : un sélecteur → un élément. */
const dialog = (marked: string | null) => ({
  asked: [] as string[],
  querySelector(selector: string) {
    this.asked.push(selector)
    return marked
  },
})

describe('focus des fenêtres', () => {
  it('une confirmation destructrice donne le focus à « Annuler », jamais au bouton qui supprime', () => {
    assert.equal(confirmFocus(true), 'cancel')
  })

  it('une confirmation sans danger garde le focus sur le bouton qui confirme', () => {
    assert.equal(confirmFocus(false), 'confirm')
  })

  it('à l’ouverture, le focus va à l’élément marqué data-autofocus', () => {
    const d = dialog('champ Nom')
    assert.equal(focusOnOpen(d, false), 'champ Nom')
    assert.deepEqual(d.asked, [AUTOFOCUS])
    assert.equal(AUTOFOCUS, '[data-autofocus]')
  })

  it('sans élément marqué, le navigateur garde son choix', () => {
    assert.equal(focusOnOpen(dialog(null), false), null)
  })

  it('au doigt, rien n’est focalisé (le clavier de l’écran ne s’ouvre pas tout seul)', () => {
    const d = dialog('champ Nom')
    assert.equal(focusOnOpen(d, true), null)
    assert.deepEqual(d.asked, [])
  })
})

describe('touche maintenue dans une fenêtre', () => {
  it('une Entrée répétée n’active ni bouton ni formulaire', () => {
    assert.equal(isHeldEnter({ key: 'Enter', repeat: true }, 'BUTTON'), true)
    assert.equal(isHeldEnter({ key: 'Enter', repeat: true }, 'INPUT'), true)
    assert.equal(isHeldEnter({ key: 'Enter', repeat: true }, 'button'), true)
  })

  it('une pression franche passe', () => {
    assert.equal(isHeldEnter({ key: 'Enter', repeat: false }, 'BUTTON'), false)
  })

  it('les autres touches répétées passent (texte, flèches, effacement)', () => {
    for (const key of ['a', ' ', 'ArrowRight', 'Backspace', 'Tab', 'Escape']) assert.equal(isHeldEnter({ key, repeat: true }, 'INPUT'), false, key)
  })

  it('dans une zone de texte, l’Entrée maintenue reste un retour à la ligne', () => {
    assert.equal(isHeldEnter({ key: 'Enter', repeat: true }, 'TEXTAREA'), false)
    assert.equal(isHeldEnter({ key: 'Enter', repeat: true }, 'textarea'), false)
  })
})

describe('focus à la fermeture d’une fenêtre', () => {
  /** `take` d'essai : seuls les éléments visibles prennent le focus ; on note qui a été essayé. */
  const taker = (visible: string[]) => {
    const tried: string[] = []
    return { tried, take: (el: string) => (tried.push(el), visible.includes(el)) }
  }

  it('revient au déclencheur quand il peut le prendre, sans essayer le repli', () => {
    const t = taker(['entrée', 'menu'])
    assert.equal(focusOnClose(['entrée', 'menu'], t.take), 'entrée')
    assert.deepEqual(t.tried, ['entrée'])
  })

  it('déclencheur masqué (barre latérale repliée au téléphone) : le bouton du menu le reprend', () => {
    const t = taker(['menu'])
    assert.equal(focusOnClose(['entrée', 'menu'], t.take), 'menu')
    assert.deepEqual(t.tried, ['entrée', 'menu'])
  })

  it('sans déclencheur ni repli utilisable, personne ne le prend', () => {
    assert.equal(focusOnClose([null, undefined], () => true), null)
    assert.equal(focusOnClose(['entrée', 'menu'], () => false), null)
  })
})
