// Présentations : ce que l'interface en dit. Règles pures, testées. Aucun calcul sur les données des apps ici :
// la partie vivante d'une diapositive (`live`) arrive résolue du backend.

import { plural, relativeDay, shortDate } from './format.ts'
import type { Deck, DeckSlide, Overview, PresentationSummary, SlideKind, SlideRecord } from './types.ts'

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

// ─── Édition ─────────────────────────────────────────────────────

/** Bornes du Hub (`LIMITS` de `backend/src/services/presentations.ts`) : titre et texte d'une diapositive. */
export const SLIDE_TITLE_MAX = 120
export const SLIDE_BODY_MAX = 600

/**
 * Fusionne l'enregistrement rendu par une écriture dans la présentation tenue par l'écran, sans relire la suite : la
 * partie vivante (`live`) ne dépend ni du titre ni du texte. `stale` juge un texte précis : il tombe si le texte change.
 */
export function applyRecord(deck: Deck, record: SlideRecord): Deck {
  if (!deck.slides.some((slide) => slide.id === record.id)) return deck
  return {
    ...deck,
    presentation: { ...deck.presentation, updated_at: record.updated_at },
    slides: deck.slides.map((slide) => (slide.id === record.id ? { ...slide, ...record, stale: record.body === slide.body ? slide.stale : [] } : slide)),
  }
}

/** Nouvel ordre rendu par le Hub : les diapositives suivent celui des enregistrements, chacune garde `live` et `stale`. */
export function applyOrder(deck: Deck, records: readonly SlideRecord[]): Deck {
  const known = new Map(deck.slides.map((slide) => [slide.id, slide] as const))
  const slides: DeckSlide[] = []
  for (const record of records) {
    const slide = known.get(record.id)
    if (slide) slides.push({ ...slide, ...record })
  }
  return { ...deck, presentation: { ...deck.presentation, slides: slides.length }, slides }
}

/** La présentation sans cette diapositive, positions resserrées. */
export function withoutSlide(deck: Deck, slideId: number): Deck {
  const slides = deck.slides.filter((slide) => slide.id !== slideId).map((slide, position) => ({ ...slide, position }))
  return { ...deck, presentation: { ...deck.presentation, slides: slides.length }, slides }
}

/** Ordre des identifiants après avoir monté (-1) ou descendu (1) une diapositive ; null au bord ou si elle est inconnue. */
export function moveIds(ids: readonly number[], id: number, direction: -1 | 1): number[] | null {
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return null
  const next = [...ids]
  next[from] = ids[to]!
  next[to] = id
  return next
}

const ENGINE_NAMES = { ollama: 'Ollama', claude: 'Claude' } as const

/**
 * D'où vient le texte d'une diapositive, et de quand : un texte rédigé est un contenu du Hub, daté, jamais mis à jour
 * tout seul ; la phrase automatique, elle, est recalculée à chaque lecture.
 */
export function provenance(slide: Pick<DeckSlide, 'kind' | 'body' | 'text_source' | 'text_model' | 'text_at'>, today: string): string {
  if (slide.body === null || slide.text_source === 'auto') return slide.kind === 'text' ? 'Pas encore de texte' : 'Phrase automatique, toujours à jour'
  const day = shortDate(slide.text_at, today)
  const when = day ? ` le ${day}` : ''
  if (slide.text_source === 'manual') return `Ton texte, modifié${when}`
  // Les modèles de Claude sont des alias (« sonnet ») : avec leur majuscule. Ceux d'Ollama gardent leur nom exact.
  const model = slide.text_model && slide.text_source === 'claude' ? slide.text_model.charAt(0).toUpperCase() + slide.text_model.slice(1) : slide.text_model
  return `Rédigé par ${ENGINE_NAMES[slide.text_source]}${model ? ` (${model})` : ''}${when}`
}

/** Panneau de la fiche dont une diapositive peut viser un élément. */
export type ElementPanel = 'wiki' | 'viz' | 'tab' | 'convert' | 'nexus'

export interface KindChoice {
  kind: SlideKind
  /** Nom de la sorte dans « Ajouter une diapositive » (celui de `KIND_INFO`, côté Hub). */
  label: string
  /** Panneau où choisir un élément à viser ; null : la sorte ne vise jamais un élément. */
  element: ElementPanel | null
  /** Ce qu'est un élément de ce panneau, dans le libellé du champ. */
  elementLabel: string | null
}

/** Sortes proposées par « Ajouter une diapositive », « Texte libre » en tête. Mêmes noms que le Hub (test). */
export const KIND_CHOICES: readonly KindChoice[] = [
  { kind: 'text', label: 'Texte libre', element: null, elementLabel: null },
  { kind: 'title', label: 'Titre', element: null, elementLabel: null },
  { kind: 'summary', label: 'Synthèse', element: null, elementLabel: null },
  { kind: 'kpis', label: 'Chiffres clés (Projets)', element: null, elementLabel: null },
  { kind: 'features', label: 'Avancement des features (Projets)', element: null, elementLabel: null },
  { kind: 'active', label: 'En cours et points de blocage (Projets)', element: null, elementLabel: null },
  { kind: 'milestones', label: 'Jalons (Projets)', element: null, elementLabel: null },
  { kind: 'wiki', label: 'Documentation (Wiki)', element: 'wiki', elementLabel: 'Page' },
  { kind: 'viz', label: 'Rapports (Viz)', element: 'viz', elementLabel: 'Rapport' },
  { kind: 'tab', label: 'Tables (Tab)', element: 'tab', elementLabel: 'Table' },
  { kind: 'convert', label: 'Conversions (Convert)', element: 'convert', elementLabel: 'Conversion' },
  { kind: 'nexus', label: 'Agents (Nexus)', element: 'nexus', elementLabel: 'Agent' },
  { kind: 'sources', label: 'Sources', element: null, elementLabel: null },
]

export interface ElementChoice {
  /** Identifiant de l'élément dans son app (`slides.ref`). */
  ref: string
  /** Son libellé au moment du choix (`slides.ref_label`). */
  label: string
}

/**
 * Éléments qu'une diapositive peut viser : ceux que la fiche montre dans ce panneau, avec l'identifiant que le Hub
 * compare à la lecture (`resolveSlide`). Un panneau qui ne répond pas ne propose rien.
 */
export function elementChoices(overview: Pick<Overview, ElementPanel>, panel: ElementPanel): ElementChoice[] {
  if (overview[panel].state !== 'ok') return []
  switch (panel) {
    case 'wiki':
      return overview.wiki.items.map((page) => ({ ref: page.id, label: page.title }))
    case 'nexus':
      return overview.nexus.items.map((agent) => ({ ref: agent.name, label: agent.display_name }))
    default:
      return overview[panel].items.map((item) => ({ ref: item.id, label: item.name }))
  }
}
