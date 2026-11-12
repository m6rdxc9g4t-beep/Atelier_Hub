// Lecteurs des apps de la suite, en lecture seule. Chaque fonction rend des données brutes validées ;
// le rapprochement avec une fiche se fait dans services/overview.ts.
// Sources : nœuds `atelier-node/1` (docs/SUITE.md §7) quand ils existent, sinon la route de liste de l'app.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { num, readAtelierTable, str, type Row } from '../domain/table.js'
import { AppUnavailable, requestJson, type HttpContext } from './http.js'

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function list(value: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new AppUnavailable('error', `réponse inattendue (${what})`)
  return value.filter(isRecord)
}

const enc = encodeURIComponent

// ─── Atelier Projets ─────────────────────────────────────────────

export interface ProjetsProject {
  id: string
  name: string
  description: string | null
  github_url: string | null
  local_repo_path: string | null
}

export async function projetsProjects(ctx: HttpContext, api: string): Promise<ProjetsProject[]> {
  return list(await requestJson(ctx, `${api}/api/atelier/projects`), 'projets').flatMap((p) => {
    const id = str(p.id)
    const name = str(p.name)
    if (!id || !name) return []
    const github = isRecord(p.github) ? str(p.github.url) : null
    return [{ id, name, description: str(p.description), github_url: github, local_repo_path: str(p.local_repo_path) }]
  })
}

export async function projetsWorkItems(ctx: HttpContext, api: string, projectId: string): Promise<Row[]> {
  return readAtelierTable(await requestJson(ctx, `${api}/api/atelier/projects/${enc(projectId)}/work-items`)).rows
}

export async function projetsMilestones(ctx: HttpContext, api: string, projectId: string): Promise<Row[]> {
  return readAtelierTable(await requestJson(ctx, `${api}/api/atelier/projects/${enc(projectId)}/milestones`)).rows
}

// ─── Atelier Wiki ────────────────────────────────────────────────

export interface WikiSpace {
  id: string
  name: string
  pages: number | null
}

export async function wikiSpaces(ctx: HttpContext, api: string): Promise<WikiSpace[]> {
  return readAtelierTable(await requestJson(ctx, `${api}/api/atelier/spaces`)).rows.flatMap((r) => {
    const id = str(r.id)
    const name = str(r.nom)
    return id && name ? [{ id, name, pages: num(r.pages) }] : []
  })
}

export async function wikiPages(ctx: HttpContext, api: string, spaceId: string, limit = 200): Promise<Row[]> {
  return readAtelierTable(await requestJson(ctx, `${api}/api/atelier/pages?space_id=${enc(spaceId)}&limit=${limit}`)).rows
}

export async function wikiSearch(ctx: HttpContext, api: string, query: string, limit = 20): Promise<Row[]> {
  return readAtelierTable(await requestJson(ctx, `${api}/api/atelier/search`, { method: 'POST', body: { query, limit } })).rows
}

// ─── Atelier Viz ─────────────────────────────────────────────────

export interface VizReport {
  id: string
  name: string
  pages: number | null
  visuals: number | null
  updated_at: string | null
}

export interface VizDataset {
  id: string
  name: string
  rows: number | null
  format: string | null
  created_at: string | null
}

export async function vizReports(ctx: HttpContext, api: string): Promise<VizReport[]> {
  return list(await requestJson(ctx, `${api}/api/reports`), 'rapports').flatMap((r) => {
    const id = str(r.id)
    const name = str(r.name)
    return id && name ? [{ id, name, pages: num(r.pages), visuals: num(r.visuals), updated_at: str(r.updated_at) }] : []
  })
}

export async function vizDatasets(ctx: HttpContext, api: string): Promise<VizDataset[]> {
  return list(await requestJson(ctx, `${api}/api/datasets`), 'jeux de données').flatMap((d) => {
    const id = str(d.id)
    const name = str(d.name)
    return id && name ? [{ id, name, rows: num(d.rows), format: str(d.format), created_at: str(d.created_at) }] : []
  })
}

// ─── Atelier Convert ─────────────────────────────────────────────

export interface ConvertConversion {
  id: string
  name: string
  filename: string | null
  detected: string | null
  rows: number | null
  created_at: string | null
  sent: { table_name: string; project_name: string }[]
}

export async function convertConversions(ctx: HttpContext, api: string): Promise<ConvertConversion[]> {
  return list(await requestJson(ctx, `${api}/api/conversions`), 'conversions').flatMap((c) => {
    const id = str(c.id)
    const name = str(c.name)
    if (!id || !name) return []
    const sent = (Array.isArray(c.sent) ? c.sent : []).filter(isRecord).flatMap((s) => {
      const table = str(s.table_name)
      const project = str(s.project_name)
      return table && project ? [{ table_name: table, project_name: project }] : []
    })
    const filename = isRecord(c.source) ? str(c.source.filename) : null
    return [{ id, name, filename, detected: str(c.detected), rows: num(c.rows), created_at: str(c.created_at), sent }]
  })
}

// ─── Atelier Nexus ───────────────────────────────────────────────

export interface NexusAgent {
  name: string
  display_name: string
  description: string
  category: string
  toolsets: string[]
  local_only: boolean
}

export async function nexusAgents(ctx: HttpContext, api: string): Promise<NexusAgent[]> {
  return list(await requestJson(ctx, `${api}/api/agents`), 'agents').flatMap((a) => {
    const name = str(a.name)
    if (!name) return []
    return [
      {
        name,
        display_name: str(a.display_name) ?? name,
        description: str(a.description) ?? '',
        category: str(a.category) ?? '',
        toolsets: Array.isArray(a.toolsets) ? a.toolsets.filter((t): t is string => typeof t === 'string') : [],
        local_only: a.local_only === true,
      },
    ]
  })
}

// ─── Atelier Tab (fichier d'index, §7.3) ──────────────────────────

export interface TabTable {
  table_id: string
  name: string
  project: string | null
  workspace: string | null
  rows: number | null
  updated_at: string | null
}

/** Tables de l'index de Tab ; `null` si l'index n'existe pas (Tab jamais ouvert sur cette machine). */
export async function tabTables(exportsDir: string): Promise<TabTable[] | null> {
  let text: string
  try {
    text = await readFile(join(exportsDir, '_atelier', 'index.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new AppUnavailable('error', 'index illisible')
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new AppUnavailable('error', 'index illisible')
  }
  if (!isRecord(data) || !Array.isArray(data.tables)) throw new AppUnavailable('error', 'index inattendu')
  return data.tables.filter(isRecord).flatMap((t) => {
    const id = str(t.table_id)
    const name = str(t.name)
    return id && name ? [{ table_id: id, name, project: str(t.project), workspace: str(t.workspace), rows: num(t.rows), updated_at: str(t.updated_at) }] : []
  })
}
