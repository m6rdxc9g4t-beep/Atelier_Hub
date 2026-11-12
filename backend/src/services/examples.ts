// « Exemples de la suite » : les histoires d'exemple vivent dans les apps. Le Hub les y lit (lecture seule, en
// parallèle, délai borné), dit où chacune est chargée, et crée sa fiche : une fiche ordinaire, rattachée à ce que les
// apps ont chargé. Retirer l'exemple du Hub = supprimer cette fiche ; rien n'est jamais écrit dans une app.

import { convertConversions, tabTables } from '../connectors/apps.js'
import { convertExamples, nexusExamples, projetsExamples, vizExamples, wikiExamples } from '../connectors/examples.js'
import { describeFailure } from '../connectors/http.js'
import type { Db } from '../db/database.js'
import { assembleExamples, exampleAppName, exampleProjectInput, isCurrent, type AssembledStory, type Read, type SuiteExamples } from '../domain/examples.js'
import type { AppId, ExampleCatalog, HubProject } from '../domain/types.js'
import { ApiError, notFound } from '../http/errors.js'
import type { SuiteContext } from './overview.js'
import { createProject, findExampleProject, updateProject } from './projects.js'

async function read<T>(app: AppId, run: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, message: describeFailure(exampleAppName(app), error) }
  }
}

async function readSuite(ctx: SuiteContext): Promise<SuiteExamples> {
  const { apps } = ctx.config
  const [projets, wiki, viz, convert, nexus, tab] = await Promise.all([
    read('projets', () => projetsExamples(ctx.http, apps.projets.api)),
    read('wiki', () => wikiExamples(ctx.http, apps.wiki.api)),
    read('viz', () => vizExamples(ctx.http, apps.viz.api)),
    read('convert', async () => {
      const [stories, conversions] = await Promise.all([convertExamples(ctx.http, apps.convert.api), convertConversions(ctx.http, apps.convert.api)])
      return { stories, conversions: conversions.map((c) => c.name) }
    }),
    read('nexus', () => nexusExamples(ctx.http, apps.nexus.api)),
    read('tab', () => tabTables(apps.tab.exportsDir)),
  ])
  return { projets, wiki, viz, convert, nexus, tab }
}

type Assembled = { state: 'ok'; stories: AssembledStory[] } | { state: 'down' | 'off'; message: string }

async function assemble(ctx: SuiteContext): Promise<Assembled> {
  const reads = await readSuite(ctx)
  // L'index de Tab ne porte aucune histoire : il faut qu'une app qui les liste réponde.
  if (![reads.projets, reads.wiki, reads.viz, reads.convert, reads.nexus].some((r) => r.ok)) {
    return { state: 'down', message: 'Aucune app de la suite ne répond : les exemples se lisent dans les apps.' }
  }
  const { apps } = ctx.config
  const ui: Record<AppId, string> = { projets: apps.projets.ui, wiki: apps.wiki.ui, viz: apps.viz.ui, convert: apps.convert.ui, nexus: apps.nexus.ui, tab: apps.tab.ui }
  const stories = assembleExamples(reads, ui)
  if (stories.length === 0) return { state: 'off', message: 'Aucun exemple n’est livré avec les apps qui répondent.' }
  return { state: 'ok', stories }
}

export async function buildExamples(db: Db, ctx: SuiteContext): Promise<ExampleCatalog> {
  const result = await assemble(ctx)
  if (result.state !== 'ok') return { state: result.state, message: result.message, stories: [] }
  return {
    state: 'ok',
    message: null,
    stories: result.stories.map(({ story, bindings }) => {
      const project = findExampleProject(db, story.id)
      return { ...story, project: project ? { id: project.id, slug: project.slug, name: project.name, current: isCurrent(project, bindings) } : null }
    }),
  }
}

/**
 * Fiche de l'histoire : créée si elle n'existe pas, sinon remise sur ce que les apps ont chargé depuis (une app où
 * l'histoire n'est pas chargée, ou arrêtée, ne change rien à la fiche). Les apps sont relues ici : aucun identifiant
 * ne vient de la requête.
 */
export async function openExampleProject(db: Db, ctx: SuiteContext, storyId: string): Promise<{ project: HubProject; created: boolean }> {
  const result = await assemble(ctx)
  if (result.state === 'down') throw new ApiError(503, 'SUITE_DOWN', result.message)
  const found = result.state === 'ok' ? result.stories.find((s) => s.story.id === storyId) : undefined
  if (!found) throw notFound('Exemple')
  const existing = findExampleProject(db, storyId)
  if (!existing) return { project: createProject(db, exampleProjectInput(found.story, found.bindings), storyId), created: true }
  return { project: isCurrent(existing, found.bindings) ? existing : updateProject(db, existing.id, found.bindings), created: false }
}
