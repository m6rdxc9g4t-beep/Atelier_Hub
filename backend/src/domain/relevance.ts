// Agents d'Atelier Nexus pertinents pour une fiche : un agent compte quand ses boîtes à outils lisent une app
// où la fiche a des éléments (Nexus, docs/agents.md §2). Les agents épinglés passent devant.

import type { AppId } from './types.js'

/** Boîte à outils de Nexus → app de la suite qu'elle lit ou modifie. `github` : le dépôt du projet. */
export const TOOLSET_APPS: Readonly<Record<string, AppId | 'github'>> = {
  data_via: 'viz',
  projets_read: 'projets',
  projets_write: 'projets',
  tab: 'tab',
  tab_write: 'tab',
  tab_projets: 'tab',
  github_read: 'github',
  github_write: 'github',
}

/** Agents sans boîte propre à une app mais faits pour elle (rédaction pour le Wiki, tables pour Convert). */
export const AGENT_AFFINITY: Readonly<Record<string, readonly (AppId | 'github')[]>> = {
  redacteur: ['wiki'],
  tableur: ['convert'],
  data_analyst: ['convert'],
}

export const APP_LABELS: Readonly<Record<AppId | 'github', string>> = {
  projets: 'Projets',
  wiki: 'Wiki',
  viz: 'Viz',
  tab: 'Tab',
  convert: 'Convert',
  nexus: 'Nexus',
  github: 'GitHub',
}

export interface AgentLike {
  name: string
  toolsets: readonly string[]
}

/** Apps de la fiche que l'agent couvre, dans l'ordre de la fiche. */
export function agentReasons(agent: AgentLike, projectApps: readonly (AppId | 'github')[]): (AppId | 'github')[] {
  const covered = new Set<AppId | 'github'>()
  for (const toolset of agent.toolsets) {
    const app = TOOLSET_APPS[toolset]
    if (app) covered.add(app)
  }
  for (const app of AGENT_AFFINITY[agent.name] ?? []) covered.add(app)
  return projectApps.filter((app) => covered.has(app))
}

export interface Ranked<T> {
  agent: T
  reasons: (AppId | 'github')[]
  score: number
  pinned: boolean
}

/**
 * Classement : épinglés d'abord (dans l'ordre d'épinglage), puis par nombre d'apps couvertes ; à égalité, l'agent
 * qui a le moins de boîtes (le plus spécialisé) passe devant. Un agent qui ne couvre rien n'est pas proposé.
 */
export function rankAgents<T extends AgentLike>(agents: readonly T[], projectApps: readonly (AppId | 'github')[], pinned: readonly string[]): Ranked<T>[] {
  const pinIndex = new Map(pinned.map((name, index) => [name, index] as const))
  const ranked = agents.map((agent) => {
    const reasons = agentReasons(agent, projectApps)
    return { agent, reasons, score: reasons.length, pinned: pinIndex.has(agent.name) }
  })
  return ranked
    .filter((r) => r.pinned || r.score > 0)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.pinned && b.pinned) return pinIndex.get(a.agent.name)! - pinIndex.get(b.agent.name)!
      return b.score - a.score || a.agent.toolsets.length - b.agent.toolsets.length || a.agent.name.localeCompare(b.agent.name)
    })
}
