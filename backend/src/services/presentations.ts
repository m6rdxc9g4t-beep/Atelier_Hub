// Présentations d'une fiche et leurs diapositives. Seul endroit qui écrit dans `presentations` et `slides`.
// Une diapositive garde sa structure (sorte, position, élément visé) et le texte rédigé dans le Hub : jamais un
// chiffre, une ligne ou un nom lu dans une autre app (seuls `ref` / `ref_label` référencent un élément, comme `links`).

import type { Db } from '../db/database.js'
import type { PlannedSlide } from '../domain/plan.js'
import { KIND_INFO } from '../domain/slides.js'
import { SLIDE_KINDS, type PresentationSummary, type SlideKind, type SlideRecord } from '../domain/types.js'
import { conflict, invalid, notFound } from '../http/errors.js'
import { getProject } from './projects.js'

export const LIMITS = { title: 120, slideTitle: 120, body: 600, ref: 200, refLabel: 200, slides: 40 } as const

export interface SlideInput {
  kind: SlideKind
  title?: string | null
  body?: string | null
  ref?: string | null
  ref_label?: string | null
  /** Diapositive après laquelle insérer (null : en tête ; absent : à la fin). */
  after?: number | null
}

export interface SlidePatch {
  title?: string | null
  body?: string | null
}

const now = () => new Date().toISOString()

function clean(value: string | null | undefined, max: number, field: string): string | null {
  if (value === null || value === undefined) return null
  const text = value.trim()
  if (text.length > max) throw invalid(`${field} : ${max} caractères au plus`)
  return text || null
}

/** Titre d'une présentation, nettoyé ; 422 s'il est vide ou trop long. */
export function presentationTitle(value: string): string {
  const title = clean(value, LIMITS.title, 'Titre')
  if (!title) throw invalid('Le titre de la présentation est obligatoire')
  return title
}

const SUMMARY = `SELECT p.id, p.project_id, p.title, (SELECT COUNT(*) FROM slides s WHERE s.presentation_id = p.id) AS slides, p.created_at, p.updated_at
  FROM presentations p`
const SLIDE = 'SELECT id, presentation_id, position, kind, title, body, ref, ref_label, text_source, text_model, text_at, updated_at FROM slides'

/** Présentations d'une fiche, les plus récentes d'abord. */
export function listPresentations(db: Db, projectId: number): PresentationSummary[] {
  getProject(db, projectId)
  return db.prepare(`${SUMMARY} WHERE p.project_id = ? ORDER BY p.updated_at DESC, p.id DESC`).all(projectId) as PresentationSummary[]
}

export function getPresentation(db: Db, id: number): PresentationSummary {
  const presentation = db.prepare(`${SUMMARY} WHERE p.id = ?`).get(id) as PresentationSummary | undefined
  if (!presentation) throw notFound('Présentation')
  return presentation
}

export function listSlides(db: Db, presentationId: number): SlideRecord[] {
  return db.prepare(`${SLIDE} WHERE presentation_id = ? ORDER BY position, id`).all(presentationId) as SlideRecord[]
}

function getSlide(db: Db, presentationId: number, slideId: number): SlideRecord {
  const slide = db.prepare(`${SLIDE} WHERE id = ? AND presentation_id = ?`).get(slideId, presentationId) as SlideRecord | undefined
  if (!slide) throw notFound('Diapositive')
  return slide
}

/** Élément visé par une diapositive : seulement pour une sorte qui en vise un, et toujours avec son libellé. */
function target(kind: SlideKind, ref: string | null | undefined, refLabel: string | null | undefined): { ref: string | null; ref_label: string | null } {
  if (!SLIDE_KINDS.includes(kind)) throw invalid(`Sorte de diapositive inconnue : ${String(kind)}`)
  const cleanRef = clean(ref, LIMITS.ref, 'Référence')
  if (!cleanRef) return { ref: null, ref_label: null }
  if (!KIND_INFO[kind].refKind) throw invalid('Cette sorte de diapositive ne vise pas un élément')
  const label = clean(refLabel, LIMITS.refLabel, 'Libellé')
  if (!label) throw invalid('Le libellé de l’élément visé est obligatoire')
  return { ref: cleanRef, ref_label: label }
}

const full = () => conflict(`Une présentation contient ${LIMITS.slides} diapositives au plus`)

/** Positions denses 0…n-1 dans l'ordre donné, et date de modification de la présentation. À appeler dans une transaction. */
function settle(db: Db, presentationId: number, order: readonly number[], stamp: string): void {
  const move = db.prepare('UPDATE slides SET position = ? WHERE id = ? AND presentation_id = ?')
  order.forEach((id, position) => move.run(position, id, presentationId))
  db.prepare('UPDATE presentations SET updated_at = ? WHERE id = ?').run(stamp, presentationId)
}

const INSERT = `INSERT INTO slides (presentation_id, position, kind, title, body, ref, ref_label, text_source, text_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

/** Crée une présentation et ses diapositives (sans titre ni texte : tout est calculé à la lecture), en une transaction. */
export function createPresentation(db: Db, projectId: number, title: string, slides: readonly PlannedSlide[]): PresentationSummary {
  const name = presentationTitle(title)
  if (slides.length > LIMITS.slides) throw full()
  const planned = slides.map((slide) => ({ kind: slide.kind, ...target(slide.kind, slide.ref, slide.ref_label) }))
  return db.transaction(() => {
    getProject(db, projectId)
    const stamp = now()
    const id = Number(db.prepare('INSERT INTO presentations (project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(projectId, name, stamp, stamp).lastInsertRowid)
    const insert = db.prepare(INSERT)
    planned.forEach((slide, position) => insert.run(id, position, slide.kind, null, null, slide.ref, slide.ref_label, 'auto', null, stamp, stamp))
    return getPresentation(db, id)
  })()
}

export function renamePresentation(db: Db, id: number, title: string): PresentationSummary {
  const name = presentationTitle(title)
  getPresentation(db, id)
  db.prepare('UPDATE presentations SET title = ?, updated_at = ? WHERE id = ?').run(name, now(), id)
  return getPresentation(db, id)
}

export function deletePresentation(db: Db, id: number): void {
  getPresentation(db, id)
  db.prepare('DELETE FROM presentations WHERE id = ?').run(id)
}

/** Ajoute une diapositive après `after` (null : en tête ; absent : à la fin). */
export function addSlide(db: Db, presentationId: number, input: SlideInput): SlideRecord {
  const { ref, ref_label } = target(input.kind, input.ref, input.ref_label)
  const title = clean(input.title, LIMITS.slideTitle, 'Titre')
  const body = clean(input.body, LIMITS.body, 'Texte')
  return db.transaction(() => {
    getPresentation(db, presentationId)
    const order = listSlides(db, presentationId).map((slide) => slide.id)
    if (order.length >= LIMITS.slides) throw full()
    let index = order.length
    if (input.after === null) index = 0
    else if (input.after !== undefined) {
      const at = order.indexOf(input.after)
      if (at < 0) throw notFound('Diapositive')
      index = at + 1
    }
    const stamp = now()
    const id = Number(
      db.prepare(INSERT).run(presentationId, index, input.kind, title, body, ref, ref_label, body ? 'manual' : 'auto', body ? stamp : null, stamp, stamp).lastInsertRowid,
    )
    order.splice(index, 0, id)
    settle(db, presentationId, order, stamp)
    return getSlide(db, presentationId, id)
  })()
}

/**
 * Titre et texte d'une diapositive. Titre vide : titre automatique. Texte vide : phrase automatique (`auto`) ;
 * texte changé : `manual`, daté. Un texte renvoyé tel quel garde sa provenance (changer le titre d'une diapositive
 * rédigée par l'IA n'en fait pas un texte écrit à la main). La sorte et l'élément visé ne changent jamais.
 */
export function updateSlide(db: Db, presentationId: number, slideId: number, patch: SlidePatch): SlideRecord {
  const title = patch.title === undefined ? undefined : clean(patch.title, LIMITS.slideTitle, 'Titre')
  const body = patch.body === undefined ? undefined : clean(patch.body, LIMITS.body, 'Texte')
  return db.transaction(() => {
    const current = getSlide(db, presentationId, slideId)
    const next = { ...current }
    if (title !== undefined) next.title = title
    if (body !== undefined && body !== current.body) {
      next.body = body
      next.text_source = body ? 'manual' : 'auto'
      next.text_model = null
      next.text_at = body ? now() : null
    }
    const stamp = now()
    db.prepare('UPDATE slides SET title = ?, body = ?, text_source = ?, text_model = ?, text_at = ?, updated_at = ? WHERE id = ?').run(
      next.title,
      next.body,
      next.text_source,
      next.text_model,
      next.text_at,
      stamp,
      slideId,
    )
    db.prepare('UPDATE presentations SET updated_at = ? WHERE id = ?').run(stamp, presentationId)
    return getSlide(db, presentationId, slideId)
  })()
}

export function removeSlide(db: Db, presentationId: number, slideId: number): void {
  db.transaction(() => {
    getSlide(db, presentationId, slideId)
    db.prepare('DELETE FROM slides WHERE id = ?').run(slideId)
    settle(db, presentationId, listSlides(db, presentationId).map((slide) => slide.id), now())
  })()
}

/** Nouvel ordre : exactement les diapositives de la présentation, chacune une fois. */
export function reorderSlides(db: Db, presentationId: number, ids: readonly number[]): SlideRecord[] {
  return db.transaction(() => {
    getPresentation(db, presentationId)
    const current = new Set(listSlides(db, presentationId).map((slide) => slide.id))
    const exact = ids.length === current.size && new Set(ids).size === ids.length && ids.every((id) => current.has(id))
    if (!exact) throw invalid('L’ordre doit contenir chaque diapositive une seule fois')
    settle(db, presentationId, ids, now())
    return listSlides(db, presentationId)
  })()
}
