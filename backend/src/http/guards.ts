// Gardes de toutes les requêtes (mêmes règles qu'Atelier Wiki) :
// - Host : adresses de bouclage ou hôtes déclarés (ALLOWED_HOSTS) — protège du DNS rebinding ;
// - Origin, pour toute écriture : absente, de bouclage, ou d'un hôte déclaré. L'origine « null » est refusée.
// La connexion elle-même est vérifiée en amont par le portail de la suite (Caddy forward_auth).

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function hostname(hostHeader: string | undefined): string {
  const value = (hostHeader ?? '').trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  return value.split(':')[0] ?? ''
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host) || host.endsWith('.localhost')
}

export function isAllowedHost(hostHeader: string | undefined, allowed: readonly string[]): boolean {
  const host = hostname(hostHeader)
  return host !== '' && (isLoopbackHost(host) || allowed.includes(host))
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  if (origin === undefined) return true
  if (origin === 'null') return false
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return isLoopbackHost(host) || isLoopbackHost(`[${host}]`) || allowed.includes(host)
  } catch {
    return false
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const isWrite = (method: string) => !SAFE_METHODS.has(method.toUpperCase())
