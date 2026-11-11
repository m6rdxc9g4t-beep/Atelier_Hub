import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('charte de la suite', () => {
  it('hub.css n’emploie que des jetons (aucune couleur littérale)', () => {
    const css = withoutComments(read('../styles/hub.css'))
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i)
    assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla|oklch)\(/i)
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
