// Rattacher la fiche aux apps de la suite : ce que l'interface dit d'un projet d'Atelier Projets (contenu, prochaine
// étape), ce que « Lier » affiche quand une app n'a rien à proposer, et quels projets proposer à une nouvelle fiche.
// Règles pures, testées dans linking.test.ts.

import { hours, plural } from './format.ts'
import type { Candidate, Catalog, HubProject, ProjetsContents } from './types.ts'

/** Le Hub est-il servi par un serveur (VPS) plutôt que par cette machine ? Sert à expliquer ce que Tab y montre. */
export function isServerHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return !(host === '' || host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host))
}

/**
 * Sur un serveur, l'index de Tab ne voit que les tables du serveur. Les tables ouvertes dans le navigateur restent
 * dans le navigateur (IndexedDB) : le Hub ne peut pas les lire (Atelier_Deploy, README, « À savoir »).
 */
export const TAB_SERVER_NOTE =
  'Sur le serveur, le Hub ne voit que les tables de Tab écrites sur le serveur (par Convert ou Nexus). Celles que tu ouvres dans Tab depuis ton navigateur restent dans ton navigateur : le Hub ne peut pas les lire.'

/** Message d'un onglet de « Lier » sans candidat : l'app n'a rien à lire, n'a rien du tout, ou rien ne correspond. */
export function emptyPicks(app: Candidate['app'], catalog: Catalog, q: string, onServer: boolean): string[] {
  if (catalog.state === 'off') return [catalog.message ?? 'Rien à lire dans cette app.', ...(app === 'tab' && onServer ? [TAB_SERVER_NOTE] : [])]
  if (q.trim()) return [`Rien ne correspond à « ${q.trim()} ».`]
  const nothing: Partial<Record<Candidate['app'], string>> = {
    projets: 'Atelier Projets n’a encore aucun projet : crées-en un dans Projets, il apparaîtra ici.',
    tab: 'Atelier Tab n’a encore aucune table lisible par le Hub.',
    viz: 'Atelier Viz n’a encore ni rapport ni jeu de données.',
    convert: 'Atelier Convert n’a encore aucune conversion.',
    nexus: 'Atelier Nexus ne propose aucun agent.',
    wiki: 'Le Wiki n’a encore aucun espace.',
  }
  return [nothing[app] ?? 'Rien à proposer.']
}

/** « 1 phase · 2 epics · 3 stories · 2 tâches · 1 bug · 4,5 h passées » : seulement ce qui existe. */
export function contentsLine(contents: ProjetsContents): string {
  const parts = [
    contents.phases ? plural(contents.phases, 'phase', 'phases') : null,
    contents.epics ? plural(contents.epics, 'epic', 'epics') : null,
    contents.stories ? plural(contents.stories, 'story', 'stories') : null,
    contents.features ? plural(contents.features, 'feature', 'features') : null,
    contents.tasks ? plural(contents.tasks, 'tâche', 'tâches') : null,
    contents.bugs ? plural(contents.bugs, 'bug', 'bugs') : null,
    contents.hours_spent > 0 ? `${hours(contents.hours_spent)} passées` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Le projet est-il vide (rien dans Projets, ni arbre ni élément) ? */
export const isEmptyProject = (c: ProjetsContents) => !c.phases && !c.epics && !c.stories && c.features + c.tasks + c.bugs === 0

/**
 * Prochaine étape dans Atelier Projets pour que la fiche montre une frise : la feature naît dans une story, la story
 * dans un epic, l'epic dans une phase. Le texte dit ce qui manque, dans cet ordre.
 */
export function nextStep(c: ProjetsContents): string {
  if (c.phases === 0 || (c.phases === null && isEmptyProject(c))) return 'Crée une phase, un epic et une story dans Atelier Projets, puis tes features : leur frise s’affichera ici.'
  if (c.epics === 0) return 'Ajoute un epic à une phase, puis une story et ses features dans Atelier Projets.'
  if (c.stories === 0) return 'Ajoute une story à un epic, puis ses features dans Atelier Projets.'
  return 'Ajoute des features à une story dans Atelier Projets : leur frise (dates, avancement, heures) s’affichera ici.'
}

/** Projets d'Atelier Projets à proposer à une nouvelle fiche : ceux qu'aucune fiche n'a encore rattachés. */
export function freeProjets(candidates: readonly Candidate[], fiches: readonly HubProject[]): Candidate[] {
  const taken = new Set(fiches.map((f) => f.projets_id).filter((id): id is string => id !== null))
  return candidates.filter((c) => c.app === 'projets' && c.bind && !taken.has(c.ref))
}

/**
 * Champs repris d'un projet choisi : le nom et la description suivent le projet tant que la personne ne les a pas
 * écrits elle-même (un champ vide, ou encore égal à ce qu'avait apporté le projet choisi avant, est remplacé).
 */
export function fromProjet(
  current: { name: string; description: string },
  previous: Candidate | null,
  next: Candidate | null,
): { name: string; description: string } {
  const untouched = (value: string, before: string | null | undefined) => !value.trim() || value === (before ?? '')
  return {
    name: untouched(current.name, previous?.label) ? (next?.label ?? '') : current.name,
    description: untouched(current.description, previous?.detail) ? (next?.detail ?? '') : current.description,
  }
}
