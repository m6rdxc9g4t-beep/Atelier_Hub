// Adresses de l'interface. Règles pures, testées (le DOM et l'historique sont dans `router.ts`).
//   /                                  accueil : la dernière fiche ouverte
//   /projet/<slug>                     une fiche projet
//   /projet/<slug>/presentations       les présentations de la fiche
//   /projet/<slug>/presentation/<id>   une présentation
// En aperçu (page publiée), l'hôte n'accepte qu'un fragment simple : « #<slug> », « #<slug>--p », « #<slug>--p12 ».
// Le fragment reste dans l'alphabet des slugs, et un slug ne contient jamais deux tirets de suite : « -- » sépare
// sans ambiguïté.

export type Route =
  | { name: 'home' }
  | { name: 'project'; slug: string }
  | { name: 'presentations'; slug: string }
  | { name: 'deck'; slug: string; id: number }
  | { name: 'notFound' }

export function parseRoute(path: string): Route {
  let clean: string
  try {
    clean = decodeURIComponent(path).replace(/\/+$/, '') || '/'
  } catch {
    return { name: 'notFound' }
  }
  if (clean === '/') return { name: 'home' }
  const m = /^\/projet\/([a-z0-9-]+)(?:\/(presentations)|\/presentation\/([1-9]\d{0,14}))?$/.exec(clean)
  if (!m) return { name: 'notFound' }
  const slug = m[1]!
  if (m[3]) return { name: 'deck', slug, id: Number(m[3]) }
  if (m[2]) return { name: 'presentations', slug }
  return { name: 'project', slug }
}

export const projectPath = (slug: string) => `/projet/${slug}`
export const presentationsPath = (slug: string) => `/projet/${slug}/presentations`
export const deckPath = (slug: string, id: number) => `/projet/${slug}/presentation/${id}`

/** Aperçu : le fragment d'une adresse (« # » pour l'accueil ou une adresse inconnue). */
export function pathToHash(path: string): string {
  const route = parseRoute(path)
  if (route.name === 'project') return `#${route.slug}`
  if (route.name === 'presentations') return `#${route.slug}--p`
  if (route.name === 'deck') return `#${route.slug}--p${route.id}`
  return '#'
}

/** Aperçu : l'adresse d'un fragment. Un fragment hors de l'alphabet des slugs donne une adresse inconnue. */
export function hashToPath(hash: string): string {
  const fragment = hash.replace(/^#/, '')
  if (!fragment) return '/'
  if (!/^[a-z0-9-]+$/.test(fragment)) return '/introuvable'
  // Glouton : le dernier « --p » sépare (un slug peut finir par un tiret, jamais en contenir deux de suite).
  const m = /^(.+)--p(\d*)$/.exec(fragment)
  if (!m) return projectPath(fragment)
  return m[2] ? deckPath(m[1]!, Number(m[2])) : presentationsPath(m[1]!)
}
