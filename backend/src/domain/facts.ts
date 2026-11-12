// Faits d'une diapositive : ce qu'elle affiche, en lignes de texte. Règles pures, testées.
// C'est la seule chose qu'une IA reçoit (avec le nom et la description de la fiche, et les chiffres clés) et la
// réserve contre laquelle chaque nombre de sa réponse est vérifié. Les faits se déduisent de la partie vivante
// (`SlideLive`) : ce qui part est borné par construction (6 lignes et 4 cartes au plus par diapositive) et ne
// contient jamais une adresse (`url` n'est pas un fait), un chemin, une note de source ni un identifiant.
// Exception voulue à « ce que la diapositive affiche » : l'extrait d'une page du Wiki n'est jamais un fait (seuls
// les titres des pages et leurs dates le sont) — le contenu d'une page ne part vers aucune IA.

import { localDay, longDate, pluralText, quoted, shortened, STATUS_TEXT } from './french.js'
import { numbers, ungrounded, type FoundNumber } from './numbers.js'
import { kpiFigures } from './slides.js'
import type { DeckSlide, Overview, SlideFigure, SlideRow } from './types.js'

export const FACT_LIMITS = { perFact: 240, description: 300, detail: 160 } as const

/** Ce qu'il faut d'une diapositive résolue pour en tirer les faits. */
export type FactSlide = Pick<DeckSlide, 'kind' | 'ref' | 'title' | 'live'>

const fact = (text: string) => shortened(text.replace(/\s*\n\s*/g, ' '), FACT_LIMITS.perFact)

const figureFact = (figure: SlideFigure) => fact(`${figure.label} : ${figure.value}${figure.note ? ` (${figure.note})` : ''}`)

function rowFact(row: SlideRow, withDetail: boolean): string {
  return fact(
    [
      quoted(row.label),
      row.status && (STATUS_TEXT[row.status] ?? row.status),
      withDetail && row.detail && shortened(row.detail, FACT_LIMITS.detail),
      row.date && longDate(localDay(row.date)),
    ]
      .filter(Boolean)
      .join(' — '),
  )
}

/** Titre affiché d'une diapositive : celui qui est écrit, sinon le titre automatique. */
export const shownTitle = (slide: Pick<DeckSlide, 'title' | 'live'>) => slide.title ?? slide.live.auto_title

/**
 * Diapositive d'une page du Wiki (élément visé) : elle n'a que l'extrait de la page à montrer. Le contenu d'une page
 * ne part jamais vers une IA : cette diapositive n'a pas de faits, et n'est pas rédigée.
 */
export const isPageContent = (slide: Pick<DeckSlide, 'kind' | 'ref'>) => slide.kind === 'wiki' && slide.ref !== null

/** Faits communs à toutes les diapositives : la fiche, sa description (300 caractères au plus), les chiffres clés. */
export function generalFacts(overview: Overview): string[] {
  const { project } = overview
  const facts = [fact(`Fiche : ${project.name}`)]
  const description = project.description.trim()
  if (description) facts.push(fact(`Description : ${shortened(description.replace(/\s+/g, ' '), FACT_LIMITS.description)}`))
  if (overview.projets.state === 'ok' && overview.kpis) facts.push(...kpiFigures(overview.kpis).map(figureFact))
  return facts
}

/**
 * Faits d'une diapositive : son titre affiché, sa phrase automatique, ses cartes, ses lignes, « … et N autres ».
 * [] si son état n'est pas `ok` (app arrêtée, élément disparu, texte libre) ou si elle montre le contenu d'une page.
 */
export function slideFacts(slide: FactSlide): string[] {
  const { live } = slide
  if (live.state !== 'ok' || isPageContent(slide)) return []
  const wiki = slide.kind === 'wiki'
  const facts = [fact(`Titre : ${shownTitle(slide)}`)]
  for (const line of live.auto_text.split('\n')) {
    const text = line.replace(/^-\s+/, '').trim()
    if (text) facts.push(fact(text))
  }
  facts.push(...live.figures.map(figureFact))
  facts.push(...live.rows.map((row) => rowFact(row, !wiki)))
  if (live.more > 0) facts.push(`… et ${pluralText(live.more, 'autre', 'autres')}`)
  return facts
}

const size = (facts: readonly string[]) => facts.reduce((sum, line) => sum + line.length + 1, 0)

/**
 * Réduit les groupes de faits pour que tout (faits généraux compris) tienne dans `maxChars` : retire le dernier
 * fait du groupe le plus long, autant de fois qu'il le faut. Le premier fait d'un groupe (le titre) reste toujours.
 * Déterministe : à longueur égale, le premier groupe cède d'abord.
 */
export function fitFacts(general: readonly string[], groups: readonly (readonly string[])[], maxChars: number): string[][] {
  const fitted = groups.map((group) => [...group])
  let total = size(general) + fitted.reduce((sum, group) => sum + size(group), 0)
  while (total > maxChars) {
    let longest: string[] | null = null
    for (const group of fitted) if (group.length > 1 && (!longest || size(group) > size(longest))) longest = group
    if (!longest) break
    total -= (longest.pop() ?? '').length + 1
  }
  return fitted
}

/** Réserve de nombres d'une diapositive : ceux de ses faits et des faits généraux. */
export function factPool(general: readonly string[], facts: readonly string[]): FoundNumber[] {
  return [...general, ...facts].flatMap(numbers)
}

/**
 * Nombres d'un texte rédigé par une IA qui ne figurent plus dans les chiffres du jour (« à relire »). Même
 * comparaison qu'à la rédaction. Un texte écrit à la main n'est jamais comparé (on peut y écrire un budget que le
 * Hub ne connaît pas), ni une diapositive dont l'app ne répond pas.
 */
export function staleNumbers(slide: FactSlide & Pick<DeckSlide, 'body' | 'text_source'>, general: readonly string[]): string[] {
  if ((slide.text_source !== 'ollama' && slide.text_source !== 'claude') || !slide.body || slide.live.state !== 'ok') return []
  return ungrounded(slide.body, factPool(general, slideFacts(slide)))
}
