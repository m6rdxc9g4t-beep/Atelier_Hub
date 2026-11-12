// Texte d'une diapositive : des paragraphes (séparés par une ligne vide) et des listes (lignes « - … »).
// Rien d'autre n'est interprété : ni HTML ni Markdown. Le texte reste du texte (React l'échappe à l'affichage).
// Règle pure, testée.

export type TextBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

/** Une ligne de liste : un tiret (ou « – », « • ») puis un espace. */
const ITEM = /^\s*[-–•]\s+(.*)$/

export function parseSlideText(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  let paragraph: string[] = []
  let items: string[] = []
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: 'p', text: paragraph.join('\n') })
    if (items.length > 0) blocks.push({ type: 'ul', items })
    paragraph = []
    items = []
  }
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const item = ITEM.exec(raw)
    if (!line) flush()
    else if (item) {
      // Une liste suit son paragraphe sans ligne vide (« En bref :\n- … »).
      if (paragraph.length > 0) flush()
      const content = item[1]!.trim()
      if (content) items.push(content)
    } else {
      if (items.length > 0) flush()
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}
