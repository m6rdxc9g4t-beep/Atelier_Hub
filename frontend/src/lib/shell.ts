// Coquille : règles pures de la barre latérale (testées sans DOM, shell.test.ts).
// Même forme que dans Atelier Viz et Atelier Tab : barre de 232 px ; sous 1024 px, un rail d'icônes (Viz) d'où le
// panneau complet — la liste des fiches — s'ouvre par-dessus la page, en tiroir (Tab). Reprise d'Atelier Wiki.

import type { ThemePreference } from './theme.ts'

/** Dernière largeur du rail d'icônes : la barre complète commence à 1024 px (palier `lg` de Viz). */
export const RAIL_MAX_WIDTH = 1023.98

/** Requête de média du rail : la même que dans `hub.css` (vérifié par `design.test.ts`). */
export const RAIL_QUERY = `(max-width: ${RAIL_MAX_WIDTH}px)`

const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark']

/** Bouton de thème du rail : Système → Clair → Sombre → Système. */
export function nextTheme(preference: ThemePreference): ThemePreference {
  return THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length]!
}

/**
 * Ce qui, ouvert par-dessus le panneau, reçoit Échap avant lui : fenêtre modale, menu (sélecteur de la suite).
 * À lire **avant** que la touche ne soit traitée (écouteur en phase de capture) : un menu se referme en la traitant.
 */
export const PANEL_LAYERS = 'dialog[open], [role="menu"]'

/** Échap referme le panneau ouvert par-dessus la page — sauf si une fenêtre ou un menu est ouvert : la touche est pour eux. */
export function panelShortcut(e: { key: string }, state: { open: boolean; layered: boolean }): 'close' | null {
  return e.key === 'Escape' && state.open && !state.layered ? 'close' : null
}

/**
 * Le panneau ouvert depuis le rail couvre la page (voile) : tant qu'il est ouvert, le reste de la page est inerte —
 * Tab ne sort pas vers des liens cachés sous le voile. Barre complète (≥ 1024 px) : jamais.
 */
export function panelCovers(state: { open: boolean; rail: boolean }): boolean {
  return state.open && state.rail
}
