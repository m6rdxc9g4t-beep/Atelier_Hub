// Plan déterministe d'une présentation : quelles diapositives, dans quel ordre, à partir de ce que la fiche montre.
// Règles pures, testées. Le plan ne porte que des sortes et des références : aucun titre, aucun texte, aucun chiffre.

import { monthYear } from './french.js'
import type { SlideKind } from './types.js'

export interface PlannedSlide {
  kind: SlideKind
  ref: string | null
  ref_label: string | null
}

/** « KPI CGO — novembre 2026 » */
export function defaultTitle(projectName: string, today: string): string {
  return `${projectName} — ${monthYear(today)}`
}

/** Présentation vide : sa seule diapositive de titre. */
export const TITLE_ONLY: readonly PlannedSlide[] = [{ kind: 'title', ref: null, ref_label: null }]
