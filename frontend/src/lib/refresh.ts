// Lecture et actualisation de la fiche : que montrer quand une lecture échoue, et l'enchaînement d'une actualisation
// (liste des fiches, puis une seule lecture de la suite). Sans React : testé tel quel.

/** Ce qu'un échec de lecture donne à voir. */
export interface FailureFeedback {
  /** L'écran « Lecture impossible » remplace le contenu. */
  screen: boolean
  /** Un message passe par-dessus la fiche restée affichée. */
  toast: boolean
}

/**
 * - Ouverture d'une fiche (rien à l'écran) : l'écran d'erreur.
 * - Actualisation demandée (`quiet` : la fiche reste affichée) : un message, jamais l'écran d'erreur — l'erreur
 *   gardée en réserve ressortirait à la place du chargement de la fiche suivante.
 * - Relecture automatique au retour sur l'onglet (`silent`) : rien, elle réessaiera au prochain retour.
 */
export function failureFeedback(quiet: boolean, silent: boolean): FailureFeedback {
  if (!quiet) return { screen: true, toast: false }
  return { screen: false, toast: !silent }
}

/** Texte du message d'échec d'une actualisation. */
export function refreshFailure(message: string): string {
  return `Actualisation impossible : ${message}`
}

/** Lecture de la liste des fiches : la liste, ou le message de l'échec. */
export type ListRead<P> = { ok: true; list: P[] } | { ok: false; message: string }

export interface RefreshSteps<P> {
  readList: () => Promise<ListRead<P>>
  /** Relit la suite pour la fiche ; dit elle-même son échec. */
  readOverview: (projectId: number) => Promise<void>
  notify: (text: string) => void
}

/**
 * Actualise la fiche courante : la liste des fiches d'abord (nom, rattachements), puis la suite, une seule fois.
 * Si la liste ne se lit pas (Hub arrêté, réseau perdu), on le dit : la fiche restée à l'écran ferait croire que tout
 * va bien. Une fiche disparue de la liste n'est pas relue.
 */
export async function refreshProject<P extends { id: number }>(projectId: number, steps: RefreshSteps<P>): Promise<void> {
  const read = await steps.readList()
  if (!read.ok) {
    steps.notify(refreshFailure(read.message))
    return
  }
  if (read.list.some((p) => p.id === projectId)) await steps.readOverview(projectId)
}
