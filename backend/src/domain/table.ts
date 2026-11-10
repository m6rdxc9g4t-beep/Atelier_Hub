// Lecture d'une table d'échange `atelier-table/1` (docs/SUITE.md §7.2) : forme vérifiée, champs inconnus ignorés.

export type Cell = string | number | boolean | null
export type Row = Record<string, Cell>

export interface AtelierTable {
  name: string
  label: string
  rows: Row[]
  total: number | null
  truncated: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function readAtelierTable(value: unknown): AtelierTable {
  if (!isRecord(value) || value.format !== 'atelier-table/1' || !Array.isArray(value.rows)) {
    throw new Error('Réponse inattendue : table atelier-table/1 attendue')
  }
  const rows = value.rows.filter(isRecord) as Row[]
  return {
    name: typeof value.name === 'string' ? value.name : '',
    label: typeof value.label === 'string' ? value.label : '',
    rows,
    total: typeof value.total === 'number' ? value.total : null,
    truncated: value.truncated === true,
  }
}

export const str = (value: unknown): string | null => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null)
export const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
