import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultTitle, longDay, moreText, presentationMeta, shownText, shownTitle } from './deck.ts'
import type { DeckSlide, SlideLive } from './types.ts'

const live = (more: Partial<SlideLive> = {}): SlideLive => ({
  state: 'ok',
  message: null,
  app: null,
  url: null,
  url_label: null,
  figures: [],
  rows: [],
  more: 0,
  auto_title: 'Chiffres clés',
  auto_text: '5 features terminées sur 8 (63 %).',
  ...more,
})

const slide = (more: Partial<DeckSlide> = {}): DeckSlide => ({
  id: 1,
  presentation_id: 1,
  position: 0,
  kind: 'kpis',
  title: null,
  body: null,
  ref: null,
  ref_label: null,
  text_source: 'auto',
  text_model: null,
  text_at: null,
  updated_at: '2026-11-10T09:00:00.000Z',
  live: live(),
  stale: [],
  ...more,
})

describe('présentations', () => {
  it('propose le titre « fiche — mois année »', () => {
    assert.equal(defaultTitle('KPI CGO', '2026-11-10'), 'KPI CGO — novembre 2026')
    assert.equal(defaultTitle('Clôture', '2027-01-02'), 'Clôture — janvier 2027')
    assert.equal(defaultTitle('Clôture', '2026-08-31'), 'Clôture — août 2026')
    assert.equal(defaultTitle('Clôture', 'pas une date'), 'Clôture')
  })

  it('résume une présentation dans la liste', () => {
    const today = '2026-11-10'
    assert.equal(presentationMeta({ slides: 9, updated_at: '2026-11-09T10:00:00' }, today), '9 diapositives · modifiée hier')
    assert.equal(presentationMeta({ slides: 1, updated_at: '2026-11-10T08:00:00' }, today), '1 diapositive · modifiée aujourd’hui')
    assert.equal(presentationMeta({ slides: 12, updated_at: '2026-11-07T08:00:00' }, today), '12 diapositives · modifiée il y a 3 j')
    assert.equal(presentationMeta({ slides: 3, updated_at: '2026-10-02T08:00:00' }, today), '3 diapositives · modifiée le 2 oct.')
    assert.equal(presentationMeta({ slides: 3, updated_at: '' }, today), '3 diapositives')
  })

  it('affiche le titre rédigé, sinon le titre automatique', () => {
    assert.equal(shownTitle(slide()), 'Chiffres clés')
    assert.equal(shownTitle(slide({ title: 'Où en est-on ?' })), 'Où en est-on ?')
    // Le titre automatique d'un élément suit son nom dans l'app.
    assert.equal(shownTitle(slide({ kind: 'viz', ref: 'a1', ref_label: 'Ancien nom', live: live({ auto_title: 'Tableau mensuel' }) })), 'Tableau mensuel')
  })

  it('affiche le texte rédigé, sinon la phrase automatique', () => {
    assert.equal(shownText(slide()), '5 features terminées sur 8 (63 %).')
    assert.equal(shownText(slide({ body: 'Le projet tient ses délais.', text_source: 'manual' })), 'Le projet tient ses délais.')
    // Un texte rédigé vide reste vide : la phrase automatique ne revient que quand `body` est nul.
    assert.equal(shownText(slide({ body: '', text_source: 'manual' })), '')
    assert.equal(shownText(slide({ kind: 'text', live: live({ state: 'none', auto_title: 'Texte', auto_text: '' }) })), '')
  })

  it('écrit le jour de la lecture en toutes lettres', () => {
    assert.equal(longDay('2026-11-12'), '12 novembre 2026')
    assert.equal(longDay('2026-03-01'), '1er mars 2026')
    assert.equal(longDay('2026-11-12T08:00:00Z'), '12 novembre 2026')
    assert.equal(longDay('hier'), '')
  })

  it('compte ce qu’une liste ne montre pas', () => {
    assert.equal(moreText(0), '')
    assert.equal(moreText(1), 'et 1 autre')
    assert.equal(moreText(4), 'et 4 autres')
  })
})
