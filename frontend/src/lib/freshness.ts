// Fraîcheur de la fiche : le Hub est un aiguillage, on le quitte pour une app puis on y revient. Au retour sur l'onglet,
// la fiche est relue si sa dernière lecture date un peu ; jamais pendant une lecture, ni dans un onglet caché.

/** Âge au-delà duquel la fiche est relue au retour sur l'onglet. */
export const STALE_AFTER_MS = 30_000

export interface FreshnessState {
  /** L'onglet est affiché. */
  visible: boolean
  /** Une lecture est déjà en cours. */
  busy: boolean
  /** Instant (ms) de la dernière lecture réussie ; `null` tant qu'aucune n'a abouti. */
  loadedAt: number | null
}

export function shouldRefresh(state: FreshnessState, now: number, maxAge: number = STALE_AFTER_MS): boolean {
  if (!state.visible || state.busy || state.loadedAt === null) return false
  return now - state.loadedAt >= maxAge
}

/** « 14:05 » : heure locale d'un horodatage ISO (vide s'il est illisible). */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
