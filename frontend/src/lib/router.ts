// Routeur minimal (History API) ; en aperçu (fichier autonome), adresses par fragment « #/… ».
//   /                 accueil : liste des fiches
//   /projet/<slug>    une fiche projet

import { useSyncExternalStore, type MouseEvent } from 'react'

export type Route = { name: 'home' } | { name: 'project'; slug: string } | { name: 'notFound' }

const HASH_MODE = import.meta.env.MODE === 'demo'

export function parseRoute(path: string): Route {
  const clean = decodeURIComponent(path).replace(/\/+$/, '') || '/'
  if (clean === '/') return { name: 'home' }
  const m = /^\/projet\/([a-z0-9-]+)$/.exec(clean)
  if (m) return { name: 'project', slug: m[1]! }
  return { name: 'notFound' }
}

export const projectPath = (slug: string) => `/projet/${slug}`
export const href = (path: string) => (HASH_MODE ? `#${path}` : path)

const currentPath = () => (HASH_MODE ? location.hash.replace(/^#/, '') || '/' : location.pathname)

const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}
window.addEventListener('popstate', emit)
window.addEventListener('hashchange', emit)

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === currentPath()) return
  if (HASH_MODE) {
    if (options.replace) history.replaceState(null, '', `#${to}`)
    else history.pushState(null, '', `#${to}`)
  } else if (options.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.scrollTo(0, 0)
  emit()
}

export function useRoute(): Route {
  const path = useSyncExternalStore((cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, currentPath)
  return parseRoute(path)
}

/** Clic sur un lien interne : navigation sans recharger (sauf ⌘/Ctrl/milieu → nouvel onglet). */
export function onLinkClick(event: MouseEvent<HTMLAnchorElement>, to: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(to)
}
