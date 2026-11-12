// Règles pures des fenêtres (`Modal`, confirmation) : où va le focus à l'ouverture, que faire d'une touche maintenue.
// Sans DOM : testées telles quelles.

/** Marque de l'élément qui reçoit le focus à l'ouverture d'une fenêtre. */
export const AUTOFOCUS = '[data-autofocus]'

/**
 * Bouton d'une confirmation qui reçoit le focus. Jamais celui qui détruit : une Entrée de trop (double pression,
 * touche maintenue) doit annuler, pas supprimer sans retour possible.
 */
export function confirmFocus(danger: boolean): 'cancel' | 'confirm' {
  return danger ? 'cancel' : 'confirm'
}

/**
 * Élément à focaliser à l'ouverture d'une fenêtre : celui marqué `data-autofocus`. Pas au doigt (`coarse`) : le
 * clavier de l'écran s'ouvrirait par-dessus la fenêtre avant qu'on ait rien demandé ; le navigateur garde alors son
 * choix (le premier bouton).
 */
export function focusOnOpen<T>(root: { querySelector(selector: string): T | null }, coarse: boolean): T | null {
  return coarse ? null : root.querySelector(AUTOFOCUS)
}

/** Marque de l'élément qui reprend le focus quand le déclencheur d'une fenêtre n'est plus à l'écran (bouton du menu). */
export const FOCUS_FALLBACK = '[data-focus-fallback]'

/**
 * Qui reprend le focus à la fermeture d'une fenêtre : son déclencheur ; s'il ne peut plus le prendre (entrée de la
 * barre latérale, repliée au téléphone quand la fenêtre s'ouvre), le repli (bouton du menu). `take` pose le focus et
 * dit s'il a été pris : un élément masqué ne le prend pas, et le focus ne reste jamais perdu sur la page.
 */
export function focusOnClose<T>(targets: readonly (T | null | undefined)[], take: (target: T) => boolean): T | null {
  for (const target of targets) if (target && take(target)) return target
  return null
}

/**
 * Entrée maintenue : la répétition de la touche qui a ouvert la fenêtre ne doit rien y activer (bouton, envoi du
 * formulaire). Dans une zone de texte, elle reste un retour à la ligne.
 */
export function isHeldEnter(event: { key: string; repeat: boolean }, tagName: string): boolean {
  return event.repeat && event.key === 'Enter' && tagName.toUpperCase() !== 'TEXTAREA'
}
