// Mise en forme française (chiffres tabulaires côté CSS). Fonctions pures, testées.

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function hours(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`
}

export function count(value: number): string {
  return value.toLocaleString('fr-FR')
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Jour `AAAA-MM-JJ` d'une date ou d'un horodatage ISO, dans le fuseau de l'appareil. Les apps écrivent leurs
 * horodatages en UTC : une page modifiée à 0 h 30 à Paris porte « 23:30Z » la veille, et serait dite « hier ».
 * Une date seule (échéance, jalon) n'a pas de fuseau : elle est rendue telle quelle.
 */
export function localDay(value: string): string {
  if (value.length <= 10) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** « 13 nov. », avec l'année si elle diffère de `today`. Accepte `AAAA-MM-JJ` ou un horodatage ISO. */
export function shortDate(value: string | null | undefined, today: string): string {
  if (!value) return ''
  const [y, m, d] = localDay(value).split('-').map(Number)
  if (!y || !m || !d) return ''
  const base = `${d} ${MONTHS[m - 1]}`
  return String(y) === today.slice(0, 4) ? base : `${base} ${y}`
}

/** « aujourd'hui », « hier », « il y a 3 j », sinon la date courte. */
export function relativeDay(value: string | null | undefined, today: string): string {
  if (!value) return ''
  const days = Math.round((Date.parse(today.slice(0, 10)) - Date.parse(localDay(value))) / 86_400_000)
  if (Number.isNaN(days)) return ''
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  if (days > 1 && days < 7) return `il y a ${days} j`
  return shortDate(value, today)
}

/** « dans 3 j », « demain », « aujourd'hui », « en retard de 2 j ». */
export function dueIn(value: string, today: string): string {
  const days = Math.round((Date.parse(localDay(value)) - Date.parse(today.slice(0, 10))) / 86_400_000)
  if (Number.isNaN(days)) return ''
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  if (days > 1) return `dans ${days} j`
  return `en retard de ${-days} j`
}

export function localToday(): string {
  return localDay(new Date().toISOString())
}

export function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n > 1 ? many : one}`
}

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'À faire',
  IN_PROGRESS: 'En cours',
  IN_REVIEW: 'En revue',
  ON_HOLD: 'En attente',
  BLOCKED: 'Bloquée',
  RESOLVED: 'Résolue',
  CLOSED: 'Terminée',
  REJECTED: 'Rejetée',
}

/** Variable CSS de la couleur officielle d'un statut (docs/SUITE.md §1.4). */
export const STATUS_VARS: Record<string, string> = {
  OPEN: '--status-open',
  IN_PROGRESS: '--status-progress',
  IN_REVIEW: '--status-review',
  ON_HOLD: '--status-hold',
  BLOCKED: '--status-blocked',
  RESOLVED: '--status-resolved',
  CLOSED: '--status-closed',
  REJECTED: '--status-rejected',
}

export const TYPE_LABELS: Record<string, string> = { FEATURE: 'Feature', TASK: 'Tâche', BUG: 'Bug' }

export const SOURCE_LABELS: Record<'database' | 'folder' | 'repo' | 'presentation' | 'file' | 'link', string> = {
  database: 'Base de données',
  folder: 'Dossier',
  repo: 'Dépôt',
  presentation: 'Présentation',
  file: 'Fichier',
  link: 'Lien',
}
