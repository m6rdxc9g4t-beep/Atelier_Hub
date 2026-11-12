// Lien vers une autre app de la suite (nouvel onglet). En aperçu, les apps ne tournent pas : le clic dit où il mènerait.

import type { MouseEvent, ReactNode } from 'react'

import { api } from '../lib/hub-api.ts'
import { useUi } from './ui.tsx'

export function ExtLink({
  href,
  className,
  children,
  label,
  title,
  onPreview,
}: {
  href: string
  className?: string
  children: ReactNode
  /** Où mène le lien (« Atelier Projets › Tableau de bord mensuel »), pour l'aperçu et les lecteurs d'écran. */
  label?: string
  title?: string
  /**
   * Aperçu : reçoit la phrase « ouvrirait … » au lieu de la notification. Pour un lien placé dans une fenêtre, qui
   * l'affiche elle-même : une notification passerait sous la fenêtre.
   */
  onPreview?: (text: string) => void
}) {
  const { toast } = useUi()
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!api.demo) return
    event.preventDefault()
    const text = `Aperçu : ouvrirait ${label ?? 'l’app'} (${href})`
    if (onPreview) onPreview(text)
    else toast(text)
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} onClick={onClick} title={title}>
      {children}
    </a>
  )
}
