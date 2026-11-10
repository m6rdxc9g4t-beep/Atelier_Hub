// Lecture des autres apps de la suite : JSON, délai borné, jamais d'exception non typée.
// Une app arrêtée ou en erreur devient un panneau « down » ; elle ne casse jamais la fiche.

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export class AppUnavailable extends Error {
  constructor(
    readonly reason: 'down' | 'error',
    message: string,
  ) {
    super(message)
    this.name = 'AppUnavailable'
  }
}

export interface HttpContext {
  fetch: Fetcher
  timeoutMs: number
}

export async function requestJson(ctx: HttpContext, url: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs)
  let response: Response
  try {
    response = await ctx.fetch(url, {
      method: init.method ?? 'GET',
      headers: { accept: 'application/json', ...(init.body !== undefined && { 'content-type': 'application/json' }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: controller.signal,
    })
  } catch {
    throw new AppUnavailable('down', controller.signal.aborted ? 'ne répond pas à temps' : 'ne répond pas')
  } finally {
    clearTimeout(timer)
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    if (response.ok) throw new AppUnavailable('error', 'réponse illisible')
  }
  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`
    throw new AppUnavailable('error', detail)
  }
  return body
}

export function describeFailure(app: string, error: unknown): string {
  if (error instanceof AppUnavailable) return `${app} ${error.message}`
  return `${app} : ${error instanceof Error ? error.message : 'erreur inattendue'}`
}

export const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)
