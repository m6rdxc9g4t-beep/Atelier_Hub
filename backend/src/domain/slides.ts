// Diapositives d'une présentation : catalogue des sortes et partie vivante. Règles pures, testées.
// Une diapositive enregistrée ne porte que sa structure et son texte rédigé ; tout le reste (cartes de chiffres,
// lignes, liens, états, titre et phrase automatiques) se calcule ici, à chaque lecture, à partir de la vue
// d'ensemble de la fiche (les apps viennent d'être relues). Une seule fonction par sorte : ce qu'elle affiche.

import { capitalized, countText, hoursText, localDay, longDate, percentText, pluralText, quoted, shortDate, SOURCE_KIND_TEXT, TYPE_TEXT } from './french.js'
import { APP_LABELS } from './relevance.js'
import {
  SOURCE_KINDS,
  type AgentItem,
  type AppId,
  type ConversionItem,
  type Deck,
  type DocItem,
  type Kpis,
  type Milestone,
  type Overview,
  type PanelBase,
  type PresentationSummary,
  type ReportItem,
  type SlideFigure,
  type SlideKind,
  type SlideLive,
  type SlideRecord,
  type SlideRow,
  type TableItem,
  type WorkItem,
} from './types.js'

export interface KindInfo {
  /** Nom de la sorte dans « Ajouter une diapositive ». */
  label: string
  /** Titre automatique d'une diapositive de liste. */
  defaultTitle: string
  /** App lue (icône, lien « Ouvrir Atelier … »), sinon null. */
  app: AppId | null
  /** Sorte d'élément visable par `ref` (celles de LINK_KINDS : page, report, table, conversion, agent), sinon null. */
  refKind: string | null
  /** Lignes affichées au plus ; le reste est compté dans `more`. */
  listed: number
}

const LISTED = 6

export const KIND_INFO: Readonly<Record<SlideKind, KindInfo>> = {
  title: { label: 'Titre', defaultTitle: 'Titre', app: null, refKind: null, listed: 0 },
  summary: { label: 'Synthèse', defaultTitle: 'Synthèse', app: null, refKind: null, listed: 0 },
  kpis: { label: 'Chiffres clés (Projets)', defaultTitle: 'Chiffres clés', app: 'projets', refKind: null, listed: 0 },
  features: { label: 'Avancement des features (Projets)', defaultTitle: 'Avancement des features', app: 'projets', refKind: null, listed: LISTED },
  active: { label: 'En cours et points de blocage (Projets)', defaultTitle: 'En cours et points de blocage', app: 'projets', refKind: null, listed: LISTED },
  milestones: { label: 'Jalons (Projets)', defaultTitle: 'Jalons', app: 'projets', refKind: null, listed: LISTED },
  wiki: { label: 'Documentation (Wiki)', defaultTitle: 'Documentation', app: 'wiki', refKind: 'page', listed: LISTED },
  viz: { label: 'Rapports (Viz)', defaultTitle: 'Rapports', app: 'viz', refKind: 'report', listed: LISTED },
  tab: { label: 'Tables (Tab)', defaultTitle: 'Tables', app: 'tab', refKind: 'table', listed: LISTED },
  convert: { label: 'Conversions (Convert)', defaultTitle: 'Conversions', app: 'convert', refKind: 'conversion', listed: LISTED },
  nexus: { label: 'Agents (Nexus)', defaultTitle: 'Agents', app: 'nexus', refKind: 'agent', listed: LISTED },
  sources: { label: 'Sources', defaultTitle: 'Sources', app: null, refKind: null, listed: LISTED },
  text: { label: 'Texte libre', defaultTitle: 'Texte', app: null, refKind: null, listed: 0 },
}

// ─── Outils ──────────────────────────────────────────────────────

const appName = (app: AppId) => `Atelier ${APP_LABELS[app]}`
const dayText = (value: string) => longDate(localDay(value))
/** Accord d'un participe sur une quantité qui n'est pas entière (« 1,5 h passée », « 2 h passées »). */
const agree = (value: number, one: string, many: string) => (value >= 2 ? many : one)

const row = (id: string, label: string, more: Partial<SlideRow> = {}): SlideRow => ({ id, label, detail: null, date: null, status: null, url: null, ...more })
const figure = (label: string, value: string, note: string | null = null, warn = false): SlideFigure => ({ label, value, note, warn })
const joined = (parts: readonly (string | null | false | undefined)[], separator: string): string | null => parts.filter(Boolean).join(separator) || null

/** Élément le plus récent d'une liste (les horodatages des apps n'ont pas tous le même fuseau : on compare les instants). */
function latest<T>(items: readonly T[], date: (item: T) => string | null): T | null {
  let best: T | null = null
  let bestTime = -Infinity
  for (const item of items) {
    const value = date(item)
    const time = value ? Date.parse(value) : Number.NaN
    if (!Number.isNaN(time) && time > bestTime) {
      best = item
      bestTime = time
    }
  }
  return best
}

function blank(record: SlideRecord): SlideLive {
  const info = KIND_INFO[record.kind]
  return {
    state: 'ok',
    message: null,
    app: info.app,
    url: null,
    url_label: null,
    figures: [],
    rows: [],
    more: 0,
    auto_title: (record.ref !== null && record.ref_label) || info.defaultTitle,
    auto_text: '',
  }
}

// ─── Diapositives lues dans un panneau de la fiche ───────────────

interface PanelSpec<T> {
  panel: PanelBase
  items: readonly T[]
  id: (item: T) => string
  name: (item: T) => string
  /** Lien de la diapositive de liste (« Ouvrir Atelier Viz »). */
  open: string
  row: (item: T) => SlideRow
  /** Phrase automatique d'une liste non vide, et d'une liste vide. */
  text: (items: readonly T[]) => string
  empty: string
  /** Diapositive d'un élément visé par `ref` : ce qui s'ajoute à son titre (le nom de l'élément). */
  element?: (item: T) => Partial<SlideLive>
}

function fromPanel<T>(record: SlideRecord, spec: PanelSpec<T>): SlideLive {
  const live = blank(record)
  const { panel, items } = spec
  const listed = KIND_INFO[record.kind].listed
  const app = live.app ? appName(live.app) : ''
  live.url = panel.url
  live.url_label = spec.open

  if (panel.state !== 'ok') {
    // L'app ne répond pas, ou rien n'y est rattaché : seuls les libellés gardés par le Hub restent affichés.
    live.state = panel.state
    live.message = panel.message
    if (record.ref !== null) live.rows = [row(record.ref, record.ref_label ?? record.ref)]
    else {
      live.rows = items.slice(0, listed).map((item) => row(spec.id(item), spec.name(item)))
      live.more = Math.max(0, items.length - listed)
    }
    return live
  }

  if (record.ref !== null) {
    const item = items.find((candidate) => spec.id(candidate) === record.ref)
    if (!item) {
      live.state = 'missing'
      live.message = `${quoted(record.ref_label ?? record.ref)} n’est plus rattaché à cette fiche, ou n’existe plus dans ${app}.`
      return live
    }
    return { ...live, auto_title: spec.name(item), ...spec.element?.(item) }
  }

  live.rows = items.slice(0, listed).map(spec.row)
  live.more = Math.max(0, items.length - listed)
  live.auto_text = items.length > 0 ? spec.text(items) : spec.empty
  return live
}

// ─── Projets ─────────────────────────────────────────────────────

const openProjets = (overview: Overview) => (overview.project.projets_id ? 'Ouvrir le projet dans Atelier Projets' : 'Ouvrir Atelier Projets')

/** Statut d'une feature dans une phrase : singulier, pluriel ; dans l'ordre où la phrase les donne. */
const FEATURE_STATUS: readonly (readonly [string, string, string])[] = [
  ['CLOSED', 'terminée', 'terminées'],
  ['RESOLVED', 'résolue', 'résolues'],
  ['IN_PROGRESS', 'en cours', 'en cours'],
  ['IN_REVIEW', 'en revue', 'en revue'],
  ['BLOCKED', 'bloquée', 'bloquées'],
  ['ON_HOLD', 'en attente', 'en attente'],
  ['OPEN', 'à faire', 'à faire'],
  ['REJECTED', 'rejetée', 'rejetées'],
]

function featuresText(features: readonly WorkItem[]): string {
  const known = new Set(FEATURE_STATUS.map(([status]) => status))
  const parts = FEATURE_STATUS.flatMap(([status, one, many]) => {
    const n = features.filter((item) => item.status === status).length
    return n > 0 ? [pluralText(n, one, many)] : []
  })
  const other = features.filter((item) => !known.has(item.status)).length
  if (other > 0) parts.push(pluralText(other, 'autre', 'autres'))
  return `${pluralText(features.length, 'feature', 'features')} : ${parts.join(', ')}.`
}

function featureRow(item: WorkItem): SlideRow {
  const hours = item.hours_estimated !== null ? `${hoursText(item.hours_spent)} / ${hoursText(item.hours_estimated)}` : item.hours_spent > 0 ? hoursText(item.hours_spent) : null
  return row(item.id, item.title, {
    detail: joined([item.progress !== null && `${Math.round(item.progress)} %`, hours], ' · '),
    date: item.due,
    status: item.status,
    url: item.url,
  })
}

function activeText(items: readonly WorkItem[]): string {
  const blocked = items.filter((item) => item.status === 'BLOCKED')
  const head = pluralText(items.length, 'élément en cours', 'éléments en cours')
  if (blocked.length === 0) return `${head}. Rien n’est bloqué.`
  const named = blocked.slice(0, 2).map((item) => quoted(item.title))
  const rest = blocked.length - named.length
  return `${head}, dont ${pluralText(blocked.length, 'bloqué', 'bloqués')} : ${named.join(', ')}${rest > 0 ? ` et ${pluralText(rest, 'autre', 'autres')}` : ''}.`
}

function milestonesText(milestones: readonly Milestone[]): string {
  const reached = milestones.filter((m) => m.reached).length
  const next = milestones.find((m) => !m.reached)
  const count = reached === 0 ? `Aucun jalon atteint sur ${countText(milestones.length)}.` : `${pluralText(reached, 'jalon atteint', 'jalons atteints')} sur ${countText(milestones.length)}.`
  if (!next) return count
  return `Prochain jalon : ${quoted(next.name)}${next.date ? `, le ${dayText(next.date)}` : ''}. ${count}`
}

function kpiFigures(k: Kpis): SlideFigure[] {
  const ratio = percentText(k.hours_spent, k.hours_estimated)
  return [
    figure('Temps passé', hoursText(k.hours_spent), k.hours_estimated > 0 ? `sur ${hoursText(k.hours_estimated)} estimées${ratio ? ` · ${ratio}` : ''}` : 'aucune estimation'),
    figure('Features', `${countText(k.features_done)} / ${countText(k.features_total)}`, 'terminées'),
    figure('En cours', countText(k.active), k.blocked > 0 ? `dont ${pluralText(k.blocked, 'bloquée', 'bloquées')}` : 'rien de bloqué', k.blocked > 0),
    figure('Prochaine échéance', k.next_due ? shortDate(k.next_due.date) : '—', k.next_due ? `${k.next_due.kind === 'milestone' ? 'jalon ' : ''}${k.next_due.label}` : 'aucune date à venir'),
  ]
}

const featuresDone = (k: Kpis) =>
  k.features_done === 0
    ? `Aucune feature terminée sur ${countText(k.features_total)}`
    : `${pluralText(k.features_done, 'feature terminée', 'features terminées')} sur ${countText(k.features_total)} (${percentText(k.features_done, k.features_total)})`

function kpisText(k: Kpis): string {
  const sentences: string[] = []
  if (k.features_total > 0) sentences.push(`${featuresDone(k)}.`)
  const spent = `${hoursText(k.hours_spent)} ${agree(k.hours_spent, 'passée', 'passées')}`
  if (k.hours_estimated > 0) {
    sentences.push(`${spent} sur ${hoursText(k.hours_estimated)} ${agree(k.hours_estimated, 'estimée', 'estimées')} (${percentText(k.hours_spent, k.hours_estimated)}).`)
  } else if (k.hours_spent > 0) sentences.push(`${spent}, sans estimation.`)
  return sentences.join(' ') || 'Aucun chiffre pour l’instant.'
}

function resolveKpis(record: SlideRecord, overview: Overview): SlideLive {
  const live = blank(record)
  const panel = overview.projets
  live.url = panel.url
  live.url_label = openProjets(overview)
  if (panel.state !== 'ok') return { ...live, state: panel.state, message: panel.message }
  if (!overview.kpis) return { ...live, auto_text: 'Aucun chiffre pour l’instant.' }
  return { ...live, figures: kpiFigures(overview.kpis), auto_text: kpisText(overview.kpis) }
}

// ─── Fiche : titre, synthèse, sources ────────────────────────────

function resolveTitle(record: SlideRecord, overview: Overview, presentationTitle: string): SlideLive {
  const { project } = overview
  return { ...blank(record), auto_title: presentationTitle, auto_text: project.description.trim() || `Présentation du projet ${project.name}.` }
}

function summaryText(overview: Overview): string {
  const lines: string[] = []
  const k = overview.kpis
  if (k) {
    if (k.features_total > 0) lines.push(`Avancement : ${featuresDone(k).replace(/^Aucune/, 'aucune')}.`)
    if (k.active > 0) lines.push(`${pluralText(k.active, 'élément en cours', 'éléments en cours')}, ${k.blocked > 0 ? `dont ${pluralText(k.blocked, 'bloqué', 'bloqués')}` : 'rien n’est bloqué'}.`)
    if (k.next_due) lines.push(`Prochaine échéance : ${quoted(k.next_due.label)}, le ${dayText(k.next_due.date)}.`)
  }
  // Seul un panneau qui répond est compté : les éléments d'une app arrêtée ne sont que des libellés de repli.
  const sizes = [
    overview.wiki.state === 'ok' && overview.wiki.items.length > 0 && pluralText(overview.wiki.items.length, 'page', 'pages'),
    overview.viz.state === 'ok' && overview.viz.items.length > 0 && pluralText(overview.viz.items.length, 'rapport', 'rapports'),
    overview.tab.state === 'ok' && overview.tab.items.length > 0 && pluralText(overview.tab.items.length, 'table', 'tables'),
    overview.convert.state === 'ok' && overview.convert.items.length > 0 && pluralText(overview.convert.items.length, 'conversion', 'conversions'),
    overview.sources.items.length > 0 && pluralText(overview.sources.items.length, 'source', 'sources'),
  ].filter(Boolean)
  if (sizes.length > 0) lines.push(`${capitalized(sizes.join(', '))}.`)
  const down = (['projets', 'wiki', 'viz', 'tab', 'convert'] as const).filter((app) => overview[app].state === 'down').map(appName)
  if (down.length === 1) lines.push(`${down[0]} n’a pas pu être lu : ses chiffres manquent ici.`)
  else if (down.length > 1) lines.push(`${down.slice(0, -1).join(', ')} et ${down.at(-1)} n’ont pas pu être lus : leurs chiffres manquent ici.`)
  if (lines.length === 0) return 'Rien n’est encore rattaché à cette fiche.'
  return lines.map((line) => `- ${line}`).join('\n')
}

function resolveSources(record: SlideRecord, overview: Overview): SlideLive {
  const live = blank(record)
  const items = overview.sources.items
  // Ni l'emplacement (chemin, adresse d'une base) ni la note d'une source ne sortent de la fiche : sa sorte seulement.
  live.rows = items.slice(0, LISTED).map((source) => row(source.id, source.label, { detail: capitalized(SOURCE_KIND_TEXT[source.kind][0]), url: source.url }))
  live.more = Math.max(0, items.length - LISTED)
  const kinds = SOURCE_KINDS.flatMap((kind) => {
    const n = items.filter((source) => source.kind === kind).length
    return n > 0 ? [pluralText(n, ...SOURCE_KIND_TEXT[kind])] : []
  })
  live.auto_text = items.length > 0 ? `${pluralText(items.length, 'source', 'sources')} : ${kinds.join(', ')}.` : 'Aucune source rattachée pour l’instant.'
  return live
}

// ─── Wiki, Viz, Tab, Convert, Nexus ──────────────────────────────

const recent = (name: string | null, text: string) => (name ? ` ; ${text} : ${quoted(name)}` : '')

function wikiSpec(overview: Overview): PanelSpec<DocItem> {
  return {
    panel: overview.wiki,
    items: overview.wiki.items,
    id: (page) => page.id,
    name: (page) => page.title,
    open: 'Ouvrir Atelier Wiki',
    row: (page) => row(page.id, page.title, { detail: page.excerpt, date: page.updated_at, url: page.url }),
    text: (pages) => `${pluralText(pages.length, 'page', 'pages')}${recent(latest(pages, (page) => page.updated_at)?.title ?? null, 'la plus récente')}.`,
    empty: 'Aucune page rattachée pour l’instant.',
    element: (page) => ({
      url: page.url,
      url_label: 'Ouvrir la page dans Atelier Wiki',
      auto_text:
        page.excerpt?.trim() || `${joined([page.space ? `Page de l’espace ${quoted(page.space)}` : 'Page d’Atelier Wiki', page.updated_at && `modifiée le ${dayText(page.updated_at)}`], ', ')}.`,
    }),
  }
}

function vizSpec(overview: Overview): PanelSpec<ReportItem> {
  return {
    panel: overview.viz,
    items: overview.viz.items,
    id: (report) => report.id,
    name: (report) => report.name,
    open: 'Ouvrir Atelier Viz',
    row: (report) => row(report.id, report.name, { detail: report.detail, date: report.updated_at, url: report.url }),
    text: (reports) => `${pluralText(reports.length, 'rapport', 'rapports')} dans Atelier Viz${recent(latest(reports, (report) => report.updated_at)?.name ?? null, 'le plus récent')}.`,
    empty: 'Aucun rapport rattaché pour l’instant.',
    element: (report) => ({
      url: report.url,
      url_label: 'Ouvrir le rapport dans Atelier Viz',
      auto_text: `${capitalized(joined([report.detail, report.updated_at && `modifié le ${dayText(report.updated_at)}`], ', ') ?? 'Rapport d’Atelier Viz')}.`,
    }),
  }
}

function tabSpec(overview: Overview): PanelSpec<TableItem> {
  const lines = (n: number) => pluralText(n, 'ligne', 'lignes')
  return {
    panel: overview.tab,
    items: overview.tab.items,
    id: (table) => table.id,
    name: (table) => table.name,
    open: 'Ouvrir Atelier Tab',
    // Tab n'a pas d'adresse par table : le lien de la diapositive ouvre l'app.
    row: (table) => row(table.id, table.name, { detail: joined([table.project, table.rows !== null && lines(table.rows)], ' · '), date: table.updated_at }),
    text: (tables) => {
      const counted = tables.filter((table) => table.rows !== null)
      const total = counted.reduce((sum, table) => sum + (table.rows ?? 0), 0)
      return `${pluralText(tables.length, 'table', 'tables')}${counted.length > 0 ? `, ${lines(total)} au total` : ''}.`
    },
    empty: 'Aucune table rattachée pour l’instant.',
    element: (table) => ({
      figures: table.rows !== null ? [figure('Lignes', countText(table.rows))] : [],
      auto_text: `${table.project ? `Table du projet ${quoted(table.project)}` : 'Table d’Atelier Tab'}${table.rows !== null ? ` : ${lines(table.rows)}` : ''}${table.updated_at ? `, modifiée le ${dayText(table.updated_at)}` : ''}.`,
    }),
  }
}

function convertSpec(overview: Overview): PanelSpec<ConversionItem> {
  const lines = (n: number) => pluralText(n, 'ligne', 'lignes')
  const what = (conversion: ConversionItem) => conversion.detected ?? (conversion.rows !== null ? lines(conversion.rows) : null)
  return {
    panel: overview.convert,
    items: overview.convert.items,
    id: (conversion) => conversion.id,
    name: (conversion) => conversion.name,
    open: 'Ouvrir Atelier Convert',
    row: (conversion) =>
      row(conversion.id, conversion.name, {
        detail: joined([what(conversion), conversion.sent_to.length > 0 && `→ ${conversion.sent_to.join(', ')}`], ' · '),
        date: conversion.created_at,
        url: conversion.url,
      }),
    text: (conversions) => {
      const last = latest(conversions, (conversion) => conversion.created_at)
      const tail = last ? ` ; la dernière : ${quoted(last.name)}${last.rows !== null ? `, ${lines(last.rows)}` : ''}` : ''
      return `${pluralText(conversions.length, 'conversion', 'conversions')}${tail}.`
    },
    empty: 'Aucune conversion rattachée pour l’instant.',
    element: (conversion) => {
      const sent = conversion.sent_to.length > 0 ? ` Envoyée vers ${conversion.sent_to.length > 1 ? 'les tables' : 'la table'} ${conversion.sent_to.map((name) => quoted(name)).join(', ')}.` : ''
      return {
        url: conversion.url,
        url_label: 'Ouvrir la conversion dans Atelier Convert',
        figures: conversion.rows !== null ? [figure('Lignes', countText(conversion.rows))] : [],
        auto_text: `${capitalized(joined([what(conversion), conversion.created_at && `convertie le ${dayText(conversion.created_at)}`], ', ') ?? 'Conversion d’Atelier Convert')}.${sent}`,
      }
    },
  }
}

function nexusSpec(overview: Overview): PanelSpec<AgentItem> {
  const reads = (agent: AgentItem) => (agent.reasons.length > 0 ? `Lit ${agent.reasons.join(', ')}` : null)
  return {
    panel: overview.nexus,
    items: overview.nexus.items,
    id: (agent) => agent.name,
    name: (agent) => agent.display_name,
    open: 'Ouvrir Atelier Nexus',
    row: (agent) => row(agent.name, agent.display_name, { detail: reads(agent) ?? (agent.description.trim() || null), url: agent.url }),
    text: (agents) => (agents.length > 1 ? `${countText(agents.length)} agents savent lire les apps de ce projet.` : '1 agent sait lire les apps de ce projet.'),
    empty: overview.nexus.message ?? 'Aucun agent ne lit encore les apps de cette fiche.',
    element: (agent) => {
      const read = reads(agent)
      return {
        url: agent.url,
        url_label: 'Ouvrir l’agent dans Atelier Nexus',
        auto_text: joined([agent.description.trim(), read && `${read}.`], ' ') ?? 'Agent d’Atelier Nexus.',
      }
    },
  }
}

// ─── Résolution ──────────────────────────────────────────────────

/** Partie vivante d'une diapositive, y compris son titre et sa phrase automatiques. */
export function resolveSlide(record: SlideRecord, overview: Overview, presentationTitle: string): SlideLive {
  const projets = { panel: overview.projets, id: (item: WorkItem) => item.id, name: (item: WorkItem) => item.title, open: openProjets(overview) }
  switch (record.kind) {
    case 'title':
      return resolveTitle(record, overview, presentationTitle)
    case 'summary':
      return { ...blank(record), auto_text: summaryText(overview) }
    case 'kpis':
      return resolveKpis(record, overview)
    case 'features':
      return fromPanel(record, { ...projets, items: overview.projets.features, row: featureRow, text: featuresText, empty: 'Aucune feature pour l’instant.' })
    case 'active':
      return fromPanel(record, {
        ...projets,
        items: overview.projets.active,
        row: (item) => row(item.id, item.title, { detail: TYPE_TEXT[item.type] ?? item.type, date: item.due, status: item.status, url: item.url }),
        text: activeText,
        empty: 'Aucun élément en cours.',
      })
    case 'milestones':
      return fromPanel<Milestone>(record, {
        panel: overview.projets,
        items: overview.projets.milestones,
        id: (m) => m.id,
        name: (m) => m.name,
        open: openProjets(overview),
        row: (m) => row(m.id, m.name, { detail: m.reached ? 'atteint' : null, date: m.date }),
        text: milestonesText,
        empty: 'Aucun jalon pour l’instant.',
      })
    case 'wiki':
      return fromPanel(record, wikiSpec(overview))
    case 'viz':
      return fromPanel(record, vizSpec(overview))
    case 'tab':
      return fromPanel(record, tabSpec(overview))
    case 'convert':
      return fromPanel(record, convertSpec(overview))
    case 'nexus':
      return fromPanel(record, nexusSpec(overview))
    case 'sources':
      return resolveSources(record, overview)
    case 'text':
      return { ...blank(record), state: 'none' }
  }
}

/** Présentation résolue : chaque diapositive enregistrée, avec sa partie vivante. */
export function resolveDeck(presentation: PresentationSummary, records: readonly SlideRecord[], overview: Overview): Deck {
  return {
    presentation,
    project: overview.project,
    slides: records.map((record) => ({ ...record, live: resolveSlide(record, overview, presentation.title), stale: [] })),
    generated_at: overview.generated_at,
  }
}
