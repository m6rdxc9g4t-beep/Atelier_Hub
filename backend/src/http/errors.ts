// Erreurs de l'API : { detail, code }, messages en français (docs/SUITE.md §7.5).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} introuvable`)
export const invalid = (message: string) => new ApiError(422, 'VALIDATION', message)
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message)
export const forbidden = (code: string, message: string) => new ApiError(403, code, message)
/** Erreur d'un moteur d'IA (502 : injoignable, modèle absent, réponse en erreur ; 504 : délai dépassé). */
export const gateway = (status: 502 | 504, code: string, message: string) => new ApiError(status, code, message)
