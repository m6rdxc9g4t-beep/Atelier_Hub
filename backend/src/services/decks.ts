// Présentation d'une fiche, vue de l'interface : création à partir de la fiche.

import type { Db } from '../db/database.js'
import { defaultTitle, TITLE_ONLY } from '../domain/plan.js'
import type { PresentationSummary } from '../domain/types.js'
import type { SuiteContext } from './overview.js'
import { createPresentation, presentationTitle } from './presentations.js'
import { getProject } from './projects.js'

export interface PresentationInput {
  /** Absent ou vide : « <fiche> — <mois année> ». */
  title?: string
  /** Bâtir le plan sur la fiche (défaut) ; false : une présentation vide, sa seule diapositive de titre. */
  plan?: boolean
}

export async function createDeck(db: Db, suite: SuiteContext, projectId: number, input: PresentationInput): Promise<PresentationSummary> {
  const project = getProject(db, projectId)
  const title = presentationTitle(input.title?.trim() || defaultTitle(project.name, suite.today()))
  return createPresentation(db, projectId, title, TITLE_ONLY)
}
