// Plein écran « Présenter » : ce que fait une touche. Règle pure, sans DOM : testée telle quelle.

/** Aller à la diapositive `go` (rang à partir de 0), quitter, ou ne rien faire. */
export type PresenterAction = { go: number } | 'exit' | null

const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown'])
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp'])
const isSpace = (key: string) => key === ' ' || key === 'Spacebar'

/**
 * - → ↓ PageDown Espace Entrée : suivante ; ← ↑ PageUp Maj+Espace : précédente ; Début / Fin ; Échap : quitter.
 * - `onControl` (le focus est sur un lien ou un bouton) : Espace et Entrée activent l'élément, ils ne changent pas de
 *   diapositive.
 * - Entrée ou Espace maintenue : rien (la touche qui a ouvert la présentation n'avance pas toute seule — règle des
 *   fenêtres du Hub) ; une flèche maintenue fait défiler.
 * - Pas de boucle : au bord, la touche ne fait rien.
 */
export function presenterKey(event: { key: string; shiftKey: boolean; repeat: boolean }, index: number, count: number, onControl: boolean): PresenterAction {
  const { key } = event
  if (key === 'Escape') return 'exit'
  if (count <= 0) return null
  const to = (target: number): PresenterAction => {
    const bounded = Math.min(count - 1, Math.max(0, target))
    return bounded === index ? null : { go: bounded }
  }
  if (key === 'Enter' || isSpace(key)) {
    if (onControl || event.repeat) return null
    return to(isSpace(key) && event.shiftKey ? index - 1 : index + 1)
  }
  if (NEXT.has(key)) return to(index + 1)
  if (PREVIOUS.has(key)) return to(index - 1)
  if (key === 'Home') return to(0)
  if (key === 'End') return to(count - 1)
  return null
}

/** « Diapositive 3 sur 9 : Avancement des features » — annoncé au lecteur d'écran à chaque changement. */
export function slideAnnouncement(index: number, count: number, title: string): string {
  const where = `Diapositive ${index + 1} sur ${count}`
  return title ? `${where} : ${title}` : where
}
