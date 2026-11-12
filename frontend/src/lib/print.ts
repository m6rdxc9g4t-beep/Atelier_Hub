// « Exporter en PDF » : l'impression du navigateur, en clair. Les jetons sombres imprimeraient un texte clair sur du
// papier blanc : le thème clair est posé sur <html> le temps de l'impression, puis celui de l'écran est remis.
// Sans dépendance au navigateur réel : le document est reçu en paramètre, la règle est testée telle quelle.

export interface ThemeAttributes {
  /** Valeur de `data-theme` sur <html> (null : attribut absent). */
  theme: string | null
  /** Classe « dark » sur <html>. */
  dark: boolean
}

/** Pur : attributs à poser sur <html> pour imprimer en clair, et ceux à remettre ensuite. */
export function lightForPrint(current: ThemeAttributes): { apply: { theme: 'light'; dark: false }; restore: ThemeAttributes } {
  return { apply: { theme: 'light', dark: false }, restore: { theme: current.theme, dark: current.dark } }
}

/** Ce que l'impression touche dans le document (un `Document` convient). */
export interface PrintDocument {
  title: string
  documentElement: {
    getAttribute(name: string): string | null
    setAttribute(name: string, value: string): void
    removeAttribute(name: string): void
    classList: { contains(name: string): boolean; toggle(name: string, force: boolean): unknown }
  }
}

export interface PrintSession {
  /** Avant l'impression : thème clair et titre du document (le nom de fichier proposé). Sans effet si déjà fait. */
  begin(): void
  /** Après l'impression : remet le thème et le titre de l'écran. Sans effet si rien n'est en cours. */
  end(): void
}

/**
 * Une impression, qu'elle vienne du bouton « Exporter en PDF » (`printDeck`) ou du raccourci du navigateur
 * (`beforeprint`) : `begin` deux fois de suite ne perd pas l'état de l'écran, `end` le remet une seule fois.
 */
export function printSession(doc: PrintDocument, title: () => string): PrintSession {
  let saved: { theme: ThemeAttributes; title: string } | null = null
  const set = (attributes: ThemeAttributes) => {
    const root = doc.documentElement
    if (attributes.theme === null) root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', attributes.theme)
    root.classList.toggle('dark', attributes.dark)
  }
  return {
    begin() {
      if (saved) return
      const root = doc.documentElement
      const { apply, restore } = lightForPrint({ theme: root.getAttribute('data-theme'), dark: root.classList.contains('dark') })
      saved = { theme: restore, title: doc.title }
      set(apply)
      const name = title()
      if (name) doc.title = name
    },
    end() {
      if (!saved) return
      set(saved.theme)
      doc.title = saved.title
      saved = null
    },
  }
}

/**
 * Lance l'impression. Le thème clair est posé avant `print()` : Safari capture la page dès l'appel. `afterprint`
 * (écouté par l'écran qui tient la session) remet tout.
 */
export function printDeck(session: PrintSession, win: { print(): void }): void {
  session.begin()
  win.print()
}

/** « Titre — Fiche » : titre du document le temps de l'impression. */
export function printTitle(presentation: string, project: string): string {
  return project ? `${presentation} — ${project}` : presentation
}
