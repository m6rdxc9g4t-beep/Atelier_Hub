// Routeur minimal (History API) ; en aperçu (page publiée), fragment simple (seul accepté par l'hôte).
// Les adresses elles-mêmes sont des règles pures : `routes.ts`.

import { useSyncExternalStore, type MouseEvent } from 'react'

import { hashToPath, parseRoute, pathToHash, type Route } from './routes.ts'

export { deckPath, parseRoute, presentationsPath, projectPath, type Route } from './routes.ts'

const HASH_MODE = import.meta.env.MODE === 'demo'

const toHash = pathToHash
export const href = (path: string) => (HASH_MODE ? toHash(path) : path)

const currentPath = () => (HASH_MODE ? hashToPath(location.hash) : location.pathname)

const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}
window.addEventListener('popstate', emit)
window.addEventListener('hashchange', emit)

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === currentPath()) return
  if (HASH_MODE) {
    const url = toHash(to) === '#' ? location.pathname + location.search : toHash(to)
    if (options.replace) history.replaceState(null, '', url)
    else history.pushState(null, '', url)
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
