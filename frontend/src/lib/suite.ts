// Suite Atelier (docs/SUITE.md §3 d'Atelier Projets) : applications du sélecteur et leur état « en marche / arrêtée ».
// Adresses surchargeables à la compilation (VITE_ATELIER_*_URL) : sur le VPS, ce sont les sous-domaines de la suite.
// Les liens profonds d'une fiche viennent du backend (réglages *_URL), pas d'ici.

export type SuiteAppId = 'hub' | 'nexus' | 'viz' | 'tab' | 'projets' | 'wiki' | 'convert'

export interface SuiteApp {
  id: SuiteAppId
  name: string
  short: string
  description: string
  url: string
  healthUrl: string | null
}

export const CURRENT_APP: SuiteAppId = 'hub'
export const HEALTH_TIMEOUT_MS = 1500

const env = import.meta.env as Record<string, string | undefined>
const urlFrom = (variable: string, fallback: string) => (env[variable]?.trim() || fallback).replace(/\/+$/, '')

const NEXUS = urlFrom('VITE_ATELIER_NEXUS_URL', 'http://127.0.0.1:3100')
const VIZ = urlFrom('VITE_ATELIER_VIZ_URL', 'http://127.0.0.1:8000')
const TAB = urlFrom('VITE_ATELIER_TAB_URL', 'http://127.0.0.1:4175')
const PROJETS = urlFrom('VITE_ATELIER_PROJETS_URL', 'http://127.0.0.1:4174')
const WIKI = urlFrom('VITE_ATELIER_WIKI_URL', 'http://127.0.0.1:3200')
const CONVERT = urlFrom('VITE_ATELIER_CONVERT_URL', 'http://127.0.0.1:8010')
/** Portail de la suite (VPS) : vide en local. */
export const PORTAL_URL = urlFrom('VITE_ATELIER_PORTAL_URL', '')

export const SUITE_APPS: readonly SuiteApp[] = [
  { id: 'hub', name: 'Atelier Hub', short: 'Hub', description: 'Tout ce que la suite sait d’un projet', url: '/', healthUrl: null },
  { id: 'projets', name: 'Atelier Projets', short: 'Projets', description: 'Projets agiles, jalons, temps passé', url: PROJETS, healthUrl: `${PROJETS}/api/health` },
  { id: 'wiki', name: 'Atelier Wiki', short: 'Wiki', description: 'Pages, procédures et notes de la suite', url: WIKI, healthUrl: `${WIKI}/api/health` },
  { id: 'tab', name: 'Atelier Tab', short: 'Tab', description: 'Tableur et base typée', url: TAB, healthUrl: `${TAB}/api/health` },
  { id: 'viz', name: 'Atelier Viz', short: 'Viz', description: 'Jeux de données, rapports, alertes', url: VIZ, healthUrl: `${VIZ}/api/health` },
  { id: 'convert', name: 'Atelier Convert', short: 'Convert', description: 'Fichiers et relevés en tables pour Tab', url: CONVERT, healthUrl: `${CONVERT}/api/health` },
  { id: 'nexus', name: 'Atelier Nexus', short: 'Nexus', description: 'Workflows et agents IA', url: NEXUS, healthUrl: `${NEXUS}/api/health` },
]

export const appName = (id: SuiteAppId) => SUITE_APPS.find((a) => a.id === id)?.name ?? id

/** « En marche » si la route de santé répond (réponse opaque acceptée : mode no-cors). */
export async function checkHealth(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
