import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFileSync } from 'node:fs'

import { appLine, loadedSummary, noticeAfter, pickStory, projectAction, projectNote } from './examples.ts'
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
    // Une app qui ne livre pas l'histoire ne compte pas : rien ne peut y être chargé.
    const unavailable = app({ state: 'unavailable' })
    assert.equal(loadedSummary([loaded, app({}), unavailable]), 'Chargée dans 1 app sur 2')
    assert.equal(loadedSummary([loaded, loaded, unavailable]), 'Chargée dans toutes les apps qui la livrent')
    assert.equal(loadedSummary([app({}), unavailable]), 'Chargée dans aucune app pour l’instant')
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

  it('ne propose pas « Charger » vers une app qui ne livre pas l’histoire', () => {
    const detail = 'Cette histoire n’est pas livrée avec cette app'
    assert.deepEqual(appLine(app({ app: 'viz', state: 'unavailable', detail })), { status: detail, link: null })
    assert.deepEqual(appLine(app({ app: 'viz', state: 'unavailable' })), { status: detail, link: null })
    // « Pour le reste, charge l'histoire dans l'app » ne vaut que pour une app où elle peut être chargée.
    const loaded = app({ state: 'loaded' })
    const only = projectNote({ project: null, apps: [loaded, app({ app: 'viz', state: 'unavailable', detail })] }, false)
    assert.doesNotMatch(only, /charge l’histoire dans l’app/)
    assert.match(only, /^Chargée dans toutes les apps qui la livrent : la fiche rassemble ce qui est chargé\.$/)
    const mixed = projectNote({ project: null, apps: [loaded, app({}), app({ app: 'viz', state: 'unavailable', detail })] }, false)
    assert.match(mixed, /^Chargée dans 1 app sur 2 : .*charge l’histoire dans l’app, puis reviens ici\.$/)
  })

  it('dit ce que la fiche rassemble, et que retirer l’exemple du Hub = supprimer la fiche', () => {
    const loaded = app({ state: 'loaded' })
    assert.equal(projectNote(story('a', { apps: [loaded, app({})] }), false), 'Chargée dans 1 app sur 2 : la fiche rassemble ce qui est chargé. Pour le reste, charge l’histoire dans l’app, puis reviens ici.')
    assert.equal(projectNote(story('a', { apps: [loaded] }), false), 'Chargée dans toutes les apps : la fiche rassemble ce qui est chargé.')
    assert.equal(
      projectNote(story('a', { apps: [loaded, app({ state: 'down' })] }), false),
      'Chargée dans 1 app sur 2 : la fiche rassemble ce qui est chargé. Une app qui ne répond pas n’est pas rattachée : relance-la, puis reviens ici.',
    )
    assert.match(projectNote(story('a', { project: fiche(false) }), false), /^La fiche « Studio Garance » n’est pas rattachée à tout ce que les apps ont chargé .* mets la fiche à jour/)
    assert.match(projectNote(story('a', { project: fiche(true) }), false), /« Studio Garance » .* supprime la fiche : les apps gardent ce qu’elles ont chargé/)
    assert.match(projectNote(story('a'), true), /^Aperçu : rien n’est enregistré/)
    assert.match(projectNote(story('a', { project: fiche(false) }), true), /supprime la fiche/)
  })

  it('un message né dans la fenêtre s’affiche dans la fenêtre : échec de la fiche, lien de l’aperçu', () => {
    assert.deepEqual(noticeAfter({ kind: 'failed', action: 'create', message: 'Aucune app de la suite ne répond : les exemples se lisent dans les apps.' }), {
      tone: 'danger',
      text: 'La fiche n’a pas été créée : Aucune app de la suite ne répond : les exemples se lisent dans les apps.',
    })
    assert.deepEqual(noticeAfter({ kind: 'failed', action: 'update', message: ' ' }), { tone: 'danger', text: 'La fiche n’a pas été mise à jour.' })
    assert.deepEqual(noticeAfter({ kind: 'preview', text: 'Aperçu : ouvrirait Atelier Tab (http://127.0.0.1:4175/)' }), { tone: 'info', text: 'Aperçu : ouvrirait Atelier Tab (http://127.0.0.1:4175/)' })
    // Le message d'avant ne vaut plus pour une autre histoire, ni pendant un nouvel essai.
    assert.equal(noticeAfter({ kind: 'story' }), null)
    assert.equal(noticeAfter({ kind: 'attempt' }), null)
  })

  it('la fenêtre n’émet aucune notification : au téléphone elle couvre l’écran, la notification passerait dessous', () => {
    const dialog = readFileSync(new URL('../components/ExamplesDialog.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(dialog, /\btoast\(|useUi/)
    // Chaque lien vers une app remet à la fenêtre ce qu'il dirait en aperçu, et la fenêtre l'affiche près de ses boutons.
    const links = dialog.match(/<ExtLink\b[^>]*>/g) ?? []
    assert.ok(links.length > 0)
    for (const link of links) assert.match(link, /onPreview=/, link)
    assert.match(dialog, /dialog__actions--pinned[\s\S]*examples__message/)
  })
})
