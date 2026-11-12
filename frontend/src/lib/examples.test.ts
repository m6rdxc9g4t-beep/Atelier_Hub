import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { appLine, loadedSummary, pickStory, projectAction, projectNote } from './examples.ts'
import type { ExampleApp, ExampleStory } from './types.ts'

const app = (over: Partial<ExampleApp>): ExampleApp => ({ app: 'projets', state: 'absent', detail: null, url: 'http://127.0.0.1:4174/', ...over })
const story = (id: string, over: Partial<ExampleStory> = {}): ExampleStory => ({ id, title: id, subtitle: '', sector: '', summary: '', apps: [], project: null, ...over })
const fiche = (current: boolean) => ({ id: 3, slug: 'studio-garance', name: 'Studio Garance', current })

describe('exemples de la suite', () => {
  it('rouvre l’histoire retenue, sinon la première', () => {
    const stories = [story('a'), story('b')]
    assert.equal(pickStory(stories, 'b')?.id, 'b')
    assert.equal(pickStory(stories, 'disparue')?.id, 'a')
    assert.equal(pickStory(stories, null)?.id, 'a')
    assert.equal(pickStory([], 'a'), null)
  })

  it('le bouton crée la fiche, la met à jour quand une app a chargé depuis, sinon l’ouvre', () => {
    assert.deepEqual(projectAction(story('a'), false), { kind: 'create', label: 'Créer la fiche', blocked: false })
    assert.deepEqual(projectAction(story('a', { project: fiche(false) }), false), { kind: 'update', label: 'Mettre à jour la fiche', blocked: false })
    assert.deepEqual(projectAction(story('a', { project: fiche(true) }), false), { kind: 'open', label: 'Ouvrir la fiche', blocked: false })
  })

  it('en aperçu, rien ne s’écrit : créer est bloqué, une fiche existante s’ouvre seulement', () => {
    assert.deepEqual(projectAction(story('a'), true), { kind: 'create', label: 'Créer la fiche', blocked: true })
    assert.equal(projectAction(story('a', { project: fiche(false) }), true).kind, 'open')
  })

  it('résume où l’histoire est chargée', () => {
    const loaded = app({ state: 'loaded' })
    assert.equal(loadedSummary([app({}), app({ state: 'down' })]), 'Chargée dans aucune app pour l’instant')
    assert.equal(loadedSummary([loaded, app({}), app({})]), 'Chargée dans 1 app sur 3')
    assert.equal(loadedSummary([loaded, loaded, app({ state: 'down' })]), 'Chargée dans 2 apps sur 3')
    assert.equal(loadedSummary([loaded, loaded]), 'Chargée dans toutes les apps')
  })

  it('chaque app dit son état ; le lien ouvre ce qui est chargé, sinon l’endroit où charger, jamais une app arrêtée', () => {
    assert.deepEqual(appLine(app({ state: 'loaded', detail: 'Projet « Gestion 2026 »' })), { status: 'Projet « Gestion 2026 »', link: { label: 'Ouvrir', title: 'Ouvrir dans Atelier Projets' } })
    assert.equal(appLine(app({ state: 'loaded' })).status, 'Chargée')
    const absent = appLine(app({ app: 'convert' }))
    assert.equal(absent.status, 'Pas chargée')
    assert.equal(absent.link?.label, 'Charger')
    assert.match(absent.link?.title ?? '', /Atelier Convert .*le Hub ne le charge pas lui-même/)
    assert.equal(appLine(app({ detail: 'Tab n’a encore rien exporté sur cette machine' })).status, 'Pas chargée · Tab n’a encore rien exporté sur cette machine')
    assert.deepEqual(appLine(app({ app: 'nexus', state: 'down', detail: 'Atelier Nexus ne répond pas' })), { status: 'Atelier Nexus ne répond pas', link: null })
    assert.equal(appLine(app({ app: 'wiki', state: 'down' })).status, 'Atelier Wiki ne répond pas')
  })

  it('dit ce que la fiche rassemble, et que retirer l’exemple du Hub = supprimer la fiche', () => {
    const loaded = app({ state: 'loaded' })
    assert.equal(projectNote(story('a', { apps: [loaded, app({})] }), false), 'Chargée dans 1 app sur 2 : la fiche rassemble ce qui est chargé. Pour le reste, charge l’histoire dans l’app, puis reviens ici.')
    assert.equal(projectNote(story('a', { apps: [loaded] }), false), 'Chargée dans toutes les apps : la fiche rassemble ce qui est chargé.')
    assert.equal(
      projectNote(story('a', { apps: [loaded, app({ state: 'down' })] }), false),
      'Chargée dans 1 app sur 2 : la fiche rassemble ce qui est chargé. Une app qui ne répond pas n’est pas rattachée : relance-la, puis reviens ici.',
    )
    assert.match(projectNote(story('a', { project: fiche(false) }), false), /mets la fiche à jour/)
    assert.match(projectNote(story('a', { project: fiche(true) }), false), /« Studio Garance » .* supprime la fiche : les apps gardent ce qu’elles ont chargé/)
    assert.match(projectNote(story('a'), true), /^Aperçu : rien n’est enregistré/)
    assert.match(projectNote(story('a', { project: fiche(false) }), true), /supprime la fiche/)
  })
})
