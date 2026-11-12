// « Exemples de la suite » : ce que chaque app dit de ses histoires d'exemple (`GET /api/exemples-suite`, format
// `atelier-exemples/1`). Lecture seule : le Hub ne charge ni ne retire jamais un exemple dans une app.
// Chaque app répond à sa façon ; seuls les champs lus ici comptent (les autres sont ignorés).
//   Projets  [{ id, titre, …, projet, charge, projectId }]
//   Wiki     [{ id, titre, …, espace, charge, spaceId, pageId }]
//   Viz      [{ id, titre, …, jeux: [nom], charge }]            (ni identifiant de jeu, ni identifiant de rapport)
//   Convert  [{ id, titre, …, fichiers: […] }]                  (aucun état : voir domain/examples.ts)
//   Nexus    { histoires: [{ id, titre, …, workflows: [{ id, title }] }] }

import type { NexusStory, ProjetsStory, StoryInfo, VizStory, WikiStory } from '../domain/examples.js'
import { str } from '../domain/table.js'
import { isRecord, list } from './apps.js'
import { requestJson, type HttpContext } from './http.js'

const ROUTE = '/api/exemples-suite'

function info(h: Record<string, unknown>): StoryInfo | null {
  const id = str(h.id)
  const title = str(h.titre)
  if (!id || !title) return null
  return { id, title, subtitle: str(h.sous_titre) ?? '', sector: str(h.secteur) ?? '', summary: str(h.resume) ?? '' }
}

async function stories<T>(ctx: HttpContext, api: string, read: (h: Record<string, unknown>, story: StoryInfo) => T, unwrap = (body: unknown) => body): Promise<T[]> {
  return list(unwrap(await requestJson(ctx, `${api}${ROUTE}`)), 'exemples').flatMap((h) => {
    const story = info(h)
    return story ? [read(h, story)] : []
  })
}

export const projetsExamples = (ctx: HttpContext, api: string): Promise<ProjetsStory[]> =>
  stories(ctx, api, (h, story) => ({ ...story, loaded: h.charge === true, project_id: str(h.projectId), project_name: str(h.projet) }))

export const wikiExamples = (ctx: HttpContext, api: string): Promise<WikiStory[]> =>
  stories(ctx, api, (h, story) => ({ ...story, loaded: h.charge === true, space_id: str(h.spaceId), space_name: str(h.espace), page_id: str(h.pageId) }))

export const vizExamples = (ctx: HttpContext, api: string): Promise<VizStory[]> =>
  stories(ctx, api, (h, story) => ({ ...story, loaded: h.charge === true, datasets: Array.isArray(h.jeux) ? h.jeux.length : 0 }))

export const convertExamples = (ctx: HttpContext, api: string): Promise<StoryInfo[]> => stories(ctx, api, (_h, story) => story)

export const nexusExamples = (ctx: HttpContext, api: string): Promise<NexusStory[]> =>
  stories(
    ctx,
    api,
    (h, story) => ({ ...story, workflows: Array.isArray(h.workflows) ? h.workflows.length : 0 }),
    (body) => (isRecord(body) ? body.histoires : body),
  )
