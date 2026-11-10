// Synthèse d'un projet d'Atelier Projets à partir de ses tables `work-items` et `milestones` (docs/SUITE.md §4.3) :
// features, éléments en cours, temps passé, prochaine échéance. Règles pures, testées.

import type { Kpis, Milestone, WorkItem } from './types.js'
import { num, str, type Row } from './table.js'

/** « En cours » au sens du Hub : ce qui avance ou attend une action (statuts du workflow, §1.4). */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'])
export const DONE_STATUSES: ReadonlySet<string> = new Set(['RESOLVED', 'CLOSED'])

export function workItemFromRow(row: Row, url: (id: string) => string): WorkItem | null {
  const id = str(row.id)
  const title = str(row.titre)
  if (!id || !title) return null
  return {
    id,
    type: str(row.type) ?? 'TASK',
    status: str(row.statut_code) ?? 'OPEN',
    title,
    story: str(row.story),
    hours_spent: num(row.heures_passees) ?? 0,
    hours_estimated: num(row.heures_estimees),
    progress: num(row.avancement),
    start: str(row.debut),
    due: str(row.echeance),
    url: url(id),
  }
}

export function milestoneFromRow(row: Row): Milestone | null {
  const id = str(row.id)
  const name = str(row.nom)
  if (!id || !name) return null
  return { id, name, date: str(row.date), reached: row.atteint === true }
}

const byDate = (a: string | null, b: string | null) => (a ?? '9999-12-31').localeCompare(b ?? '9999-12-31')

/** Features dans l'ordre du calendrier (début, puis échéance), les rejetées en dernier. */
export function sortFeatures(items: readonly WorkItem[]): WorkItem[] {
  return items
    .filter((item) => item.type === 'FEATURE')
    .sort((a, b) => Number(a.status === 'REJECTED') - Number(b.status === 'REJECTED') || byDate(a.start ?? a.due, b.start ?? b.due) || byDate(a.due, b.due) || Number(a.id) - Number(b.id))
}

/** Éléments en cours : bloqués d'abord (ils demandent l'attention), puis par échéance. */
export function activeItems(items: readonly WorkItem[]): WorkItem[] {
  const rank = (item: WorkItem) => (item.status === 'BLOCKED' ? 0 : item.status === 'IN_REVIEW' ? 1 : 2)
  return items.filter((item) => ACTIVE_STATUSES.has(item.status)).sort((a, b) => rank(a) - rank(b) || byDate(a.due, b.due))
}

const round = (value: number) => Math.round(value * 100) / 100

export function computeKpis(items: readonly WorkItem[], milestones: readonly Milestone[], today: string): Kpis {
  const counted = items.filter((item) => item.status !== 'REJECTED')
  const features = counted.filter((item) => item.type === 'FEATURE')
  const candidates: { label: string; date: string; kind: 'milestone' | 'item' }[] = []
  for (const m of milestones) if (!m.reached && m.date && m.date >= today) candidates.push({ label: m.name, date: m.date, kind: 'milestone' })
  for (const item of counted) {
    if (!DONE_STATUSES.has(item.status) && item.due && item.due >= today) candidates.push({ label: item.title, date: item.due, kind: 'item' })
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'milestone' ? -1 : 1))
  return {
    hours_spent: round(items.reduce((sum, item) => sum + item.hours_spent, 0)),
    hours_estimated: round(counted.reduce((sum, item) => sum + (item.hours_estimated ?? 0), 0)),
    features_total: features.length,
    features_done: features.filter((item) => DONE_STATUSES.has(item.status)).length,
    active: counted.filter((item) => ACTIVE_STATUSES.has(item.status)).length,
    blocked: counted.filter((item) => item.status === 'BLOCKED').length,
    next_due: candidates[0] ?? null,
  }
}
