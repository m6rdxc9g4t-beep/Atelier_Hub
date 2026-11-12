// « Exemples de la suite » : règles de la fenêtre (histoire retenue, action sur la fiche, libellés des apps).
// Les histoires vivent dans les apps ; le Hub dit où elles sont chargées et tient la fiche qui les rassemble.
// Sans React ni DOM : testé tel quel.

import type { AppId, ExampleApp, ExampleStory } from './types.ts'

/** Histoire choisie, mémorisée sur l'appareil : clé commune aux apps de la suite (Atelier_Deploy/exemples). */
export const STORY_KEY = 'atelier:exemple'

export const APP_SHORT: Readonly<Record<AppId, string>> = { convert: 'Convert', tab: 'Tab', viz: 'Viz', nexus: 'Nexus', projets: 'Projets', wiki: 'Wiki' }

/** L'histoire affichée : celle retenue si elle existe encore, sinon la première. */
export function pickStory(stories: readonly ExampleStory[], remembered: string | null): ExampleStory | null {
  return stories.find((s) => s.id === remembered) ?? stories[0] ?? null
}

/**
 * Ce que fait le bouton principal pour une histoire :
 * - `create` : pas encore de fiche (`blocked` en aperçu : rien ne s'y enregistre) ;
 * - `update` : la fiche existe, mais n'est pas rattachée à tout ce que les apps ont chargé (chargement fait depuis,
 *   rattachement changé à la main) : on la rattache, puis on l'ouvre ;
 * - `open` : la fiche est à jour (ou l'aperçu, lecture seule) : on l'ouvre, sans rien écrire.
 */
export type ProjectAction = { kind: 'create'; label: string; blocked: boolean } | { kind: 'update' | 'open'; label: string; blocked: false }

export function projectAction(story: Pick<ExampleStory, 'project'>, readOnly: boolean): ProjectAction {
  if (!story.project) return { kind: 'create', label: 'Créer la fiche', blocked: readOnly }
  if (story.project.current || readOnly) return { kind: 'open', label: 'Ouvrir la fiche', blocked: false }
  return { kind: 'update', label: 'Mettre à jour la fiche', blocked: false }
}

/**
 * « Chargée dans 4 apps sur 6 » : ce que la fiche aura à rassembler. Une app qui ne livre pas l'histoire
 * (`unavailable`) ne compte pas : rien ne peut y être chargé.
 */
export function loadedSummary(apps: readonly ExampleApp[]): string {
  const delivering = apps.filter((a) => a.state !== 'unavailable')
  const loaded = delivering.filter((a) => a.state === 'loaded').length
  if (loaded === 0) return 'Chargée dans aucune app pour l’instant'
  if (loaded === delivering.length) return delivering.length === apps.length ? 'Chargée dans toutes les apps' : 'Chargée dans toutes les apps qui la livrent'
  return `Chargée dans ${loaded} app${loaded > 1 ? 's' : ''} sur ${delivering.length}`
}

export interface AppLine {
  /** « Chargée », « Pas chargée », « Pas livrée avec cette app », ou le message d'une app qui ne répond pas. */
  status: string
  /** Lien vers l'app : ce qui est chargé, ou l'endroit où l'on charge. Aucun vers une app arrêtée, ni vers une app qui ne livre pas l'histoire (rien à y charger). */
  link: { label: string; title: string } | null
}

export function appLine(app: ExampleApp): AppLine {
  const name = `Atelier ${APP_SHORT[app.app]}`
  if (app.state === 'down') return { status: app.detail ?? `${name} ne répond pas`, link: null }
  if (app.state === 'unavailable') return { status: app.detail ?? 'Cette histoire n’est pas livrée avec cette app', link: null }
  if (app.state === 'loaded') return { status: app.detail ?? 'Chargée', link: { label: 'Ouvrir', title: `Ouvrir dans ${name}` } }
  return {
    status: app.detail ? `Pas chargée · ${app.detail}` : 'Pas chargée',
    link: { label: 'Charger', title: `Ouvrir ${name} pour y charger l’exemple (le Hub ne le charge pas lui-même)` },
  }
}

/** Phrase sous la liste des apps : ce que la fiche rassemble, et comment retirer l'exemple du Hub. */
export function projectNote(story: Pick<ExampleStory, 'project' | 'apps'>, readOnly: boolean): string {
  if (!story.project) {
    if (readOnly) return 'Aperçu : rien n’est enregistré. Lance le Hub sur ta machine pour créer la fiche de cette histoire.'
    const absent = story.apps.some((a) => a.state === 'absent') ? ' Pour le reste, charge l’histoire dans l’app, puis reviens ici.' : ''
    const down = story.apps.some((a) => a.state === 'down') ? ' Une app qui ne répond pas n’est pas rattachée : relance-la, puis reviens ici.' : ''
    return `${loadedSummary(story.apps)} : la fiche rassemble ce qui est chargé.${absent}${down}`
  }
  if (!story.project.current && !readOnly) {
    // Vrai dans les deux cas : une app a chargé l'histoire depuis, ou le rattachement a été changé à la main.
    return `La fiche « ${story.project.name} » n’est pas rattachée à tout ce que les apps ont chargé pour cette histoire : mets la fiche à jour pour l’y rattacher.`
  }
  return `La fiche « ${story.project.name} » rassemble cette histoire. Pour retirer l’exemple du Hub, supprime la fiche : les apps gardent ce qu’elles ont chargé.`
}
