// Thème clair / sombre (docs/SUITE.md §1.5 d'Atelier Projets) : la préférence est commune à la suite.
// public/atelier-theme.js (copie verbatim de design-system/brand/) la lit et l'applique avant le premier rendu :
// sur <html>, data-theme="dark" ET la classe « dark » en sombre, data-theme="light" sans « dark » en clair.
// Le sélecteur du Hub passe par window.atelierTheme.set(pref) et suit l'événement « atelier-theme ».

import { useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

interface AtelierTheme {
  get: () => ThemePreference
  set: (preference: ThemePreference) => void
  resolved: () => 'light' | 'dark'
}

declare global {
  interface Window {
    atelierTheme?: AtelierTheme
  }
}

const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system'

function current(): ThemePreference {
  const pref = window.atelierTheme?.get()
  return isPreference(pref) ? pref : 'system'
}

export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(current)

  useEffect(() => {
    const onChange = () => setPreference(current())
    window.addEventListener('atelier-theme', onChange)
    document.addEventListener('visibilitychange', onChange)
    return () => {
      window.removeEventListener('atelier-theme', onChange)
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [])

  const choose = (p: ThemePreference) => {
    if (window.atelierTheme) window.atelierTheme.set(p)
    else setPreference(p)
  }
  return [preference, choose]
}
