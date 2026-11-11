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

/**
 * Entrée maintenue : la répétition de la touche qui a ouvert la fenêtre ne doit rien y activer (bouton, envoi du
 * formulaire). Dans une zone de texte, elle reste un retour à la ligne.
 */
export function isHeldEnter(event: { key: string; repeat: boolean }, tagName: string): boolean {
  return event.repeat && event.key === 'Enter' && tagName.toUpperCase() !== 'TEXTAREA'
}
