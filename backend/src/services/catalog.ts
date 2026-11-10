// « Lier » : ce que chaque app propose de rattacher à une fiche (rattachements et éléments à épingler).

import {
  convertConversions,
  nexusAgents,
  projetsProjects,
  tabTables,
  vizDatasets,
  vizReports,
  wikiSearch,
  wikiSpaces,
} from '../connectors/apps.js'
import { describeFailure } from '../connectors/http.js'
import { normalize } from '../domain/match.js'
import { str } from '../domain/table.js'
import type { AppId, Candidate, Catalog } from '../domain/types.js'
import type { SuiteContext } from './overview.js'

const LIMIT = 60
const APP_NAMES: Record<AppId, string> = {
  projets: 'Atelier Projets',
  wiki: 'Atelier Wiki',
  viz: 'Atelier Viz',
  tab: 'Atelier Tab',
  convert: 'Atelier Convert',
  nexus: 'Atelier Nexus',
}

export const isAppId = (value: string): value is AppId => value in APP_NAMES

const fr = (n: number | null, one: string, many: string) => (n === null ? null : `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`)

function filter(candidates: Candidate[], q: string): Candidate[] {
  const needle = normalize(q)
  const kept = needle ? candidates.filter((c) => normalize(`${c.label} ${c.detail ?? ''}`).includes(needle)) : candidates
  return kept.slice(0, LIMIT)
}

async function candidatesFor(ctx: SuiteContext, app: AppId, q: string): Promise<Candidate[]> {
  const { apps } = ctx.config
  switch (app) {
    case 'projets':
      return (await projetsProjects(ctx.http, apps.projets.api)).map((p) => ({ app, kind: 'project', ref: p.id, label: p.name, detail: p.description, bind: true }))
    case 'wiki': {
      const spaces = (await wikiSpaces(ctx.http, apps.wiki.api)).map<Candidate>((s) => ({
        app,
        kind: 'space',
        ref: s.id,
        label: s.name,
        detail: fr(s.pages, 'page', 'pages'),
        bind: true,
      }))
      if (!q.trim()) return spaces
      const pages = (await wikiSearch(ctx.http, apps.wiki.api, q.trim(), 30)).flatMap<Candidate>((row) => {
        const id = str(row.id)
        const title = str(row.titre)
        return id && title ? [{ app, kind: 'page', ref: id, label: title, detail: str(row.espace), bind: false }] : []
      })
      return [...filter(spaces, q), ...pages]
    }
    case 'viz': {
      const [reports, datasets] = await Promise.all([vizReports(ctx.http, apps.viz.api), vizDatasets(ctx.http, apps.viz.api)])
      return [
        ...reports.map<Candidate>((r) => ({ app, kind: 'report', ref: r.id, label: r.name, detail: ['Rapport', fr(r.pages, 'page', 'pages')].filter(Boolean).join(' · '), bind: false })),
        ...datasets.map<Candidate>((d) => ({ app, kind: 'dataset', ref: d.id, label: d.name, detail: ['Jeu de données', fr(d.rows, 'ligne', 'lignes')].filter(Boolean).join(' · '), bind: false })),
      ]
    }
    case 'tab': {
      const tables = (await tabTables(apps.tab.exportsDir)) ?? []
      const projects = [...new Set(tables.map((t) => t.project).filter((p): p is string => Boolean(p)))].sort((a, b) => a.localeCompare(b, 'fr'))
      return [
        ...projects.map<Candidate>((p) => ({ app, kind: 'project', ref: p, label: p, detail: 'Projet Tab', bind: true })),
        ...tables.map<Candidate>((t) => ({ app, kind: 'table', ref: t.table_id, label: t.name, detail: [t.project, fr(t.rows, 'ligne', 'lignes')].filter(Boolean).join(' · '), bind: false })),
      ]
    }
    case 'convert':
      return (await convertConversions(ctx.http, apps.convert.api)).map((c) => ({ app, kind: 'conversion', ref: c.id, label: c.name, detail: c.detected, bind: false }))
    case 'nexus':
      return (await nexusAgents(ctx.http, apps.nexus.api)).map((a) => ({ app, kind: 'agent', ref: a.name, label: a.display_name, detail: a.category || null, bind: false }))
  }
}

export async function buildCatalog(ctx: SuiteContext, app: AppId, q: string): Promise<Catalog> {
  try {
    const candidates = await candidatesFor(ctx, app, q)
    return { state: 'ok', message: null, candidates: app === 'wiki' && q.trim() ? candidates.slice(0, LIMIT) : filter(candidates, q) }
  } catch (error) {
    return { state: 'down', message: describeFailure(APP_NAMES[app], error), candidates: [] }
  }
}
