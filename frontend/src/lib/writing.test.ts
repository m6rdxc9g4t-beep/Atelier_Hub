import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Deck, DeckSlide, SlideLive, SlideRecord, WriteResult } from './types.ts'
import {
  askWriteOnOpen,
  elapsedLabel,
  everWritable,
  keptLines,
  leftAside,
  manualTexts,
  mergeResults,
  progressLabel,
  skipReason,
  takeWriteOnOpen,
  untouchedNotice,
  writable,
  writeChunks,
} from './writing.ts'

const plain = (text: string) => text.replace(/[  ]/g, ' ')

const live = (more: Partial<SlideLive> = {}): SlideLive => ({ state: 'ok', message: null, app: null, url: null, url_label: null, figures: [], rows: [], more: 0, auto_title: 'Titre automatique', auto_text: 'Phrase automatique.', ...more })

const slide = (id: number, more: Partial<DeckSlide> = {}): DeckSlide => ({
  id,
  presentation_id: 1,
  position: id - 1,
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

const deck = (slides: DeckSlide[]): Deck => ({
  presentation: { id: 1, project_id: 1, title: 'KPI CGO — novembre 2026', slides: slides.length, created_at: '2026-11-10T09:00:00.000Z', updated_at: '2026-11-10T09:00:00.000Z' },
  project: { id: 1 } as Deck['project'],
  slides,
  generated_at: '2026-11-10T09:00:00.000Z',
})

const DECK = deck([
  slide(1, { kind: 'title' }),
  slide(2, { kind: 'kpis', title: 'Où en est-on ?' }),
  slide(3, { kind: 'features', body: 'Mon commentaire.', text_source: 'manual' }),
  slide(4, { kind: 'viz', live: live({ state: 'down', message: 'Atelier Viz ne répond pas.' }) }),
  slide(5, { kind: 'wiki' }),
  slide(6, { kind: 'wiki', ref: '12', ref_label: 'Dictionnaire des indicateurs' }),
  slide(7, { kind: 'text', title: 'Décisions', body: 'À trancher jeudi.', text_source: 'manual' }),
  slide(8, { kind: 'milestones', body: 'Rédigé hier.', text_source: 'ollama', text_model: 'llama3.2:1b' }),
  slide(9, { kind: 'tab', live: live({ state: 'missing', message: null }) }),
])

describe('rédaction par une IA', () => {
  it('ne donne à rédiger que ce que le Hub rédigerait', () => {
    assert.deepEqual(writable(DECK, null, false), [1, 2, 5, 8])
    // « Réécrire aussi mes textes » : le texte écrit à la main d'une diapositive vivante entre ; un texte libre, jamais.
    assert.deepEqual(writable(DECK, null, true), [1, 2, 3, 5, 8])
    // Une seule diapositive.
    assert.deepEqual(writable(DECK, [2], false), [2])
    assert.deepEqual(writable(DECK, [3], false), [])
    assert.deepEqual(writable(DECK, [3], true), [3])
    assert.deepEqual(writable(DECK, [4], true), [])
    assert.deepEqual(writable(DECK, [99], true), [])
    // L'ordre est celui de la présentation, pas celui de la sélection.
    assert.deepEqual(writable(DECK, [8, 2, 1], false), [1, 2, 8])
  })

  it('dit pourquoi une diapositive garde son texte, avec les raisons du Hub', () => {
    const by = (id: number) => DECK.slides.find((s) => s.id === id)!
    assert.equal(skipReason(by(1), false), null)
    assert.equal(skipReason(by(3), false), 'ton texte est gardé')
    assert.equal(skipReason(by(3), true), null)
    assert.equal(skipReason(by(4), false), 'Atelier Viz ne répond pas.')
    assert.equal(skipReason(by(9), false), 'rien à commenter pour l’instant')
    assert.equal(skipReason(by(6), false), 'le contenu d’une page du Wiki ne part pas vers l’IA')
    assert.equal(skipReason(by(7), true), 'pas de données à commenter')
    // Le bouton « Rédiger avec l'IA » d'une diapositive : jamais pour un texte libre ni pour une page du Wiki.
    assert.deepEqual(DECK.slides.filter((s) => !everWritable(s)).map((s) => s.id), [6, 7])
    assert.equal(manualTexts(DECK, null), 1)
    assert.equal(manualTexts(DECK, [2]), 0)
    assert.equal(manualTexts(DECK, [3]), 1)
    assert.equal(leftAside(DECK, null, false), '1 texte que tu as écrit, 1 texte libre, 2 diapositives sans données à commenter aujourd’hui, 1 page du Wiki (leur contenu ne part vers aucune IA)')
    assert.equal(leftAside(DECK, null, true), '1 texte libre, 2 diapositives sans données à commenter aujourd’hui, 1 page du Wiki (leur contenu ne part vers aucune IA)')
    assert.equal(leftAside(DECK, [1, 2], false), '')
  })

  it('découpe en requêtes : une diapositive pour Ollama, douze pour Claude', () => {
    const ids = Array.from({ length: 14 }, (_, i) => i + 1)
    assert.deepEqual(writeChunks('ollama', [4, 7, 9]), [[4], [7], [9]])
    assert.deepEqual(writeChunks('claude', ids).map((chunk) => chunk.length), [12, 2])
    assert.deepEqual(writeChunks('claude', ids).flat(), ids)
    assert.deepEqual(writeChunks('claude', [4, 7, 9]), [[4, 7, 9]])
    assert.deepEqual(writeChunks('ollama', []), [])
  })

  it('rassemble les résultats des requêtes', () => {
    const record = (id: number): SlideRecord => {
      const { live: _live, stale: _stale, ...rest } = slide(id, { body: 'Texte.', text_source: 'ollama', text_model: 'llama3.2:1b' })
      return rest
    }
    const results: WriteResult[] = [
      { engine: 'ollama', model: 'llama3.2:1b', written: [1], kept: [], slides: [record(1)] },
      { engine: 'ollama', model: 'llama3.2:1b', written: [], kept: [{ slide_id: 2, reason: 'chiffre non vérifiable : 75 %' }], slides: [] },
      { engine: 'ollama', model: 'llama3.2:1b', written: [5], kept: [], slides: [record(5)] },
    ]
    const merged = mergeResults(results)!
    assert.deepEqual([merged.engine, merged.model, merged.written, merged.kept.length, merged.slides.map((s) => s.id)], ['ollama', 'llama3.2:1b', [1, 5], 1, [1, 5]])
    assert.equal(mergeResults([]), null)
    // Les diapositives gardées : leur rang et leur titre affiché dans la présentation, dans son ordre.
    assert.deepEqual(keptLines(DECK, [{ slide_id: 8, reason: 'réponse illisible' }, { slide_id: 2, reason: 'chiffre non vérifiable : 75 %' }, { slide_id: 99, reason: 'la diapositive a été supprimée entre-temps' }]), [
      { slide_id: 99, n: 0, title: 'Diapositive supprimée', reason: 'la diapositive a été supprimée entre-temps' },
      { slide_id: 2, n: 2, title: 'Où en est-on ?', reason: 'chiffre non vérifiable : 75 %' },
      { slide_id: 8, n: 8, title: 'Titre automatique', reason: 'réponse illisible' },
    ])
  })

  it('dit où en est la rédaction, et ce qui n’a pas été traité', () => {
    assert.equal(progressLabel(0, 1, 9), 'Diapositive 1 sur 9')
    assert.equal(progressLabel(2, 1, 9), 'Diapositive 3 sur 9')
    assert.equal(progressLabel(0, 9, 9), 'Diapositives 1 à 9 sur 9')
    assert.equal(progressLabel(12, 12, 14), 'Diapositives 13 à 14 sur 14')
    assert.equal(progressLabel(12, 1, 13), 'Diapositive 13 sur 13')
    assert.equal(plain(elapsedLabel(0)), '0 s')
    assert.equal(plain(elapsedLabel(42.9)), '42 s')
    assert.equal(plain(elapsedLabel(65)), '1 min 05 s')
    assert.equal(untouchedNotice(9, 9, false), '')
    assert.equal(untouchedNotice(9, 3, true), 'Rédaction arrêtée. 6 diapositives n’ont pas été traitées : elles gardent leur texte.')
    assert.equal(untouchedNotice(9, 8, false), 'La rédaction s’est arrêtée. 1 diapositive n’a pas été traitée : elle garde son texte.')
  })

  it('« Créer et rédiger avec l’IA » n’ouvre la fenêtre qu’une fois, pour la présentation créée', () => {
    assert.equal(takeWriteOnOpen(7), false)
    askWriteOnOpen(7)
    assert.equal(takeWriteOnOpen(8), false)
    assert.equal(takeWriteOnOpen(7), true)
    assert.equal(takeWriteOnOpen(7), false)
  })
})
