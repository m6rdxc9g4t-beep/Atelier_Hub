// Présentation d'une fiche, vue de l'interface : « Générer » (le plan bâti sur la fiche) et la présentation résolue
// (ce qui est enregistré + la partie vivante, relue dans les apps à chaque lecture). Rien de vivant n'est écrit.

import type { Db } from '../db/database.js'
import { buildPlan, defaultTitle, TITLE_ONLY } from '../domain/plan.js'
import { resolveDeck } from '../domain/slides.js'
import type { Deck, PresentationSummary } from '../domain/types.js'
import { buildOverview, type SuiteContext } from './overview.js'
import { createPresentation, getPresentation, listSlides, presentationTitle } from './presentations.js'
import { getProject } from './projects.js'

export interface PresentationInput {
  /** Absent ou vide : « <fiche> — <mois année> ». */
  title?: string
  /** Bâtir le plan sur la fiche (défaut) ; false : une présentation vide, sa seule diapositive de titre. */
  plan?: boolean
}

/** Lit les apps une fois, construit le plan (ou la seule diapositive de titre si `plan` est faux), enregistre. */
export async function createDeck(db: Db, suite: SuiteContext, projectId: number, input: PresentationInput): Promise<PresentationSummary> {
  const project = getProject(db, projectId)
  // Le titre est contrôlé avant de lire la suite : une requête refusée n'interroge aucune app.
  const title = presentationTitle(input.title?.trim() || defaultTitle(project.name, suite.today()))
  const slides = input.plan === false ? TITLE_ONLY : buildPlan(await buildOverview(db, suite, projectId))
  return createPresentation(db, projectId, title, slides)
}

/** Relit les apps et résout chaque diapositive. Une app arrêtée donne des diapositives `down`, jamais une erreur. */
export async function readDeck(db: Db, suite: SuiteContext, presentationId: number): Promise<Deck> {
  const overview = await buildOverview(db, suite, getPresentation(db, presentationId).project_id)
  // Relue après la suite : la présentation a pu changer (ou disparaître) pendant la lecture des apps.
  return resolveDeck(getPresentation(db, presentationId), listSlides(db, presentationId), overview)
}
