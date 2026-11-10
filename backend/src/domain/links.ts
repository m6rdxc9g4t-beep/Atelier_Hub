// Liens profonds vers les apps de la suite : où le navigateur ouvre un élément.
// Wiki, Viz et Convert savent déjà ouvrir un élément par son adresse ; Projets, Nexus et Tab ouvrent leur accueil
// tant qu'ils ne lisent pas les paramètres `?projet=…&element=…` et `?agent=…` (voir README, « Liens profonds »).

const enc = encodeURIComponent

export const deepLinks = {
  projetsProject: (ui: string, projectId: string) => `${ui}/?projet=${enc(projectId)}`,
  projetsItem: (ui: string, projectId: string, itemId: string) => `${ui}/?projet=${enc(projectId)}&element=${enc(itemId)}`,
  wikiHome: (ui: string) => `${ui}/`,
  wikiPage: (ui: string, pageId: string) => `${ui}/p/${enc(pageId)}`,
  vizHome: (ui: string) => `${ui}/#/`,
  vizReport: (ui: string, reportId: string) => `${ui}/#/rapports/${enc(reportId)}`,
  vizData: (ui: string) => `${ui}/#/donnees`,
  convertHistory: (ui: string) => `${ui}/#/historique`,
  convertItem: (ui: string, conversionId: string) => `${ui}/#/conversions/${enc(conversionId)}`,
  tabHome: (ui: string) => `${ui}/`,
  nexusHome: (ui: string) => `${ui}/`,
  nexusAgent: (ui: string, agent: string) => `${ui}/?agent=${enc(agent)}`,
} as const
