// Plan déterministe d'une présentation : quelles diapositives, dans quel ordre, à partir de ce que la fiche montre.
// Règles pures, testées. Le plan ne porte que des sortes et des références : aucun titre, aucun texte, aucun chiffre.

import { monthYear } from './french.js'
import type { Overview, PanelState, SlideKind } from './types.js'

export interface PlannedSlide {
  kind: SlideKind
  ref: string | null
  ref_label: string | null
}

export const PLAN_LIMITS = { pinnedReports: 3 } as const

/** « KPI CGO — novembre 2026 » */
export function defaultTitle(projectName: string, today: string): string {
  return `${projectName} — ${monthYear(today)}`
}

const list = (kind: SlideKind): PlannedSlide => ({ kind, ref: null, ref_label: null })

/** Présentation vide : sa seule diapositive de titre. */
export const TITLE_ONLY: readonly PlannedSlide[] = [list('title')]

/**
 * Ordre fixe. Une section entre si son panneau a quelque chose à montrer, ou s'il est `down` : une app arrêtée le
 * jour de la génération ne fait pas disparaître sa section (la diapositive dira qu'elle ne répond pas, puis se
 * remplira). Une fiche sans aucun rattachement donne le titre et la synthèse.
 */
export function buildPlan(overview: Overview): PlannedSlide[] {
  const { projets, wiki, viz, tab, convert, nexus, sources } = overview
  const shown = (panel: { state: PanelState; items: readonly unknown[] }) => panel.items.length > 0 || panel.state === 'down'
  const plan = [list('title'), list('summary')]
  const projetsDown = projets.state === 'down'
  if (overview.kpis !== null || projetsDown) plan.push(list('kpis'))
  if (projets.features.length > 0 || projetsDown) plan.push(list('features'))
  if (projets.active.length > 0 || projetsDown) plan.push(list('active'))
  if (projets.milestones.length > 0 || projetsDown) plan.push(list('milestones'))
  if (shown(wiki)) plan.push(list('wiki'))
  if (shown(viz)) {
    plan.push(list('viz'))
    // Un rapport épinglé a sa diapositive (une app arrêtée garde ses épingles : identifiant et libellé de la fiche).
    for (const report of viz.items.filter((item) => item.pinned).slice(0, PLAN_LIMITS.pinnedReports)) plan.push({ kind: 'viz', ref: report.id, ref_label: report.name })
  }
  if (shown(tab)) plan.push(list('tab'))
  if (convert.items.length > 0) plan.push(list('convert'))
  if (nexus.items.length > 0) plan.push(list('nexus'))
  if (sources.items.length > 0) plan.push(list('sources'))
  return plan
}
