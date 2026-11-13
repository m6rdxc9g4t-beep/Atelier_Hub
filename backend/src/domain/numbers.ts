// Nombres d'un texte, et leur présence dans des faits. Règles pures, testées (portage de la vérification d'Atelier
// Viz, `app/services/ai/summary.py`), avec une différence voulue : AUCUNE exemption, ni pour les petits entiers ni
// pour les années. Dans le Hub les chiffres sont petits (« 1 bloqué », « 5 sur 8 ») : les admettre d'office
// reviendrait à ne rien vérifier.
//
// Deux règles plus strictes que Viz, voulues aussi : la comparaison se fait à la précision du nombre ÉCRIT par l'IA
// (une décimale ajoutée à un fait arrondi, « 1,4 h » pour « 1 h », est un chiffre inventé : la consigne demande de
// recopier les nombres tels qu'ils sont écrits ; un arrondi plus grossier, « 1,3 k » pour 1 280, reste admis), et le
// signe compte comme dans Viz (`_same_sign`) : un fait négatif se cite avec son signe, ou sans lui si la phrase dit
// la baisse ou le retard, jamais avec un « + » ; un fait positif ne se cite pas avec un « − ».
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
  /** Signe écrit devant le nombre : « + », « - » (pour « - » comme pour « − ») ou rien ; `value` est toujours positive. */
  sign: '+' | '-' | ''
  /** La phrase dit-elle une baisse, un retard, un déficit (un nombre sans signe peut alors citer un fait négatif) ? */
  negativeContext: boolean
}

// Séparateurs de milliers : espace, espace insécable (U+00A0), espace fine insécable (U+202F, celle de
// `toLocaleString('fr-FR')`). Un nombre ne commence ni ne finit au milieu d'un mot (« 1er », « T3 », « v2 »).
const NUMBER =
  /(?<![\p{L}\p{N}_,.])([+\-−]?)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?[   ]?(%|Md|mds?|milliards?|M|millions?|k|K|milliers?)?(?![\p{L}\p{N}_])/gu

// Unités en minuscules : « M » devient « m » (le motif n'accepte que la majuscule, pas de confusion avec « mètre »).
// Mots d'une baisse (repris de `_NEGATIVE_WORDS` de Viz).
const NEGATIVE_WORDS =
  /baiss|recul|défici|négati|negati|perte|perd|moins|diminu|chut|repli|découvert|dessous|\bsous\b|défavorable|retard|retrait|manqu|dette|débit|dépens|sorti|rouge|réduction|réduit|inférieur|fléchi|tass|érod|régress|contract/i

const UNITS: Readonly<Record<string, number>> = { k: 1e3, millier: 1e3, milliers: 1e3, m: 1e6, million: 1e6, millions: 1e6, md: 1e9, mds: 1e9, milliard: 1e9, milliards: 1e9 }

/** Nombres écrits à la française : « 1 234,5 », « 4,4 M », « +48 % », « 2 millions », « 42,5 h », « 15 décembre 2026 ». */
export function numbers(text: string): FoundNumber[] {
  const found: FoundNumber[] = []
  const negativeContext = NEGATIVE_WORDS.test(text)
  for (const match of text.matchAll(NUMBER)) {
    const [whole, sign = '', integer = '', fraction, unit] = match
    const digits = integer.replace(/\D/g, '')
    const scale = UNITS[(unit ?? '').toLowerCase()] ?? 1
    found.push({
      text: whole.trim(),
      value: Number(fraction ? `${digits}.${fraction}` : digits) * scale,
      precision: 0.5 * 10 ** -(fraction?.length ?? 0) * scale,
      percent: unit === '%',
      sign: sign === '' ? '' : sign === '+' ? '+' : '-',
      negativeContext,
    })
  }
  return found
}

/** Le signe écrit concorde-t-il avec celui du fait (règle de Viz) ? */
function sameSign(n: FoundNumber, fact: FoundNumber): boolean {
  if (fact.sign === '-') return n.sign === '-' || (n.sign === '' && n.negativeContext)
  return n.sign !== '-'
}

/**
 * Le nombre figure-t-il dans la réserve, à la précision du nombre écrit près (jamais à celle du fait : une
 * décimale ajoutée à un fait arrondi est inventée), avec le même signe, pourcentage contre pourcentage ?
 */
export function grounded(n: FoundNumber, pool: readonly FoundNumber[]): boolean {
  return pool.some((fact) => {
    if (fact.percent !== n.percent || !sameSign(n, fact)) return false
    const tolerance = n.precision + 1e-9 * Math.max(Math.abs(n.value), Math.abs(fact.value), 1)
    return Math.abs(n.value - fact.value) <= tolerance
  })
}

/** Nombres du texte absents de la réserve, tels qu'ils sont écrits, chacun une fois. */
export function ungrounded(text: string, pool: readonly FoundNumber[]): string[] {
  return [...new Set(numbers(text).filter((n) => !grounded(n, pool)).map((n) => n.text))]
}
