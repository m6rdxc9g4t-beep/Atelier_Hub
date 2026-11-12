import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { lightForPrint, printDeck, printSession, printTitle, type PrintDocument } from './print.ts'

/** Faux <html> : un attribut `data-theme`, une classe « dark », un titre. */
function fakeDocument(theme: string | null, dark: boolean, title = 'Atelier Hub') {
  const state = { theme, dark }
  const doc: PrintDocument = {
    title,
    documentElement: {
      getAttribute: (name) => (name === 'data-theme' ? state.theme : null),
      setAttribute: (name, value) => {
        if (name === 'data-theme') state.theme = value
      },
      removeAttribute: (name) => {
        if (name === 'data-theme') state.theme = null
      },
      classList: {
        contains: (name) => name === 'dark' && state.dark,
        toggle: (name, force) => {
          if (name === 'dark') state.dark = force
        },
      },
    },
  }
  return { doc, state }
}

describe('export en PDF', () => {
  it('imprime en clair et rend le thème de l’écran', () => {
    assert.deepEqual(lightForPrint({ theme: 'dark', dark: true }), { apply: { theme: 'light', dark: false }, restore: { theme: 'dark', dark: true } })
    assert.deepEqual(lightForPrint({ theme: 'light', dark: false }), { apply: { theme: 'light', dark: false }, restore: { theme: 'light', dark: false } })
    assert.deepEqual(lightForPrint({ theme: null, dark: false }).restore, { theme: null, dark: false })
  })

  it('sombre → clair le temps de l’impression → sombre', () => {
    const { doc, state } = fakeDocument('dark', true)
    const session = printSession(doc, () => 'Comité de novembre — KPI CGO')
    session.begin()
    assert.deepEqual(state, { theme: 'light', dark: false })
    assert.equal(doc.title, 'Comité de novembre — KPI CGO')
    session.end()
    assert.deepEqual(state, { theme: 'dark', dark: true })
    assert.equal(doc.title, 'Atelier Hub')
  })

  it('un second `begin` (bouton puis `beforeprint`) ne perd pas le thème de l’écran', () => {
    const { doc, state } = fakeDocument('dark', true)
    const session = printSession(doc, () => 'Titre')
    session.begin()
    session.begin()
    session.end()
    assert.deepEqual(state, { theme: 'dark', dark: true })
    assert.equal(doc.title, 'Atelier Hub')
    // `afterprint` deux fois, ou sans impression en cours : rien ne bouge.
    state.theme = 'light'
    state.dark = false
    session.end()
    assert.deepEqual(state, { theme: 'light', dark: false })
  })

  it('remet un <html> sans `data-theme` tel qu’il était', () => {
    const { doc, state } = fakeDocument(null, false)
    const session = printSession(doc, () => '')
    session.begin()
    assert.equal(state.theme, 'light')
    // Sans titre à proposer, celui du document reste.
    assert.equal(doc.title, 'Atelier Hub')
    session.end()
    assert.deepEqual(state, { theme: null, dark: false })
  })

  it('pose le thème clair avant d’appeler l’impression', () => {
    const { doc, state } = fakeDocument('dark', true)
    const session = printSession(doc, () => 'Titre')
    const seen: (string | null)[] = []
    printDeck(session, { print: () => seen.push(state.theme, doc.title) })
    assert.deepEqual(seen, ['light', 'Titre'])
  })

  it('nomme le document « Titre — Fiche »', () => {
    assert.equal(printTitle('Comité de novembre', 'KPI CGO'), 'Comité de novembre — KPI CGO')
    assert.equal(printTitle('Comité de novembre', ''), 'Comité de novembre')
  })
})
