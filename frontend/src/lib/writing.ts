// « Rédiger avec l'IA » : ce que l'interface en décide. Règles pures, testées.
// Le Hub fait un appel au moteur par requête (plus une relance) ; c'est l'interface qui découpe : une diapositive par
// requête pour Ollama (la progression se voit, on peut arrêter entre deux), douze pour Claude. Le Hub reste le seul
// juge de ce qui est rédigé (`services/writing.ts`) : ces règles évitent seulement de lui demander ce qu'il refuserait.

import { shownTitle } from './deck.ts'
import { plural } from './format.ts'
import type { AiEngineName, Deck, DeckSlide, WriteResult } from './types.ts'

/** Diapositives par requête (`WRITE_LIMITS.claudeBatch` du Hub : douze au plus par appel). */
export const CHUNK_SIZE: Readonly<Record<AiEngineName, number>> = { ollama: 1, claude: 12 }
/** Borne des consignes (`WRITE_LIMITS.instructions` du Hub). */
export const INSTRUCTIONS_MAX = 500

type Skip = 'text' | 'manual' | 'state' | 'page'

function skip(slide: Pick<DeckSlide, 'kind' | 'ref' | 'text_source' | 'live'>, overwriteManual: boolean): Skip | null {
  if (slide.kind === 'text') return 'text'
  if (slide.text_source === 'manual' && !overwriteManual) return 'manual'
  if (slide.live.state !== 'ok') return 'state'
  // Diapositive d'une page du Wiki : elle ne montre que le contenu de la page, qui ne part vers aucune IA.
  if (slide.kind === 'wiki' && slide.ref !== null) return 'page'
  return null
}

/** Pourquoi une diapositive ne sera pas rédigée (les raisons du Hub, `keptReason`) ; null si elle peut l'être. */
export function skipReason(slide: Pick<DeckSlide, 'kind' | 'ref' | 'text_source' | 'live'>, overwriteManual: boolean): string | null {
  switch (skip(slide, overwriteManual)) {
    case 'text':
      return 'pas de données à commenter'
    case 'manual':
      return 'ton texte est gardé'
    case 'state':
      return slide.live.message ?? 'rien à commenter pour l’instant'
    case 'page':
      return 'le contenu d’une page du Wiki ne part pas vers l’IA'
    case null:
      return null
  }
}

/** Une rédaction peut-elle un jour concerner cette diapositive ? Faux pour un texte libre et pour une page du Wiki. */
export function everWritable(slide: Pick<DeckSlide, 'kind' | 'ref'>): boolean {
  return slide.kind !== 'text' && !(slide.kind === 'wiki' && slide.ref !== null)
}

const inScope = (deck: Deck, scope: readonly number[] | null) => (scope === null ? deck.slides : deck.slides.filter((slide) => scope.includes(slide.id)))

/**
 * Diapositives qu'une rédaction peut toucher, dans l'ordre de la présentation (`scope` null : toute la présentation) :
 * ni texte libre, ni état autre que `ok`, ni page du Wiki, ni texte écrit à la main sans la case « Réécrire aussi
 * mes textes ».
 */
export function writable(deck: Deck, scope: readonly number[] | null, overwriteManual: boolean): number[] {
  return inScope(deck, scope).filter((slide) => skip(slide, overwriteManual) === null).map((slide) => slide.id)
}

/** Diapositives de la sélection qui portent un texte écrit à la main (la case « Réécrire aussi mes textes » les concerne). */
export function manualTexts(deck: Deck, scope: readonly number[] | null): number {
  return inScope(deck, scope).filter((slide) => skip(slide, true) === null && slide.text_source === 'manual').length
}

/**
 * Ce que la rédaction laissera tel quel dans la sélection, dit avant de commencer : « 1 texte libre, 2 textes que tu
 * as écrits, 1 diapositive dont l’app ne répond pas ». Vide si tout sera rédigé.
 */
export function leftAside(deck: Deck, scope: readonly number[] | null, overwriteManual: boolean): string {
  const counts: Record<Skip, number> = { text: 0, manual: 0, state: 0, page: 0 }
  for (const slide of inScope(deck, scope)) {
    const why = skip(slide, overwriteManual)
    if (why) counts[why] += 1
  }
  return [
    counts.manual > 0 && plural(counts.manual, 'texte que tu as écrit', 'textes que tu as écrits'),
    counts.text > 0 && plural(counts.text, 'texte libre', 'textes libres'),
    counts.state > 0 && plural(counts.state, 'diapositive sans données à commenter aujourd’hui', 'diapositives sans données à commenter aujourd’hui'),
    counts.page > 0 && `${plural(counts.page, 'page du Wiki', 'pages du Wiki')} (leur contenu ne part vers aucune IA)`,
  ]
    .filter(Boolean)
    .join(', ')
}

/** Découpe en requêtes : une diapositive par requête pour Ollama, douze pour Claude. */
export function writeChunks(engine: AiEngineName, slideIds: readonly number[]): number[][] {
  const size = CHUNK_SIZE[engine]
  const chunks: number[][] = []
  for (let at = 0; at < slideIds.length; at += size) chunks.push(slideIds.slice(at, at + size))
  return chunks
}

/** Résultat d'ensemble de plusieurs requêtes (moteur et modèle de la première) ; null si aucune n'a abouti. */
export function mergeResults(results: readonly WriteResult[]): WriteResult | null {
  const first = results[0]
  if (!first) return null
  return {
    engine: first.engine,
    model: first.model,
    written: results.flatMap((result) => result.written),
    kept: results.flatMap((result) => result.kept),
    slides: results.flatMap((result) => result.slides),
  }
}

/** « Diapositive 3 sur 9 », « Diapositives 1 à 9 sur 9 » : la requête en cours, parmi les `total` diapositives à rédiger. */
export function progressLabel(done: number, chunk: number, total: number): string {
  const from = done + 1
  const to = Math.min(done + chunk, total)
  return to > from ? `Diapositives ${from} à ${to} sur ${total}` : `Diapositive ${from} sur ${total}`
}

/** Durée écoulée : « 42 s », « 1 min 05 s ». */
export function elapsedLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

export interface KeptLine {
  slide_id: number
  /** Rang de la diapositive dans la présentation, à partir de 1 (0 : elle n'y est plus). */
  n: number
  title: string
  reason: string
}

/** Les diapositives qu'une rédaction a laissées telles quelles, dans l'ordre de la présentation, avec la raison du Hub. */
export function keptLines(deck: Deck, kept: WriteResult['kept']): KeptLine[] {
  return kept
    .map(({ slide_id, reason }) => {
      const at = deck.slides.findIndex((slide) => slide.id === slide_id)
      const slide = deck.slides[at]
      return { slide_id, n: at + 1, title: slide ? shownTitle(slide) : 'Diapositive supprimée', reason }
    })
    .sort((a, b) => a.n - b.n)
}

/**
 * Bilan dit à la fin, quand la rédaction ne va pas au bout : ce qui n'a pas été traité reste tel quel. `stopped` :
 * arrêtée par toi ; sinon une requête a échoué (sa raison est dite à part).
 */
export function untouchedNotice(total: number, done: number, stopped: boolean): string {
  const left = total - done
  if (left <= 0) return ''
  const rest = left === 1 ? '1 diapositive n’a pas été traitée : elle garde son texte.' : `${left} diapositives n’ont pas été traitées : elles gardent leur texte.`
  return `${stopped ? 'Rédaction arrêtée.' : 'La rédaction s’est arrêtée.'} ${rest}`
}

// « Créer et rédiger avec l'IA » : la présentation créée s'ouvre, puis sa fenêtre de rédaction. La demande se
// transmet d'un écran à l'autre ici (une seule fois, pour cette présentation), pas dans l'adresse : recharger la
// page ne rouvre pas la fenêtre.
let pending: number | null = null

export function askWriteOnOpen(presentationId: number): void {
  pending = presentationId
}

/** Vrai une seule fois, pour la présentation qui l'a demandé. */
export function takeWriteOnOpen(presentationId: number): boolean {
  if (pending !== presentationId) return false
  pending = null
  return true
}
