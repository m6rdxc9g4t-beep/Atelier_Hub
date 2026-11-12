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

/** « 12 novembre 2026 », « 1er mars 2026 » (vide si le jour est illisible). */
export function longDay(day: string): string {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number)
  const name = MONTHS[(month ?? 0) - 1]
  return name && year && date ? `${date === 1 ? '1er' : date} ${name} ${year}` : ''
}

/** « et 4 autres », « et 1 autre » : ce qu'une liste ne montre pas (vide s'il ne manque rien). */
export function moreText(more: number): string {
  return more > 0 ? `et ${plural(more, 'autre', 'autres')}` : ''
}

/** Titre affiché : celui que tu as écrit, sinon le titre automatique (relu dans les apps). */
export function shownTitle(slide: Pick<DeckSlide, 'title' | 'live'>): string {
  return slide.title ?? slide.live.auto_title
}

/** Texte affiché : celui qui a été rédigé, sinon la phrase automatique (calculée sur les chiffres du jour). */
export function shownText(slide: Pick<DeckSlide, 'body' | 'live'>): string {
  return slide.body ?? slide.live.auto_text
}
