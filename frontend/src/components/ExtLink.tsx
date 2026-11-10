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
}: {
  href: string
  className?: string
  children: ReactNode
  /** Où mène le lien (« Atelier Projets › Tableau de bord mensuel »), pour l'aperçu et les lecteurs d'écran. */
  label?: string
  title?: string
}) {
  const { toast } = useUi()
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!api.demo) return
    event.preventDefault()
    toast(`Aperçu : ouvrirait ${label ?? 'l’app'} (${href})`)
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} onClick={onClick} title={title}>
      {children}
    </a>
  )
}
