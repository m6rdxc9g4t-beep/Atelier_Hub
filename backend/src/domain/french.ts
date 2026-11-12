// Mise en forme française des textes calculés par le Hub (titres et phrases automatiques des présentations).
// Fonctions pures, testées. Aucune date relative (« dans 3 jours ») : une phrase automatique ne dépend pas de
// l'heure de lecture. Mêmes libellés que l'interface (frontend/src/lib/format.ts : statuts, types, sources).

import type { SourceKind } from './types.js'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/**
 * Espace insécable : un nombre ne se sépare pas de son unité en fin de ligne (« 67 » puis « % » à la ligne suivante
 * d'une carte étroite). `toLocaleString` en pose déjà une entre les milliers.
 */
export const NBSP = '\u00a0'

/** 42 → « 42 h », 42.5 → « 42,5 h » (arrondi au dixième), l'unité collée au nombre par une espace insécable. */
export function hoursText(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${NBSP}h`
}

/** 1240 → « 1 240 ». */
export function countText(value: number): string {
  return value.toLocaleString('fr-FR')
}

/** 70 → « 70 % » (arrondi à l'unité), le signe collé au nombre par une espace insécable. */
export function percentValue(value: number): string {
  return `${Math.round(value)}${NBSP}%`
}

/** « 63 % » ; null quand le total est nul ou négatif (rien à rapporter). */
export function percentText(part: number, total: number): string | null {
  if (!(total > 0)) return null
  return percentValue((part / total) * 100)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Jour `AAAA-MM-JJ` d'une date ou d'un horodatage ISO, dans le fuseau du serveur. Les apps écrivent leurs
 * horodatages en UTC ; une date seule (échéance, jalon) n'a pas de fuseau : elle est rendue telle quelle.
 */
export function localDay(value: string): string {
  if (value.length <= 10) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parts(day: string): [number, number, number] | null {
  const [y, m, d] = localDay(day).split('-').map(Number)
  if (!y || !m || !d || m > 12 || d > 31) return null
  return [y, m, d]
}

/** « 15 décembre 2026 », « 1er mars 2026 ». Une date illisible est rendue telle quelle. */
export function longDate(day: string): string {
  const p = parts(day)
  if (!p) return day
  return `${p[2] === 1 ? '1er' : p[2]} ${MONTHS[p[1] - 1]} ${p[0]}`
}

/** « 26 nov. 2026 » : pour une carte de chiffres, toujours avec l'année. */
export function shortDate(day: string): string {
  const p = parts(day)
  if (!p) return day
  return `${p[2]} ${SHORT_MONTHS[p[1] - 1]} ${p[0]}`
}

/** « novembre 2026 ». */
export function monthYear(day: string): string {
  const p = parts(day)
  if (!p) return day
  return `${MONTHS[p[1] - 1]} ${p[0]}`
}

/** « 1 page », « 6 pages », « 1 240 lignes ». */
export function pluralText(n: number, one: string, many: string): string {
  return `${countText(n)} ${n > 1 ? many : one}`
}

/** « … », coupé à `max` caractères avec « … ». */
export function quoted(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return `« ${clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean} »`
}

/**
 * Texte ramené à `max` caractères au plus, coupé à la fin d'un mot et terminé par « … ». Les paragraphes sont gardés
 * (un texte court est rendu tel quel, sans ses espaces de bord).
 */
export function shortened(text: string, max: number): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.search(/\s\S*$/)
  // Un mot plus long que la moitié de la place est coupé net plutôt que de vider la phrase.
  const kept = space > max / 2 ? cut.slice(0, space) : cut
  return `${kept.replace(/[\s,;:.!?…—–-]+$/, '')}…`
}

/** Première lettre en capitale. */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Les 8 statuts officiels du workflow (docs/SUITE.md §1.4). */
export const STATUS_TEXT: Readonly<Record<string, string>> = {
  OPEN: 'À faire',
  IN_PROGRESS: 'En cours',
  IN_REVIEW: 'En revue',
  ON_HOLD: 'En attente',
  BLOCKED: 'Bloquée',
  RESOLVED: 'Résolue',
  CLOSED: 'Terminée',
  REJECTED: 'Rejetée',
}

export const TYPE_TEXT: Readonly<Record<string, string>> = { FEATURE: 'Feature', TASK: 'Tâche', BUG: 'Bug' }

/** Sorte de source : singulier, pluriel. */
export const SOURCE_KIND_TEXT: Readonly<Record<SourceKind, readonly [string, string]>> = {
  database: ['base de données', 'bases de données'],
  folder: ['dossier', 'dossiers'],
  repo: ['dépôt', 'dépôts'],
  presentation: ['présentation', 'présentations'],
  file: ['fichier', 'fichiers'],
  link: ['lien', 'liens'],
}
