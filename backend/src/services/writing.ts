// Rédaction du texte des diapositives par une IA : candidates, faits, appel, vérification, relance, retrait,
// enregistrement. Une requête = un appel au moteur, plus une relance au besoin (c'est l'interface qui découpe).
// L'IA n'écrit que `body` : ni titre, ni choix des diapositives, ni chiffres affichés. Elle ne reçoit que les faits
// que les diapositives affichent ; chaque nombre de sa réponse est vérifié contre eux. Un texte qui ne passe pas
// n'est pas enregistré : la diapositive garde ce qu'elle avait (sa phrase automatique, le plus souvent).

import { buildRetryMessages, buildWriteMessages, checkWriting, cleanInstructions, WRITE_LIMITS, writeSchema, type WriteError, type WriteSlide } from '../ai/prompts.js'
import type { Db } from '../db/database.js'
import { fitFacts, generalFacts, isPageContent, slideFacts } from '../domain/facts.js'
import { KIND_INFO, resolveDeck } from '../domain/slides.js'
import type { ClaudeModel, DeckSlide, EngineChoice, WriteResult } from '../domain/types.js'
import { invalid, notFound } from '../http/errors.js'
import { generate, resolveEngine, type AiDeps } from './ai.js'
import { buildOverview, type SuiteContext } from './overview.js'
import { getPresentation, listSlides, writeSlideTexts, type SlideText } from './presentations.js'

export interface WriteInput {
  slide_ids: number[]
  engine?: EngineChoice
  /** Modèle d'Ollama (défaut : OLLAMA_MODEL). */
  model?: string
  claude_model?: ClaudeModel
  /** Consignes de l'auteur (public visé, ton) : 500 caractères au plus. */
  instructions?: string
  /** « Réécrire aussi mes textes » : sans cela, un texte écrit à la main n'est jamais remplacé. */
  overwrite_manual?: boolean
}

/** Pourquoi une diapositive n'est pas donnée à rédiger ; null si elle peut l'être. */
function keptReason(slide: DeckSlide, overwriteManual: boolean): string | null {
  if (slide.kind === 'text') return 'pas de données à commenter'
  if (slide.text_source === 'manual' && !overwriteManual) return 'ton texte est gardé'
  if (slide.live.state !== 'ok') return slide.live.message ?? 'rien à commenter pour l’instant'
  if (isPageContent(slide)) return 'le contenu d’une page du Wiki ne part pas vers l’IA'
  return null
}

export async function writeSlides(db: Db, suite: SuiteContext, ai: AiDeps, presentationId: number, input: WriteInput, signal?: AbortSignal): Promise<WriteResult> {
  // 1. La présentation et les diapositives demandées existent.
  const presentation = getPresentation(db, presentationId)
  const known = new Set(listSlides(db, presentationId).map((slide) => slide.id))
  const ids = [...new Set(input.slide_ids)]
  if (ids.some((id) => !known.has(id))) throw notFound('Diapositive')
  const overwrite = input.overwrite_manual === true

  // 2. Le moteur, AVANT toute lecture des apps : hors ligne, une demande à Claude s'arrête ici (403).
  const resolved = await resolveEngine(db, ai, input)

  // 3. Les faits sont ceux du moment : les apps sont relues, puis les diapositives (elles ont pu changer entre-temps).
  const overview = await buildOverview(db, suite, presentation.project_id)
  const deck = resolveDeck(getPresentation(db, presentationId), listSlides(db, presentationId), overview, suite.today())
  const result: WriteResult = { ...resolved, written: [], kept: [], slides: [] }

  // 4. Candidates : tout ce qui est demandé, moins ce qui n'a rien à commenter ou ne doit pas être réécrit.
  const candidates: DeckSlide[] = []
  for (const id of ids) {
    const slide = deck.slides.find((item) => item.id === id)
    const reason = slide ? keptReason(slide, overwrite) : 'la diapositive a été supprimée entre-temps'
    if (slide && !reason) candidates.push(slide)
    else result.kept.push({ slide_id: id, reason: reason ?? '' })
  }
  if (candidates.length === 0) return result

  // 5. Ce qui part : les faits généraux et, par diapositive, ce qu'elle affiche — réduits à la taille admise.
  const instructions = cleanInstructions(input.instructions)
  const maxChars = resolved.engine === 'ollama' ? Math.min(ai.maxChars, WRITE_LIMITS.ollamaChars) : ai.maxChars
  const general = generalFacts(overview)
  const shells = candidates.map((slide, index): WriteSlide => ({ n: index + 1, id: slide.id, kindLabel: KIND_INFO[slide.kind].label, facts: [] }))
  const wrapping = buildWriteMessages({ general: [], slides: shells, instructions })[1]?.content.length ?? 0
  const fitted = fitFacts(general, candidates.map(slideFacts), maxChars - wrapping)
  const slides = shells.map((shell, index) => ({ ...shell, facts: fitted[index] ?? [] }))
  const messages = buildWriteMessages({ general, slides, instructions })
  if ((messages[1]?.content.length ?? 0) > maxChars) throw invalid('Trop de diapositives pour un seul appel : réduis la sélection')
  const schema = writeSchema(slides.length)

  // 6. Un appel, contrôlé ; s'il reste des erreurs, une relance pour les diapositives fautives ; puis retrait.
  const raw = await generate(db, ai, resolved, { messages, schema, signal })
  const first = checkWriting(raw, slides, general)
  const texts = new Map(first.texts.map((text) => [text.id, text.body]))
  let errors: WriteError[] = first.errors
  if (errors.length > 0) {
    const faulty = slides.filter((slide) => errors.some((error) => error.id === slide.id))
    const again = await generate(db, ai, resolved, { messages: buildRetryMessages(messages, raw, errors), schema, signal })
    const second = checkWriting(again, faulty, general)
    for (const text of second.texts) texts.set(text.id, text.body)
    errors = second.errors
  }
  for (const error of errors) result.kept.push({ slide_id: error.id, reason: error.reason })

  // 7. Enregistrement, en une transaction qui revérifie chaque diapositive (l'appel a pu durer des minutes).
  const source = resolved.engine
  const stored = writeSlideTexts(db, presentationId, new Map([...texts].map(([id, body]): [number, SlideText] => [id, { body, source, model: resolved.model }])), overwrite)
  result.slides = stored.written
  result.written = stored.written.map((slide) => slide.id)
  result.kept.push(...stored.skipped)
  return result
}
