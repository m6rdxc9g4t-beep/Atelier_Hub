// Présentations : ce que l'interface en dit. Règles pures, testées. Aucun calcul sur les données des apps ici :
// la partie vivante d'une diapositive (`live`) arrive résolue du backend.

import { plural, relativeDay } from './format.ts'
import type { DeckSlide, PresentationSummary } from './types.ts'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/**
 * Titre proposé pour une nouvelle présentation : « KPI CGO — novembre 2026 ». Le même que celui que le Hub pose quand
 * le titre est laissé vide (`defaultTitle` de `backend/src/domain/plan.ts`).
 */
export function defaultTitle(projectName: string, today: string): string {
  const [year, month] = today.split('-').map(Number)
  const name = MONTHS[(month ?? 0) - 1]
  return name && year ? `${projectName} — ${name} ${year}` : projectName
}

/** « 9 diapositives · modifiée hier », « 1 diapositive · modifiée le 9 nov. » */
export function presentationMeta(presentation: Pick<PresentationSummary, 'slides' | 'updated_at'>, today: string): string {
  const slides = plural(presentation.slides, 'diapositive', 'diapositives')
  const when = relativeDay(presentation.updated_at, today)
  if (!when) return slides
  return `${slides} · modifiée ${/^\d/.test(when) ? `le ${when}` : when}`
}

/** Titre affiché : celui que tu as écrit, sinon le titre automatique (relu dans les apps). */
export function shownTitle(slide: Pick<DeckSlide, 'title' | 'live'>): string {
  return slide.title ?? slide.live.auto_title
}
