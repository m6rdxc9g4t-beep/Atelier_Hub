// Fiches projet du Hub et éléments rattachés (épinglés). Seul endroit qui écrit dans `projects` et `links`.

import type { Db } from '../db/database.js'
import { slugify } from '../domain/match.js'
import { SOURCE_KINDS, type HubLink, type HubProject, type LinkApp } from '../domain/types.js'
import { conflict, invalid, notFound } from '../http/errors.js'

export interface ProjectInput {
  name?: string
  description?: string
  keywords?: string
  projets_id?: string | null
  projets_name?: string | null
  wiki_space_id?: string | null
  wiki_space?: string | null
  tab_project?: string | null
}

export interface LinkInput {
  app: LinkApp
  kind: string
  ref: string
  label: string
  note?: string
}

/** Sortes d'éléments épinglables par app (les rattachements « projet / espace » passent par la fiche). */
export const LINK_KINDS: Readonly<Record<LinkApp, readonly string[]>> = {
  projets: [],
  wiki: ['page'],
  viz: ['report', 'dataset'],
  tab: ['table'],
  convert: ['conversion'],
  nexus: ['agent'],
  source: SOURCE_KINDS,
}

const now = () => new Date().toISOString()

function clean(value: string | null | undefined, max: number, field: string): string | null {
  if (value === null || value === undefined) return null
  const text = value.trim()
  if (text.length > max) throw invalid(`${field} : ${max} caractères au plus`)
  return text || null
}

export function listProjects(db: Db): HubProject[] {
  return db.prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE, id').all() as HubProject[]
}

export function getProject(db: Db, id: number): HubProject {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as HubProject | undefined
  if (!project) throw notFound('Fiche projet')
  return project
}

function freeSlug(db: Db, name: string, exceptId: number | null): string {
  const base = slugify(name)
  const taken = (slug: string) => {
    const row = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug) as { id: number } | undefined
    return row !== undefined && row.id !== exceptId
  }
  let slug = base
  for (let i = 2; taken(slug); i++) slug = `${base}-${i}`
  return slug
}

export function createProject(db: Db, input: ProjectInput): HubProject {
  const name = clean(input.name, 120, 'Nom')
  if (!name) throw invalid('Le nom de la fiche est obligatoire')
  const stamp = now()
  const info = db
    .prepare(
      `INSERT INTO projects (slug, name, description, keywords, projets_id, projets_name, wiki_space_id, wiki_space, tab_project, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      freeSlug(db, name, null),
      name,
      clean(input.description, 2000, 'Description') ?? '',
      clean(input.keywords, 500, 'Mots-clés') ?? '',
      clean(input.projets_id, 80, 'Projet') ,
      clean(input.projets_name, 200, 'Projet'),
      clean(input.wiki_space_id, 80, 'Espace'),
      clean(input.wiki_space, 200, 'Espace'),
      clean(input.tab_project, 200, 'Projet Tab'),
      stamp,
      stamp,
    )
  return getProject(db, Number(info.lastInsertRowid))
}

export function updateProject(db: Db, id: number, input: ProjectInput): HubProject {
  const current = getProject(db, id)
  const next = { ...current }
  if (input.name !== undefined) {
    const name = clean(input.name, 120, 'Nom')
    if (!name) throw invalid('Le nom de la fiche est obligatoire')
    if (name !== current.name) next.slug = freeSlug(db, name, id)
    next.name = name
  }
  if (input.description !== undefined) next.description = clean(input.description, 2000, 'Description') ?? ''
  if (input.keywords !== undefined) next.keywords = clean(input.keywords, 500, 'Mots-clés') ?? ''
  if (input.projets_id !== undefined) {
    next.projets_id = clean(input.projets_id, 80, 'Projet')
    next.projets_name = next.projets_id ? clean(input.projets_name, 200, 'Projet') : null
  }
  if (input.wiki_space_id !== undefined) {
    next.wiki_space_id = clean(input.wiki_space_id, 80, 'Espace')
    next.wiki_space = next.wiki_space_id ? clean(input.wiki_space, 200, 'Espace') : null
  }
  if (input.tab_project !== undefined) next.tab_project = clean(input.tab_project, 200, 'Projet Tab')
  db.prepare(
    `UPDATE projects SET slug = ?, name = ?, description = ?, keywords = ?, projets_id = ?, projets_name = ?,
       wiki_space_id = ?, wiki_space = ?, tab_project = ?, updated_at = ? WHERE id = ?`,
  ).run(next.slug, next.name, next.description, next.keywords, next.projets_id, next.projets_name, next.wiki_space_id, next.wiki_space, next.tab_project, now(), id)
  return getProject(db, id)
}

export function deleteProject(db: Db, id: number): void {
  getProject(db, id)
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function listLinks(db: Db, projectId: number): HubLink[] {
  return db.prepare('SELECT id, app, kind, ref, label, note, position FROM links WHERE project_id = ? ORDER BY app, position, id').all(projectId) as HubLink[]
}

export function addLink(db: Db, projectId: number, input: LinkInput): HubLink {
  getProject(db, projectId)
  const kinds = LINK_KINDS[input.app]
  if (!kinds) throw invalid(`App inconnue : ${String(input.app)}`)
  if (!kinds.includes(input.kind)) throw invalid(`Sorte d'élément inconnue pour ${input.app} : ${input.kind}`)
  const ref = clean(input.ref, 1000, 'Référence')
  const label = clean(input.label, 200, 'Libellé')
  if (!ref) throw invalid('La référence (identifiant, chemin ou adresse) est obligatoire')
  if (!label) throw invalid('Le libellé est obligatoire')
  const exists = db.prepare('SELECT id FROM links WHERE project_id = ? AND app = ? AND kind = ? AND ref = ?').get(projectId, input.app, input.kind, ref)
  if (exists) throw conflict('Cet élément est déjà rattaché à la fiche')
  const position = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM links WHERE project_id = ? AND app = ?').get(projectId, input.app) as { next: number }).next
  const info = db
    .prepare('INSERT INTO links (project_id, app, kind, ref, label, note, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(projectId, input.app, input.kind, ref, label, clean(input.note, 500, 'Note') ?? '', position, now())
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
  return db.prepare('SELECT id, app, kind, ref, label, note, position FROM links WHERE id = ?').get(Number(info.lastInsertRowid)) as HubLink
}

export function removeLink(db: Db, projectId: number, linkId: number): void {
  const info = db.prepare('DELETE FROM links WHERE id = ? AND project_id = ?').run(linkId, projectId)
  if (info.changes === 0) throw notFound('Élément rattaché')
}
