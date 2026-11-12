// Rédaction du commentaire des diapositives : consignes, message, schéma, lecture et contrôle de la réponse.
// Règles pures, testées. Le prompt système ne contient que des consignes (il est constant : c'est un argument de
// ligne de commande pour Claude) ; les faits voyagent dans la conversation, en blocs de données ; les consignes de
// l'auteur sont hors bloc. Chaque nombre d'une réponse est comparé aux faits de sa diapositive.

import { factPool } from '../domain/facts.js'
import { ungrounded } from '../domain/numbers.js'
import { DATA_RULE, dataBlock, type ChatMessage } from './data.js'

/** Diapositive à rédiger : son numéro dans la demande (1…N), son identifiant, sa sorte (constante du Hub), ses faits. */
export interface WriteSlide {
  n: number
  id: number
  kindLabel: string
  facts: string[]
}

/** text : la borne d'un texte de diapositive (`LIMITS.body`) ; ollamaChars : ce qui part au plus vers un petit modèle local. */
export const WRITE_LIMITS = { text: 600, instructions: 500, claudeBatch: 12, ollamaChars: 3000, retryChars: 6000 } as const

export const WRITE_TEMPERATURE = 0.2

export const WRITE_SYSTEM = `Tu rédiges le commentaire des diapositives d'une présentation de projet, pour un comité pressé.
Pour chaque diapositive fournie, écris « texte » : 1 à 3 phrases courtes (350 caractères au plus) qui disent l'essentiel de ses faits. Pour la diapositive « Synthèse » : 2 à 4 lignes commençant par « - ».
Règles :
- utilise UNIQUEMENT les faits de la diapositive et les faits généraux ; recopie chaque nombre et chaque date exactement comme ils sont écrits (unités et % compris) ;
- ne calcule aucun nouveau chiffre (ni somme, ni écart, ni pourcentage) ; n'invente ni cause, ni contexte, ni prévision ;
- français, ton sobre, phrases complètes, sans Markdown ni emoji ;
- réponds uniquement avec l'objet JSON demandé : une entrée par diapositive, avec son numéro « n ».
${DATA_RULE}`

const list = (facts: readonly string[]) => facts.map((fact) => `- ${fact}`).join('\n')

/** Consignes de l'auteur : une ligne, 500 caractères au plus. */
export function cleanInstructions(instructions: string | undefined): string {
  return (instructions ?? '').replace(/\s+/g, ' ').trim().slice(0, WRITE_LIMITS.instructions)
}

/**
 * Conversation d'une rédaction : le prompt système (constant), puis un message qui porte les consignes de l'auteur
 * (hors bloc), les faits généraux et un bloc par diapositive. Le titre d'une diapositive est une ligne de son
 * bloc ; les attributs ne portent que le numéro et la sorte.
 */
export function buildWriteMessages(input: { general: readonly string[]; slides: readonly WriteSlide[]; instructions?: string }): ChatMessage[] {
  const instructions = cleanInstructions(input.instructions)
  const user = [
    instructions && `Consignes de l'auteur : ${instructions}`,
    dataBlock('faits généraux', list(input.general)),
    ...input.slides.map((slide) => dataBlock('diapositive', list(slide.facts), { n: String(slide.n), sorte: slide.kindLabel })),
  ]
    .filter(Boolean)
    .join('\n')
  return [
    { role: 'system', content: WRITE_SYSTEM },
    { role: 'user', content: user },
  ]
}

/** Schéma imposé à la réponse (sortie structurée d'Ollama, `--json-schema` de Claude). Il ne contient aucune donnée. */
export function writeSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    required: ['diapositives'],
    properties: {
      diapositives: {
        type: 'array',
        minItems: 1,
        maxItems: count,
        items: {
          type: 'object',
          required: ['n', 'texte'],
          properties: { n: { type: 'integer', minimum: 1, maximum: count }, texte: { type: 'string' } },
        },
      },
    },
  }
}

export interface WriteError {
  n: number
  id: number
  /** Ce qui est dit au modèle à la relance (« cite « 75 % », absent des faits »). */
  message: string
  /** Ce qui est dit à l'utilisateur si le texte est retiré (« chiffre non vérifiable : 75 % »). */
  reason: string
}

export interface WriteDraft {
  texts: { id: number; body: string }[]
  errors: WriteError[]
}

/** Objet JSON d'une réponse : tel quel, dans un bloc ```json … ```, ou le premier { … } entouré de texte. */
function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const candidate = (fenced?.[1] ?? raw).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) return undefined
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch {
      return undefined
    }
  }
}

/**
 * Texte d'une diapositive, nettoyé : espaces normalisés, lignes vides retirées, marques Markdown retirées (titres
 * « # », gras « ** »), puces « * » / « • » et numérotation (« 1. », « 2) ») ramenées à « - » — avant le contrôle des
 * nombres, pour qu'un numéro de liste ne soit pas pris pour un chiffre.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\*\*|__/g, '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[ \t]+/g, ' ')
        .trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^(?:[*•]|\d{1,2}[.)])\s+/, '- '),
    )
    .filter(Boolean)
    .join('\n')
}

/** Coupe à la dernière phrase (ou ligne) entière qui tient dans `max` ; '' s'il n'en reste aucune. */
export function cutToSentence(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max + 1)
  let end = -1
  for (const match of head.matchAll(/[.!?…](?=\s)|\n/g)) end = match[0] === '\n' ? match.index : match.index + 1
  return end > 0 ? head.slice(0, end).trimEnd() : ''
}

type Entry = { n?: unknown; texte?: unknown }

function entries(raw: string): Entry[] | null {
  const parsed = extractJson(raw)
  if (Array.isArray(parsed)) return parsed as Entry[]
  if (!parsed || typeof parsed !== 'object') return null
  const object = parsed as { diapositives?: unknown; texte?: unknown }
  if (Array.isArray(object.diapositives)) return object.diapositives as Entry[]
  // Tolérance pour un petit modèle : une seule entrée rendue sans son tableau.
  return typeof object.texte === 'string' ? [object as Entry] : null
}

const failed = (slide: WriteSlide, message: string, reason: string): WriteError => ({ n: slide.n, id: slide.id, message, reason })

/**
 * Lit la réponse d'un moteur et contrôle chaque texte : forme, longueur, balise de données recopiée, puis chaque
 * nombre contre les faits de sa diapositive et les faits généraux. Avec une seule diapositive demandée, le numéro
 * « n » est ignoré et la première entrée est prise. Une entrée d'un numéro inconnu est ignorée ; d'un numéro donné
 * deux fois, la première compte.
 */
export function checkWriting(raw: string, slides: readonly WriteSlide[], general: readonly string[]): WriteDraft {
  const draft: WriteDraft = { texts: [], errors: [] }
  const found = entries(raw)
  for (const slide of slides) {
    if (!found) {
      draft.errors.push(failed(slide, 'la réponse n’est pas l’objet JSON demandé', 'réponse illisible'))
      continue
    }
    const entry = slides.length === 1 ? found.find((item) => typeof item?.texte === 'string') : found.find((item) => item?.n === slide.n)
    const cleaned = typeof entry?.texte === 'string' ? cleanText(entry.texte) : ''
    if (!cleaned) {
      draft.errors.push(failed(slide, 'aucun texte', 'aucun texte proposé'))
      continue
    }
    if (/[<‹]\s*\/?\s*donn[eé]es/i.test(cleaned)) {
      draft.errors.push(failed(slide, 'recopie une balise de données', 'réponse inutilisable'))
      continue
    }
    const body = cutToSentence(cleaned, WRITE_LIMITS.text)
    if (!body) {
      draft.errors.push(failed(slide, `texte trop long (${WRITE_LIMITS.text} caractères au plus)`, 'texte trop long'))
      continue
    }
    const unknown = ungrounded(body, factPool(general, slide.facts))
    if (unknown.length > 0) {
      const quoted = unknown.map((number) => `« ${number} »`).join(', ')
      draft.errors.push(failed(slide, `cite ${quoted}, ${unknown.length > 1 ? 'absents' : 'absent'} des faits`, `${unknown.length > 1 ? 'chiffres non vérifiables' : 'chiffre non vérifiable'} : ${unknown.join(', ')}`))
      continue
    }
    draft.texts.push({ id: slide.id, body })
  }
  return draft
}

/** Relance : la réponse précédente (tronquée) et la liste de ses erreurs. Seules les diapositives fautives sont à réécrire. */
export function buildRetryMessages(messages: readonly ChatMessage[], raw: string, errors: readonly WriteError[]): ChatMessage[] {
  const lines = errors.map((error) => `- Diapositive ${error.n} : ${error.message}.`).join('\n')
  return [
    ...messages,
    { role: 'assistant', content: raw.slice(0, WRITE_LIMITS.retryChars) },
    {
      role: 'user',
      content: `Ta réponse contient des erreurs :\n${lines}\nRéécris seulement ${errors.length > 1 ? 'ces diapositives' : 'cette diapositive'}, en gardant ${errors.length > 1 ? 'leurs numéros' : 'son numéro'} et en recopiant uniquement des nombres présents dans les faits.`,
    },
  ]
}
