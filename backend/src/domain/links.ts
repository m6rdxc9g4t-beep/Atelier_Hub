// Liens profonds vers les apps de la suite : où le navigateur ouvre un élément.
// Chaque app ouvre l'élément par son adresse (voir README, « Liens profonds ») ; Tab n'a pas d'adresse par table.

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
