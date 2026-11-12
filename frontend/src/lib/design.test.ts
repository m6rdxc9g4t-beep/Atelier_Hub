import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('charte de la suite', () => {
  it('hub.css et slides.css n’emploient que des jetons (aucune couleur littérale)', () => {
    for (const file of ['hub.css', 'slides.css']) {
      const css = withoutComments(read(`../styles/${file}`))
      assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, file)
      assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb)\(/i, file)
      assert.doesNotMatch(css, /:\s*(white|black|red|gray|grey)\s*[;}]/i, file)
    }
    assert.match(read('../styles/index.css'), /@import '\.\/hub\.css';\s*@import '\.\/slides\.css';/)
  })

  it('une diapositive est une boîte 16:9 à sa propre échelle, plate et sans transition', () => {
    const css = withoutComments(read('../styles/slides.css'))
    const slide = css.match(/(?:^|})\s*\.slide\s*{([^}]*)}/)
    assert.ok(slide, '.slide est déclaré')
    assert.match(slide[1]!, /aspect-ratio:\s*16 \/ 9;/)
    // Conteneur : les tailles internes sont en cqw / cqh, le même balisage sert la lecture, le plein écran, l'impression.
    assert.match(slide[1]!, /container-type:\s*size;/)
    assert.doesNotMatch(css, /box-shadow|text-shadow|transition|animation/)
    // La mise en page du téléphone ne vaut qu'à l'écran : à l'impression, la largeur de la « fenêtre » est celle de la page.
    for (const m of css.matchAll(/@media\s+([^{]*)\(max-width/g)) assert.match(m[1]!, /\bscreen\b/, `@media ${m[1]}(max-width…)`)
    assert.match(css, /@media screen and \(max-width: 860px\)/)
  })

  it('la feuille d’impression donne une diapositive par page, sans la coquille ni unité de fenêtre', () => {
    const css = withoutComments(read('../styles/slides.css'))
    // Page 16:9 plus 1 mm (297 × 9/16 = 167,06 mm : une page de 167 mm déborderait sur une page blanche), sans marge,
    // et nommée : seule une présentation la prend.
    assert.match(css, /@page deck\s*{\s*size:\s*297mm 168mm;\s*margin:\s*0;\s*}/)
    const start = css.indexOf('@media print')
    assert.ok(start >= 0, '@media print est déclaré')
    const print = css.slice(start)
    assert.equal(print.indexOf('@media', 1), -1, 'le bloc d’impression est le dernier de la feuille')
    assert.match(print, /\.deck-page\s*{\s*page:\s*deck;/)
    assert.match(print, /\.deck__item\s*{[^}]*break-after:\s*page;[^}]*page-break-after:\s*always;[^}]*break-inside:\s*avoid;/)
    assert.match(print, /\.deck__item:last-child\s*{[^}]*break-after:\s*auto;/)
    // La coquille, l'en-tête, l'édition et les fenêtres (dont le plein écran) ne s'impriment pas.
    const hidden = print.match(/([^{}]*){\s*display:\s*none\s*!important;\s*}/)
    assert.ok(hidden, 'une règle masque la coquille')
    for (const selector of ['.sidebar', '.topbar', '.toasts', 'dialog', '.deck__head', '.deck__add', '.slide-editor']) assert.ok(hidden[1]!.includes(selector), `${selector} est masqué`)
    // La diapositive garde sa boîte : largeur de la page, 16:9. Safari résout mal vw / vh à l'impression.
    assert.match(print, /\.deck \.slide\s*{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*16 \/ 9;/)
    assert.doesNotMatch(print, /\d(?:d|s|l)?v(?:w|h|min|max)\b/, 'aucune unité de fenêtre à l’impression')
    assert.match(print, /print-color-adjust:\s*exact;/)
  })

  it('le plein écran couvre la page et garde la diapositive en 16:9 dans sa scène', () => {
    const css = withoutComments(read('../styles/slides.css'))
    const dialog = css.match(/(?:^|})\s*dialog\.presenter\s*{([^}]*)}/)
    assert.ok(dialog, 'dialog.presenter est déclaré')
    for (const rule of [/inset:\s*0;/, /max-width:\s*none;/, /max-height:\s*none;/, /height:\s*100dvh;/]) assert.match(dialog[1]!, rule)
    assert.match(css, /\.presenter__stage\s*{[^}]*container-type:\s*size;/)
    assert.match(css, /\.presenter \.slide\s*{[^}]*width:\s*min\(100cqw, 100cqh \* 16 \/ 9\);/)
    // Au doigt, la navigation du plein écran fait 44 px.
    assert.match(css, /@media \(pointer: coarse\)\s*{\s*\.presenter__nav \.btn--icon\s*{\s*width:\s*44px;\s*height:\s*44px;/)
  })

  it('les actions d’une fenêtre passent à la ligne au lieu de sortir de la fenêtre', () => {
    const css = withoutComments(read('../styles/hub.css'))
    for (const selector of ['.dialog__actions', '.dialog__group']) {
      const rule = css.match(new RegExp(`(?:^|})\\s*\\${selector}\\s*{([^}]*)}`))
      assert.ok(rule, `${selector} est déclaré`)
      assert.match(rule[1]!, /flex-wrap:\s*wrap\s*;/, `${selector} : flex-wrap`)
    }
    // Annuler et le bouton principal restent ensemble sous « Supprimer la fiche ».
    assert.match(read('../components/Dialogs.tsx'), /dialog__left[\s\S]*?className="dialog__group"/)
  })

  it('une variante d’entrée de navigation l’emporte sur `.nav-link`', () => {
    // À poids égal, la règle écrite en dernier gagne : une variante à une seule classe déclarée avant `.nav-link`
    // ne changerait rien (« Exemples de la suite » restait de la couleur des fiches).
    const css = withoutComments(read('../styles/hub.css'))
    const base = css.search(/(?:^|})\s*\.nav-link\s*{/)
    assert.ok(base >= 0, '.nav-link est déclaré')
    const variants = [...css.matchAll(/(?:^|})\s*((?:\.nav-link)?\.nav-link--[a-z-]+)(?::[a-z-]+)?\s*{/g)]
    assert.ok(variants.some((m) => m[1]!.endsWith('.nav-link--quiet')), '.nav-link--quiet est déclaré')
    for (const m of variants) assert.ok(m[1]!.startsWith('.nav-link.') || m.index > base, `${m[1]} : écrit \`.nav-link${m[1]}\` ou déclaré après \`.nav-link\``)
  })

  it('la signature du Hub est déclarée et activée', () => {
    const css = read('../styles/hub-signature.css')
    assert.match(css, /--atelier-sig-hub:\s*#9a3e6c/)
    assert.match(css, /\[data-atelier-app="hub"\]\s*{\s*--atelier-signature: var\(--atelier-sig-hub\)/)
    assert.match(read('../../index.html'), /data-atelier-app="hub"/)
  })

  it('les copies du design system d’Atelier Projets portent les variables de fondation et les couleurs officielles', () => {
    const themes = read('../styles/atelier-ds/light.css') + read('../styles/atelier-ds/dark.css')
    for (const v of ['--bg-main', '--bg-surface', '--bg-elevated', '--text-primary', '--text-muted', '--border-color']) assert.ok(themes.includes(v), v)
    const colors = read('../styles/atelier-ds/colors.css')
    for (const v of ['open', 'progress', 'review', 'hold', 'blocked', 'resolved', 'closed', 'rejected']) assert.ok(colors.includes(`--status-${v}`), v)
    assert.match(read('../styles/atelier-brand/atelier-brand.css'), /\.atelier-kpi\s*{/)
  })

  it('les formes de l’API sont les mêmes des deux côtés', () => {
    const body = (text: string) => text.split('\n').slice(1).join('\n')
    assert.equal(body(read('./types.ts')), body(read('../../../backend/src/domain/types.ts')))
  })
})
