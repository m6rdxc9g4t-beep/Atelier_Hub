// « Exemples de la suite » vus du Hub. Les histoires d'exemple (format `atelier-exemples/1`, générées par
// Atelier_Deploy) vivent dans les apps : le Hub n'en livre aucune et n'en charge aucune. Il lit ce que chaque app en
// dit (`GET /api/exemples-suite`, index de Tab), montre où l'histoire est chargée, et sait à quoi rattacher la fiche
// de l'histoire : seulement ce que les apps ont chargé, par identifiant quand l'app le donne, sinon par mots-clés
// (le titre de l'histoire figure dans le nom de ses jeux Viz, de son rapport et de ses conversions).
// Règles pures : aucune lecture ici (connectors/examples.ts), aucune écriture (services/projects.ts).

import { deepLinks } from './links.js'
import { matchesKeywords, normalize, sameName } from './match.js'
import type { AppId, ExampleApp, ExampleStory, HubProject } from './types.js'

export const EXAMPLE_ID = '^[a-z0-9][a-z0-9-]{0,63}$'

/** Tables d'une histoire dans Tab : identifiants stables `tbl_ex_<histoire>_<n>` (Atelier_Deploy/exemples/README.md). */
export const exampleTablePrefix = (storyId: string) => `tbl_ex_${storyId}_`

export interface StoryInfo {
  id: string
  title: string
  subtitle: string
  sector: string
  summary: string
}

export interface ProjetsStory extends StoryInfo {
  loaded: boolean
  project_id: string | null
  project_name: string | null
}

export interface WikiStory extends StoryInfo {
  loaded: boolean
  space_id: string | null
  space_name: string | null
  /** Page d'entrée de l'exemple (« Parcours de l'exemple »). */
  page_id: string | null
}

export interface VizStory extends StoryInfo {
  loaded: boolean
  datasets: number
}

export interface NexusStory extends StoryInfo {
  workflows: number
}

/** Lecture d'une app : ce qu'elle dit, ou le message de son silence (une app arrêtée ne casse rien). */
export type Read<T> = { ok: true; value: T } | { ok: false; message: string }

export interface SuiteExamples {
  projets: Read<ProjetsStory[]>
  wiki: Read<WikiStory[]>
  viz: Read<VizStory[]>
  /** Convert ne dit pas quelles conversions viennent d'un exemple : ses histoires, et le nom de ses conversions. */
  convert: Read<{ stories: StoryInfo[]; conversions: string[] }>
  nexus: Read<NexusStory[]>
  /** Tables de l'index de Tab ; `null` : pas d'index sur cette machine. */
  tab: Read<{ table_id: string; project: string | null }[] | null>
}

/** Rattachements de la fiche d'une histoire : uniquement ce que les apps ont chargé pour elle. */
export interface ExampleBindings {
  projets_id?: string
  projets_name?: string | null
  wiki_space_id?: string
  wiki_space?: string | null
  tab_project?: string
}

export interface AssembledStory {
  story: Omit<ExampleStory, 'project'>
  bindings: ExampleBindings
}

const NAMES: Record<AppId, string> = { convert: 'Convert', tab: 'Tab', viz: 'Viz', nexus: 'Nexus', projets: 'Projets', wiki: 'Wiki' }
const NOT_DELIVERED = 'Cette histoire n’est pas livrée avec cette app'
// Espaces insécables dans les guillemets : un nom long passe à la ligne sans laisser un guillemet seul.
const count = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

/** Histoires connues d'au moins une app, dans l'ordre de l'index commun (celui de la première app qui répond). */
function storiesOf(reads: SuiteExamples): StoryInfo[] {
  const lists: StoryInfo[][] = []
  for (const read of [reads.convert, reads.viz, reads.nexus, reads.projets, reads.wiki]) {
    if (read.ok) lists.push('stories' in read.value ? read.value.stories : read.value)
  }
  const seen = new Map<string, StoryInfo>()
  for (const list of lists) for (const s of list) if (!seen.has(s.id)) seen.set(s.id, s)
  return [...seen.values()]
}

/** État d'une app qui liste ses histoires : arrêtée, histoire non livrée (rien à y charger), chargée ou non. */
function appState<T extends StoryInfo>(
  app: AppId,
  read: Read<T[]>,
  storyId: string,
  home: string,
  loaded: (story: T) => { detail: string | null; url: string } | null,
): ExampleApp {
  if (!read.ok) return { app, state: 'down', detail: read.message, url: home }
  const story = read.value.find((s) => s.id === storyId)
  if (!story) return { app, state: 'unavailable', detail: NOT_DELIVERED, url: home }
  const found = loaded(story)
  return found ? { app, state: 'loaded', ...found } : { app, state: 'absent', detail: null, url: home }
}

/**
 * Pour chaque histoire : où elle est chargée (une ligne par app, dans l'ordre du parcours) et ce à quoi sa fiche se
 * rattache. `ui` : adresse d'interface de chaque app (liens ouverts par le navigateur).
 */
export function assembleExamples(reads: SuiteExamples, ui: Readonly<Record<AppId, string>>): AssembledStory[] {
  return storiesOf(reads).map((info) => {
    const bindings: ExampleBindings = {}

    let convert: ExampleApp
    if (!reads.convert.ok) convert = { app: 'convert', state: 'down', detail: reads.convert.message, url: deepLinks.convertHome(ui.convert) }
    else if (!reads.convert.value.stories.some((s) => s.id === info.id)) {
      convert = { app: 'convert', state: 'unavailable', detail: NOT_DELIVERED, url: deepLinks.convertHome(ui.convert) }
    } else {
      // Les conversions d'un exemple portent le titre de l'histoire (« Relevé octobre 2026 — Studio Garance »).
      const keyword = [normalize(info.title)].filter(Boolean)
      const converted = reads.convert.value.conversions.filter((name) => matchesKeywords(name, keyword)).length
      convert =
        converted > 0
          ? { app: 'convert', state: 'loaded', detail: count(converted, 'conversion', 'conversions'), url: deepLinks.convertHistory(ui.convert) }
          : { app: 'convert', state: 'absent', detail: null, url: deepLinks.convertHome(ui.convert) }
    }

    let tab: ExampleApp
    if (!reads.tab.ok) tab = { app: 'tab', state: 'down', detail: reads.tab.message, url: deepLinks.tabHome(ui.tab) }
    else {
      const prefix = exampleTablePrefix(info.id)
      const tables = (reads.tab.value ?? []).filter((t) => t.table_id.startsWith(prefix))
      const project = tables.find((t) => t.project)?.project ?? null
      if (tables.length > 0) {
        if (project) bindings.tab_project = project
        tab = {
          app: 'tab',
          state: 'loaded',
          detail: [project ? `Projet «\u00a0${project}\u00a0»` : null, count(tables.length, 'table', 'tables')].filter(Boolean).join(' · '),
          url: deepLinks.tabHome(ui.tab),
        }
      } else {
        tab = { app: 'tab', state: 'absent', detail: reads.tab.value === null ? 'Tab n’a encore rien exporté sur cette machine' : null, url: deepLinks.tabHome(ui.tab) }
      }
    }

    const viz = appState('viz', reads.viz, info.id, deepLinks.vizHome(ui.viz), (s) =>
      s.loaded ? { detail: s.datasets > 0 ? count(s.datasets, 'jeu de données', 'jeux de données') : null, url: deepLinks.vizData(ui.viz) } : null,
    )

    const nexus = appState('nexus', reads.nexus, info.id, deepLinks.nexusHome(ui.nexus), (s) =>
      s.workflows > 0 ? { detail: count(s.workflows, 'workflow', 'workflows'), url: deepLinks.nexusHome(ui.nexus) } : null,
    )

    const projets = appState('projets', reads.projets, info.id, deepLinks.projetsHome(ui.projets), (s) => {
      if (!s.loaded) return null
      if (s.project_id) {
        bindings.projets_id = s.project_id
        bindings.projets_name = s.project_name
      }
      return {
        detail: s.project_name ? `Projet «\u00a0${s.project_name}\u00a0»` : null,
        url: s.project_id ? deepLinks.projetsProject(ui.projets, s.project_id) : deepLinks.projetsHome(ui.projets),
      }
    })

    const wiki = appState('wiki', reads.wiki, info.id, deepLinks.wikiHome(ui.wiki), (s) => {
      if (!s.loaded) return null
      if (s.space_id) {
        bindings.wiki_space_id = s.space_id
        bindings.wiki_space = s.space_name
      }
      return {
        detail: s.space_name ? `Espace «\u00a0${s.space_name}\u00a0»` : null,
        url: s.page_id ? deepLinks.wikiPage(ui.wiki, s.page_id) : deepLinks.wikiHome(ui.wiki),
      }
    })

    return { story: { ...info, apps: [convert, tab, viz, nexus, projets, wiki] }, bindings }
  })
}

/** La fiche est-elle rattachée à tout ce que les apps ont chargé pour son histoire ? */
export function isCurrent(project: Pick<HubProject, 'projets_id' | 'wiki_space_id' | 'tab_project'>, bindings: ExampleBindings): boolean {
  if (bindings.projets_id !== undefined && project.projets_id !== bindings.projets_id) return false
  if (bindings.wiki_space_id !== undefined && project.wiki_space_id !== bindings.wiki_space_id) return false
  if (bindings.tab_project !== undefined && !sameName(project.tab_project, bindings.tab_project)) return false
  return true
}

/**
 * Fiche d'une histoire : son titre pour nom et pour mot-clé (les jeux Viz, le rapport et les conversions de
 * l'exemple le portent dans leur nom), et les rattachements de ce que les apps ont chargé.
 */
export function exampleProjectInput(story: StoryInfo, bindings: ExampleBindings) {
  return {
    name: story.title.slice(0, 120),
    description: `${story.summary} Exemple de la suite Atelier (données fictives).`.trim().slice(0, 2000),
    keywords: story.title.slice(0, 500),
    ...bindings,
  }
}

export const exampleAppName = (app: AppId) => `Atelier ${NAMES[app]}`
