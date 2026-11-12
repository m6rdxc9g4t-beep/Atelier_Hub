// Diapositives d'une présentation : catalogue des sortes. Règles pures, testées.

import type { AppId, SlideKind } from './types.js'

export interface KindInfo {
  /** Nom de la sorte dans « Ajouter une diapositive ». */
  label: string
  /** Titre automatique d'une diapositive de liste. */
  defaultTitle: string
  /** App lue (icône, lien « Ouvrir Atelier … »), sinon null. */
  app: AppId | null
  /** Sorte d'élément visable par `ref` (celles de LINK_KINDS : page, report, table, conversion, agent), sinon null. */
  refKind: string | null
  /** Lignes affichées au plus ; le reste est compté dans `more`. */
  listed: number
}

const LISTED = 6

export const KIND_INFO: Readonly<Record<SlideKind, KindInfo>> = {
  title: { label: 'Titre', defaultTitle: 'Titre', app: null, refKind: null, listed: 0 },
  summary: { label: 'Synthèse', defaultTitle: 'Synthèse', app: null, refKind: null, listed: 0 },
  kpis: { label: 'Chiffres clés (Projets)', defaultTitle: 'Chiffres clés', app: 'projets', refKind: null, listed: 0 },
  features: { label: 'Avancement des features (Projets)', defaultTitle: 'Avancement des features', app: 'projets', refKind: null, listed: LISTED },
  active: { label: 'En cours et points de blocage (Projets)', defaultTitle: 'En cours et points de blocage', app: 'projets', refKind: null, listed: LISTED },
  milestones: { label: 'Jalons (Projets)', defaultTitle: 'Jalons', app: 'projets', refKind: null, listed: LISTED },
  wiki: { label: 'Documentation (Wiki)', defaultTitle: 'Documentation', app: 'wiki', refKind: 'page', listed: LISTED },
  viz: { label: 'Rapports (Viz)', defaultTitle: 'Rapports', app: 'viz', refKind: 'report', listed: LISTED },
  tab: { label: 'Tables (Tab)', defaultTitle: 'Tables', app: 'tab', refKind: 'table', listed: LISTED },
  convert: { label: 'Conversions (Convert)', defaultTitle: 'Conversions', app: 'convert', refKind: 'conversion', listed: LISTED },
  nexus: { label: 'Agents (Nexus)', defaultTitle: 'Agents', app: 'nexus', refKind: 'agent', listed: LISTED },
  sources: { label: 'Sources', defaultTitle: 'Sources', app: null, refKind: null, listed: LISTED },
  text: { label: 'Texte libre', defaultTitle: 'Texte', app: null, refKind: null, listed: 0 },
}
