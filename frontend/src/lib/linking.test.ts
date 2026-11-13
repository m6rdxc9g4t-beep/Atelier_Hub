import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { contentsLine, emptyPicks, freeProjets, fromProjet, isEmptyProject, isServerHost, nextStep, TAB_SERVER_NOTE } from './linking.ts'
import type { Candidate, HubProject, ProjetsContents } from './types.ts'

const contents = (over: Partial<ProjetsContents> = {}): ProjetsContents => ({ phases: 0, epics: 0, stories: 0, features: 0, tasks: 0, bugs: 0, hours_spent: 0, ...over })
const projet = (ref: string, label: string, detail: string | null = null): Candidate => ({ app: 'projets', kind: 'project', ref, label, detail, bind: true })
const fiche = (id: number, projets_id: string | null) =>
  ({ id, slug: `f${id}`, name: `F${id}`, description: '', keywords: '', projets_id, projets_name: null, wiki_space_id: null, wiki_space: null, tab_project: null, created_at: '', updated_at: '', example: null }) as HubProject

describe('rattachement à Atelier Projets', () => {
  it('dit ce que contient un projet, sans les zéros', () => {
    assert.equal(contentsLine(contents({ phases: 2, epics: 1, stories: 2, tasks: 2, bugs: 1, hours_spent: 4.5 })), '2 phases · 1 epic · 2 stories · 2 tâches · 1 bug · 4,5 h passées')
    assert.equal(contentsLine(contents({ phases: null, epics: null, stories: null, tasks: 1 })), '1 tâche')
    assert.equal(contentsLine(contents()), '')
  })

  it('dit ce qu’il faut créer dans Projets, dans l’ordre de la hiérarchie', () => {
    assert.ok(isEmptyProject(contents()))
    assert.match(nextStep(contents()), /^Crée une phase, un epic et une story/)
    assert.match(nextStep(contents({ phases: 1 })), /^Ajoute un epic/)
    assert.match(nextStep(contents({ phases: 1, epics: 1 })), /^Ajoute une story/)
    assert.match(nextStep(contents({ phases: 1, epics: 1, stories: 2, tasks: 3 })), /^Ajoute des features/)
    // Arbre illisible (ancienne version de Projets) : on ne devine pas ce qui manque au-dessus des éléments
    assert.match(nextStep(contents({ phases: null, epics: null, stories: null, tasks: 1 })), /^Ajoute des features/)
  })

  it('propose à une nouvelle fiche les projets qu’aucune fiche n’a rattachés', () => {
    const list = [projet('4', 'KPI CGO'), projet('5', 'Refonte du site'), projet('12', 'Studio Garance')]
    assert.deepEqual(freeProjets(list, [fiche(1, '4'), fiche(2, null)]).map((c) => c.ref), ['5', '12'])
  })

  it('reprend le nom et la description du projet choisi sans écraser ce qui a été écrit', () => {
    const kpi = projet('4', 'KPI CGO', 'Indicateurs du contrôle de gestion')
    const audit = projet('6', 'Audit des stocks', null)
    assert.deepEqual(fromProjet({ name: '', description: '' }, null, kpi), { name: 'KPI CGO', description: 'Indicateurs du contrôle de gestion' })
    // Changer de projet remplace ce que l'ancien avait apporté
    assert.deepEqual(fromProjet({ name: 'KPI CGO', description: 'Indicateurs du contrôle de gestion' }, kpi, audit), { name: 'Audit des stocks', description: '' })
    // Ce qui a été écrit à la main reste
    assert.deepEqual(fromProjet({ name: 'Mon nom', description: 'Ma description' }, kpi, audit), { name: 'Mon nom', description: 'Ma description' })
    // Désélectionner vide ce qui venait du projet
    assert.deepEqual(fromProjet({ name: 'KPI CGO', description: 'Indicateurs du contrôle de gestion' }, kpi, null), { name: '', description: '' })
  })
})

describe('« Lier » quand une app n’a rien à proposer', () => {
  it('distingue « rien à lire », « rien du tout » et « rien ne correspond »', () => {
    const off = { state: 'off' as const, message: 'Le Hub ne trouve aucune table d’Atelier Tab à lire ici.', candidates: [] }
    assert.deepEqual(emptyPicks('tab', off, 'kpi cgo', false), [off.message])
    assert.deepEqual(emptyPicks('tab', off, 'kpi cgo', true), [off.message, TAB_SERVER_NOTE])
    const ok = { state: 'ok' as const, message: null, candidates: [] }
    assert.deepEqual(emptyPicks('projets', ok, '  kpi  ', false), ['Rien ne correspond à « kpi ».'])
    assert.match(emptyPicks('projets', ok, '', false)[0]!, /aucun projet/)
  })

  it('reconnaît un Hub servi par un serveur', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]', 'hub.localhost']) assert.equal(isServerHost(host), false, host)
    for (const host of ['hub.atelier.mondomaine.fr', 'hub.51-75-149-233.sslip.io', '192.168.1.20']) assert.equal(isServerHost(host), true, host)
  })
})
