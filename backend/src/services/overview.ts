// Vue d'ensemble d'une fiche : lit chaque app de la suite en parallèle (lecture seule, délai borné) et rapproche
// ce qui concerne le projet : éléments épinglés, rattachements (projet Projets, espace Wiki, projet Tab) et mots-clés.
// Une app arrêtée donne un panneau « down » ; ses éléments épinglés restent affichés (libellé et lien).

import type { HubConfig } from '../config.js'
import {
  convertConversions,
  nexusAgents,
  projetsMilestones,
  projetsProjects,
  projetsWorkItems,
  tabTables,
  vizDatasets,
  vizReports,
  wikiPages,
  wikiSearch,
  type NexusAgent,
  type VizDataset,
} from '../connectors/apps.js'
import { describeFailure, isHttpUrl, type HttpContext } from '../connectors/http.js'
import type { Db } from '../db/database.js'
import { deepLinks } from '../domain/links.js'
import { matchesKeywords, parseKeywords, sameName } from '../domain/match.js'
import { APP_LABELS, rankAgents } from '../domain/relevance.js'
import { activeItems, computeKpis, milestoneFromRow, sortFeatures, workItemFromRow } from '../domain/summary.js'
import { str, type Row } from '../domain/table.js'
import type {
  AgentItem,
  AppId,
  ConversionItem,
  DocItem,
  HubLink,
  HubProject,
  Kpis,
  ListPanel,
  Overview,
  ProjetsPanel,
  ReportItem,
  SourceItem,
  SourceKind,
  TableItem,
  WikiPanel,
} from '../domain/types.js'
import { getProject, listLinks } from './projects.js'

export interface SuiteContext {
  config: HubConfig
  http: HttpContext
  /** Date du jour `AAAA-MM-JJ` (fuseau local), injectable pour les tests. */
  today: () => string
}

export const localToday = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MAX_AGENTS = 8
const MAX_LIST = 50

type Pins = Map<string, HubLink>
function pinsOf(links: readonly HubLink[], app: HubLink['app'], kind: string): Pins {
  return new Map(links.filter((l) => l.app === app && l.kind === kind).map((l) => [l.ref, l] as const))
}

const pinnedFirst = <T extends { pinned: boolean }>(items: T[]): T[] => [...items.filter((i) => i.pinned), ...items.filter((i) => !i.pinned)]

function down<T>(app: string, error: unknown, url: string, fallback: T[]): ListPanel<T> {
  return { state: 'down', message: describeFailure(app, error), url, items: fallback }
}

// ─── Projets ─────────────────────────────────────────────────────

interface ProjetsResult {
  panel: ProjetsPanel
  kpis: Kpis | null
  repoSources: SourceItem[]
}

async function loadProjets(ctx: SuiteContext, project: HubProject): Promise<ProjetsResult> {
  const { api, ui } = ctx.config.apps.projets
  const empty = { features: [], active: [], milestones: [], items_total: 0 }
  if (!project.projets_id) {
    return {
      panel: { state: 'off', message: 'Aucun projet d’Atelier Projets n’est rattaché à cette fiche.', url: `${ui}/`, project_name: null, ...empty },
      kpis: null,
      repoSources: [],
    }
  }
  const pid = project.projets_id
  const projectUrl = deepLinks.projetsProject(ui, pid)
  try {
    const [projects, rows, milestoneRows] = await Promise.all([
      projetsProjects(ctx.http, api),
      projetsWorkItems(ctx.http, api, pid),
      projetsMilestones(ctx.http, api, pid),
    ])
    const info = projects.find((p) => p.id === pid) ?? null
    const items = rows.flatMap((row) => workItemFromRow(row, (id) => deepLinks.projetsItem(ui, pid, id)) ?? [])
    const milestones = milestoneRows.flatMap((row) => milestoneFromRow(row) ?? [])
    const repoSources: SourceItem[] = []
    if (info?.github_url) {
      repoSources.push({ id: `projets-github-${pid}`, kind: 'repo', label: 'Dépôt GitHub', location: info.github_url, url: info.github_url, origin: 'projets', detail: 'Depuis Atelier Projets', link_id: null })
    }
    if (info?.local_repo_path) {
      repoSources.push({ id: `projets-local-${pid}`, kind: 'folder', label: 'Dépôt local', location: info.local_repo_path, url: null, origin: 'projets', detail: 'Depuis Atelier Projets', link_id: null })
    }
    return {
      panel: {
        state: 'ok',
        message: null,
        url: projectUrl,
        project_name: info?.name ?? project.projets_name,
        features: sortFeatures(items),
        active: activeItems(items),
        milestones: [...milestones].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
        items_total: items.length,
      },
      kpis: computeKpis(items, milestones, ctx.today()),
      repoSources,
    }
  } catch (error) {
    return {
      panel: { state: 'down', message: describeFailure('Atelier Projets', error), url: projectUrl, project_name: project.projets_name, ...empty },
      kpis: null,
      repoSources: [],
    }
  }
}

// ─── Wiki ────────────────────────────────────────────────────────

function docFromRow(row: Row, ui: string, pins: Pins): DocItem | null {
  const id = str(row.id)
  const title = str(row.titre)
  if (!id || !title) return null
  const url = str(row.url)
  return {
    id,
    title,
    space: str(row.espace),
    excerpt: str(row.extrait),
    updated_at: str(row.maj_le),
    url: url && isHttpUrl(url) ? url : deepLinks.wikiPage(ui, id),
    pinned: pins.has(id),
  }
}

async function loadWiki(ctx: SuiteContext, project: HubProject, links: readonly HubLink[], keywords: string[]): Promise<WikiPanel> {
  const { api, ui } = ctx.config.apps.wiki
  const pins = pinsOf(links, 'wiki', 'page')
  const pinFallback = (): DocItem[] =>
    [...pins.values()].map((l) => ({ id: l.ref, title: l.label, space: null, excerpt: null, updated_at: null, url: deepLinks.wikiPage(ui, l.ref), pinned: true }))
  const mode: WikiPanel['mode'] = project.wiki_space_id ? 'space' : keywords.length > 0 ? 'search' : 'pins'
  if (mode === 'pins' && pins.size === 0) {
    return { state: 'off', message: 'Rattache un espace du Wiki ou épingle des pages.', url: deepLinks.wikiHome(ui), space: null, mode, items: [] }
  }
  try {
    let rows: Row[] = []
    if (project.wiki_space_id) rows = await wikiPages(ctx.http, api, project.wiki_space_id)
    else if (mode === 'search') rows = await wikiSearch(ctx.http, api, project.keywords.split(',')[0]?.trim() || project.name)
    const docs = rows.flatMap((row) => docFromRow(row, ui, pins) ?? [])
    if (mode === 'space') docs.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    const seen = new Set(docs.map((d) => d.id))
    const items = pinnedFirst([...pinFallback().filter((d) => !seen.has(d.id)), ...docs])
    return { state: 'ok', message: null, url: deepLinks.wikiHome(ui), space: project.wiki_space, mode, items: items.slice(0, MAX_LIST) }
  } catch (error) {
    return { state: 'down', message: describeFailure('Atelier Wiki', error), url: deepLinks.wikiHome(ui), space: project.wiki_space, mode, items: pinFallback() }
  }
}

// ─── Viz (rapports + jeux de données pour les sources) ───────────

interface VizResult {
  panel: ListPanel<ReportItem>
  datasets: SourceItem[]
}

async function loadViz(ctx: SuiteContext, links: readonly HubLink[], keywords: string[]): Promise<VizResult> {
  const { api, ui } = ctx.config.apps.viz
  const reportPins = pinsOf(links, 'viz', 'report')
  const datasetPins = pinsOf(links, 'viz', 'dataset')
  const datasetSource = (d: Pick<VizDataset, 'id' | 'name'> & Partial<VizDataset>): SourceItem => ({
    id: `viz-${d.id}`,
    kind: 'database',
    label: d.name,
    location: `Atelier Viz · jeu « ${d.name} »`,
    url: deepLinks.vizData(ui),
    origin: 'viz',
    detail: d.rows === null || d.rows === undefined ? 'Jeu de données Viz' : `Jeu de données Viz · ${d.rows.toLocaleString('fr-FR')} lignes`,
    link_id: datasetPins.get(d.id)?.id ?? null,
  })
  const fallbackReports = () => [...reportPins.values()].map((l) => ({ id: l.ref, name: l.label, detail: null, updated_at: null, url: deepLinks.vizReport(ui, l.ref), pinned: true }))
  if (reportPins.size === 0 && datasetPins.size === 0 && keywords.length === 0) {
    return { panel: { state: 'off', message: 'Épingle des rapports de Viz.', url: deepLinks.vizHome(ui), items: [] }, datasets: [] }
  }
  try {
    const [reports, datasets] = await Promise.all([vizReports(ctx.http, api), vizDatasets(ctx.http, api).catch(() => [] as VizDataset[])])
    const items = reports
      .filter((r) => reportPins.has(r.id) || matchesKeywords(r.name, keywords))
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
      .map<ReportItem>((r) => ({
        id: r.id,
        name: r.name,
        detail: [r.pages !== null ? `${r.pages} page${r.pages > 1 ? 's' : ''}` : null, r.visuals !== null ? `${r.visuals} visuel${r.visuals > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ') || null,
        updated_at: r.updated_at,
        url: deepLinks.vizReport(ui, r.id),
        pinned: reportPins.has(r.id),
      }))
    const sources = datasets.filter((d) => datasetPins.has(d.id) || matchesKeywords(d.name, keywords)).map(datasetSource)
    return { panel: { state: 'ok', message: null, url: deepLinks.vizHome(ui), items: pinnedFirst(items).slice(0, MAX_LIST) }, datasets: sources }
  } catch (error) {
    const pinnedDatasets = [...datasetPins.values()].map((l) => datasetSource({ id: l.ref, name: l.label }))
    return { panel: down('Atelier Viz', error, deepLinks.vizHome(ui), fallbackReports()), datasets: pinnedDatasets }
  }
}

// ─── Tab ─────────────────────────────────────────────────────────

async function loadTab(ctx: SuiteContext, project: HubProject, links: readonly HubLink[], keywords: string[]): Promise<ListPanel<TableItem>> {
  const { ui, exportsDir } = ctx.config.apps.tab
  const pins = pinsOf(links, 'tab', 'table')
  const fallback = () => [...pins.values()].map((l) => ({ id: l.ref, name: l.label, project: null, rows: null, updated_at: null, url: deepLinks.tabHome(ui), pinned: true }))
  try {
    const tables = await tabTables(exportsDir)
    if (tables === null) {
      return { state: 'off', message: 'Index d’Atelier Tab introuvable sur cette machine (Tab n’a encore rien exporté).', url: deepLinks.tabHome(ui), items: fallback() }
    }
    const items = tables
      .filter((t) => pins.has(t.table_id) || sameName(t.project, project.tab_project) || matchesKeywords(t.project, keywords) || matchesKeywords(t.name, keywords))
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
      .map<TableItem>((t) => ({ id: t.table_id, name: t.name, project: t.project, rows: t.rows, updated_at: t.updated_at, url: deepLinks.tabHome(ui), pinned: pins.has(t.table_id) }))
    return { state: 'ok', message: null, url: deepLinks.tabHome(ui), items: pinnedFirst(items).slice(0, MAX_LIST) }
  } catch (error) {
    return down('Atelier Tab', error, deepLinks.tabHome(ui), fallback())
  }
}

// ─── Convert ─────────────────────────────────────────────────────

async function loadConvert(ctx: SuiteContext, project: HubProject, links: readonly HubLink[], keywords: string[]): Promise<ListPanel<ConversionItem>> {
  const { api, ui } = ctx.config.apps.convert
  const pins = pinsOf(links, 'convert', 'conversion')
  const fallback = () =>
    [...pins.values()].map((l) => ({ id: l.ref, name: l.label, detected: null, rows: null, created_at: null, sent_to: [], url: deepLinks.convertItem(ui, l.ref), pinned: true }))
  try {
    const conversions = await convertConversions(ctx.http, api)
    const items = conversions
      .filter(
        (c) =>
          pins.has(c.id) ||
          c.sent.some((s) => sameName(s.project_name, project.tab_project) || matchesKeywords(s.project_name, keywords)) ||
          matchesKeywords(c.name, keywords) ||
          matchesKeywords(c.filename, keywords),
      )
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .map<ConversionItem>((c) => ({
        id: c.id,
        name: c.name,
        detected: c.detected,
        rows: c.rows,
        created_at: c.created_at,
        sent_to: [...new Set(c.sent.map((s) => s.table_name))],
        url: deepLinks.convertItem(ui, c.id),
        pinned: pins.has(c.id),
      }))
    return { state: 'ok', message: null, url: deepLinks.convertHistory(ui), items: pinnedFirst(items).slice(0, MAX_LIST) }
  } catch (error) {
    return down('Atelier Convert', error, deepLinks.convertHistory(ui), fallback())
  }
}

// ─── Sources ─────────────────────────────────────────────────────

function manualSources(links: readonly HubLink[]): SourceItem[] {
  return links
    .filter((l) => l.app === 'source')
    .map((l) => ({
      id: `link-${l.id}`,
      kind: l.kind as SourceKind,
      label: l.label,
      location: l.ref,
      url: isHttpUrl(l.ref) ? l.ref : null,
      origin: 'manual' as const,
      detail: l.note || null,
      link_id: l.id,
    }))
}

// ─── Nexus ───────────────────────────────────────────────────────

async function loadNexus(ctx: SuiteContext, agentsRequest: Promise<NexusAgent[]>, links: readonly HubLink[], projectApps: (AppId | 'github')[]): Promise<ListPanel<AgentItem>> {
  const { ui } = ctx.config.apps.nexus
  const pins = pinsOf(links, 'nexus', 'agent')
  const pinned = [...pins.values()].sort((a, b) => a.position - b.position).map((l) => l.ref)
  try {
    const agents = await agentsRequest
    const items = rankAgents(agents, projectApps, pinned)
      .slice(0, Math.max(MAX_AGENTS, pinned.length))
      .map<AgentItem>((r) => ({
        name: r.agent.name,
        display_name: r.agent.display_name,
        description: r.agent.description,
        category: r.agent.category,
        reasons: r.reasons.map((app) => APP_LABELS[app]),
        score: r.score,
        local_only: r.agent.local_only,
        url: deepLinks.nexusAgent(ui, r.agent.name),
        pinned: r.pinned,
      }))
    return {
      state: 'ok',
      message: items.length === 0 ? 'Aucun agent ne lit encore les apps de cette fiche.' : null,
      url: deepLinks.nexusHome(ui),
      items,
    }
  } catch (error) {
    const fallback = pinned.map((name) => ({
      name,
      display_name: pins.get(name)!.label,
      description: '',
      category: '',
      reasons: [],
      score: 0,
      local_only: false,
      url: deepLinks.nexusAgent(ui, name),
      pinned: true,
    }))
    return down('Atelier Nexus', error, deepLinks.nexusHome(ui), fallback)
  }
}

// ─── Assemblage ──────────────────────────────────────────────────

export async function buildOverview(db: Db, ctx: SuiteContext, projectId: number): Promise<Overview> {
  const project = getProject(db, projectId)
  const links = listLinks(db, projectId)
  const keywords = parseKeywords(project.name, project.keywords)

  // Les agents se lisent en même temps que le reste ; leur classement attend de savoir quelles apps la fiche touche.
  const agentsRequest = nexusAgents(ctx.http, ctx.config.apps.nexus.api)
  agentsRequest.catch(() => undefined)
  const [projets, wiki, viz, tab, convert] = await Promise.all([
    loadProjets(ctx, project),
    loadWiki(ctx, project, links, keywords),
    loadViz(ctx, links, keywords),
    loadTab(ctx, project, links, keywords),
    loadConvert(ctx, project, links, keywords),
  ])

  const sources = [...manualSources(links), ...projets.repoSources, ...viz.datasets]

  const projectApps: (AppId | 'github')[] = []
  if (projets.panel.state === 'ok' && projets.panel.items_total > 0) projectApps.push('projets')
  if (wiki.items.length > 0) projectApps.push('wiki')
  if (viz.panel.items.length > 0 || viz.datasets.length > 0) projectApps.push('viz')
  if (tab.items.length > 0) projectApps.push('tab')
  if (convert.items.length > 0) projectApps.push('convert')
  if (sources.some((s) => s.kind === 'repo' && /github\.com/i.test(s.location))) projectApps.push('github')

  const nexus = await loadNexus(ctx, agentsRequest, links, projectApps)

  return {
    project,
    links,
    kpis: projets.kpis,
    projets: projets.panel,
    wiki,
    sources: { items: sources },
    tab,
    viz: viz.panel,
    convert,
    nexus,
    generated_at: new Date().toISOString(),
  }
}
