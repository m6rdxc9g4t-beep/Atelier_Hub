// Onglets au clavier (fenêtre « Lier ») : ← → passent à l'onglet voisin en bouclant, Début / Fin vont aux extrémités.
// Les autres touches ne concernent pas les onglets (Tab passe au contenu de l'onglet).

/** Indice de l'onglet visé par la touche, ou `null` si elle ne déplace rien. */
export function tabTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count
    case 'ArrowLeft':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
