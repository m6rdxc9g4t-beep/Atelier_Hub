import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseSlideText } from './slide-text.ts'

describe('texte d’une diapositive', () => {
  it('un texte vide ne donne rien', () => {
    assert.deepEqual(parseSlideText(''), [])
    assert.deepEqual(parseSlideText('  \n\n \t\n'), [])
  })

  it('les lignes vides séparent les paragraphes, un retour simple reste dans le paragraphe', () => {
    assert.deepEqual(parseSlideText('5 features terminées sur 8 (63 %).\n42 h passées.\n\n\nLe comité se réunit jeudi.  '), [
      { type: 'p', text: '5 features terminées sur 8 (63 %).\n42 h passées.' },
      { type: 'p', text: 'Le comité se réunit jeudi.' },
    ])
    assert.deepEqual(parseSlideText('Une ligne\r\nla suivante'), [{ type: 'p', text: 'Une ligne\nla suivante' }])
  })

  it('les lignes « - » font une liste', () => {
    assert.deepEqual(parseSlideText('- Avancement : 2 features terminées sur 6.\n- 6 éléments en cours, dont 1 bloqué.\n- 5 pages, 2 rapports.'), [
      { type: 'ul', items: ['Avancement : 2 features terminées sur 6.', '6 éléments en cours, dont 1 bloqué.', '5 pages, 2 rapports.'] },
    ])
  })

  it('paragraphes et listes s’enchaînent, avec ou sans ligne vide', () => {
    assert.deepEqual(parseSlideText('En bref :\n- un\n- deux\nPuis la suite.\n\n– trois\n• quatre'), [
      { type: 'p', text: 'En bref :' },
      { type: 'ul', items: ['un', 'deux'] },
      { type: 'p', text: 'Puis la suite.' },
      { type: 'ul', items: ['trois', 'quatre'] },
    ])
  })

  it('un tiret sans espace, ou dans la phrase, n’est pas une liste ; une puce vide est ignorée', () => {
    assert.deepEqual(parseSlideText('-5 % sur le mois\nKPI CGO - novembre'), [{ type: 'p', text: '-5 % sur le mois\nKPI CGO - novembre' }])
    assert.deepEqual(parseSlideText('- \n- un'), [{ type: 'ul', items: ['un'] }])
  })

  it('les balises et le Markdown restent du texte', () => {
    const text = '<script>alert(1)</script> <b>gras</b> **gras** [lien](https://exemple.fr) &amp;'
    assert.deepEqual(parseSlideText(text), [{ type: 'p', text }])
    assert.deepEqual(parseSlideText('- <img src=x onerror=alert(1)>'), [{ type: 'ul', items: ['<img src=x onerror=alert(1)>'] }])
  })
})
