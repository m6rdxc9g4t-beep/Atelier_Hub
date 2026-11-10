// Rapprochement par mots-clés : un rapport Viz, une table Tab ou une conversion est proposé dans une fiche projet
// quand son nom contient l'un des mots-clés de la fiche (par défaut, son nom). Comparaison sans casse ni accents,
// sur des mots entiers : « KPI CGO » trouve « Rapport KPI CGO 2026 » mais pas « KPI CGOV ».

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Mots-clés d'une fiche : la liste saisie (séparée par des virgules), sinon le nom. Normalisés, sans doublon. */
export function parseKeywords(name: string, keywords: string): string[] {
  const raw = keywords.split(',').map(normalize).filter(Boolean)
  const list = raw.length > 0 ? raw : [normalize(name)].filter(Boolean)
  return [...new Set(list)]
}

export function matchesKeywords(text: string | null | undefined, keywords: readonly string[]): boolean {
  if (!text || keywords.length === 0) return false
  const haystack = ` ${normalize(text)} `
  return keywords.some((keyword) => haystack.includes(` ${keyword} `))
}

/** Égalité de noms (projet Tab, projet Projets) sans casse ni accents. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalize(a) === normalize(b)
}

export function slugify(text: string): string {
  return normalize(text).replace(/ /g, '-').slice(0, 60) || 'projet'
}
