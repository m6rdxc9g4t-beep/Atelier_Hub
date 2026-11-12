// Nombres d'un texte, et leur présence dans des faits. Règles pures, testées (portage de la vérification d'Atelier
// Viz, `app/services/ai/summary.py`), avec une différence voulue : AUCUNE exemption, ni pour les petits entiers ni
// pour les années. Dans le Hub les chiffres sont petits (« 1 bloqué », « 5 sur 8 ») : les admettre d'office
// reviendrait à ne rien vérifier.
//
// Ce que cette vérification fait : refuser un nombre qui n'apparaît nulle part dans les faits. Ce qu'elle ne fait
// pas : savoir si un nombre présent est attribué à la bonne chose (« 12 features » passe si « 12 h » est un fait),
// ni lire un nombre écrit en lettres.

export interface FoundNumber {
  /** Le nombre tel qu'il est écrit (« 63 % », « 1 240 »). */
  text: string
  value: number
  /** Demi-unité du dernier chiffre écrit : « 4,4 M » vaut 4 400 000 à 50 000 près. */
  precision: number
  percent: boolean
}

// Séparateurs de milliers : espace, espace insécable (U+00A0), espace fine insécable (U+202F, celle de
// `toLocaleString('fr-FR')`). Un nombre ne commence ni ne finit au milieu d'un mot (« 1er », « T3 », « v2 »).
const NUMBER =
  /(?<![\p{L}\p{N}_,.])[+\-−]?(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?[   ]?(%|Md|mds?|milliards?|M|millions?|k|K|milliers?)?(?![\p{L}\p{N}_])/gu

// Unités en minuscules : « M » devient « m » (le motif n'accepte que la majuscule, pas de confusion avec « mètre »).
const UNITS: Readonly<Record<string, number>> = { k: 1e3, millier: 1e3, milliers: 1e3, m: 1e6, million: 1e6, millions: 1e6, md: 1e9, mds: 1e9, milliard: 1e9, milliards: 1e9 }

/** Nombres écrits à la française : « 1 234,5 », « 4,4 M », « +48 % », « 2 millions », « 42,5 h », « 15 décembre 2026 ». */
export function numbers(text: string): FoundNumber[] {
  const found: FoundNumber[] = []
  for (const match of text.matchAll(NUMBER)) {
    const [whole, integer = '', fraction, unit] = match
    const digits = integer.replace(/\D/g, '')
    const scale = UNITS[(unit ?? '').toLowerCase()] ?? 1
    found.push({
      text: whole.trim(),
      value: Number(fraction ? `${digits}.${fraction}` : digits) * scale,
      precision: 0.5 * 10 ** -(fraction?.length ?? 0) * scale,
      percent: unit === '%',
    })
  }
  return found
}

/** Le nombre figure-t-il dans la réserve, à la précision écrite près, pourcentage contre pourcentage ? */
export function grounded(n: FoundNumber, pool: readonly FoundNumber[]): boolean {
  return pool.some((fact) => {
    if (fact.percent !== n.percent) return false
    const tolerance = Math.max(n.precision, fact.precision) + 1e-9 * Math.max(Math.abs(n.value), Math.abs(fact.value), 1)
    return Math.abs(n.value - fact.value) <= tolerance
  })
}

/** Nombres du texte absents de la réserve, tels qu'ils sont écrits, chacun une fois. */
export function ungrounded(text: string, pool: readonly FoundNumber[]): string[] {
  return [...new Set(numbers(text).filter((n) => !grounded(n, pool)).map((n) => n.text))]
}
