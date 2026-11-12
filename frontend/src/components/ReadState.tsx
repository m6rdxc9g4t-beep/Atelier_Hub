// États d'une lecture, pour les écrans des présentations : attente, échec (avec « Réessayer »), introuvable.

import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export function ReadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state__icon empty-state__icon--danger" aria-hidden="true">
        <CircleAlert />
      </span>
      <h1 className="empty-state__title">Lecture impossible</h1>
      <p className="empty-state__text">{text}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  )
}

export function ReadMissing({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">{title}</h1>
      <p className="empty-state__text">{text}</p>
      {action}
    </div>
  )
}
