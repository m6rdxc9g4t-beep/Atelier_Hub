// Frise des features (panneau Projets) : position de chaque barre entre début et échéance, repères de mois et
// ligne « aujourd'hui ». Calcul pur, en jours, testé.

export interface Span {
  start: string | null
  due: string | null
}

export interface Bar {
  /** Décalage et largeur en % de la frise ; null si l'élément n'a aucune date. */
  left: number
  width: number
}

export interface Timeline {
  from: string
  to: string
  bars: (Bar | null)[]
  months: { label: string; left: number }[]
  today: number | null
}

const DAY = 86_400_000
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function buildTimeline(items: readonly Span[], today: string): Timeline | null {
  const dates = items.flatMap((i) => [i.start, i.due]).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  let from = Math.min(...dates.map(t))
  let to = Math.max(...dates.map(t)) + DAY // l'échéance est incluse
  // Marge de 3 % de chaque côté, au moins une journée.
  const pad = Math.max(DAY, Math.round((to - from) * 0.03 / DAY) * DAY)
  from -= pad
  to += pad
  const span = to - from
  const pct = (ms: number) => Math.round(((ms - from) / span) * 10000) / 100

  const bars = items.map<Bar | null>((item) => {
    const a = item.start ?? item.due
    const b = item.due ?? item.start
    if (!a || !b) return null
    const start = Math.min(t(a), t(b))
    const end = Math.max(t(a), t(b)) + DAY
    return { left: pct(start), width: Math.max(1.2, pct(end) - pct(start)) }
  })

  const months: Timeline['months'] = []
  const first = new Date(from)
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)
  while (cursor < to) {
    const d = new Date(cursor)
    months.push({ label: MONTHS[d.getUTCMonth()]!, left: pct(cursor) })
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }

  // Le mois de départ est nommé aussi quand il laisse assez de place avant le premier repère.
  if (months.length === 0 || months[0]!.left > 12) months.unshift({ label: MONTHS[first.getUTCMonth()]!, left: 0 })

  const now = t(today)
  return { from: iso(from), to: iso(to), bars, months, today: now >= from && now <= to ? pct(now) : null }
}
