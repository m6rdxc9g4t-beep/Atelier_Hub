import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { failureFeedback, refreshFailure, refreshProject, type ListRead } from './refresh.ts'

describe('échec d’une lecture de la fiche', () => {
  it('à l’ouverture d’une fiche : l’écran d’erreur', () => {
    assert.deepEqual(failureFeedback(false, false), { screen: true, toast: false })
  })

  it('actualisation demandée : un message, la fiche reste affichée et aucune erreur n’est gardée en réserve', () => {
    assert.deepEqual(failureFeedback(true, false), { screen: false, toast: true })
  })

  it('relecture automatique au retour sur l’onglet : rien, ni message ni erreur en réserve', () => {
    assert.deepEqual(failureFeedback(true, true), { screen: false, toast: false })
  })
})

describe('actualisation de la fiche', () => {
  /** Étapes simulées : journal des appels et des messages. */
  const steps = (read: ListRead<{ id: number }>) => {
    const log: string[] = []
    return {
      log,
      readList: async () => {
        log.push('liste')
        return read
      },
      readOverview: async (id: number) => {
        log.push(`suite ${id}`)
      },
      notify: (text: string) => {
        log.push(`message ${text}`)
      },
    }
  }

  it('lit la liste, puis la suite une seule fois', async () => {
    const s = steps({ ok: true, list: [{ id: 1 }, { id: 2 }] })
    await refreshProject(2, s)
    assert.deepEqual(s.log, ['liste', 'suite 2'])
  })

  it('dit l’échec quand le Hub lui-même ne répond pas, sans relire la suite', async () => {
    const s = steps({ ok: false, message: 'Le Hub ne répond pas. Vérifie que son serveur est lancé.' })
    await refreshProject(1, s)
    assert.deepEqual(s.log, ['liste', 'message Actualisation impossible : Le Hub ne répond pas. Vérifie que son serveur est lancé.'])
  })

  it('ne relit pas une fiche qui a disparu de la liste', async () => {
    const s = steps({ ok: true, list: [{ id: 1 }] })
    await refreshProject(7, s)
    assert.deepEqual(s.log, ['liste'])
  })

  it('le message d’échec reprend la cause', () => {
    assert.equal(refreshFailure('délai dépassé'), 'Actualisation impossible : délai dépassé')
  })
})
