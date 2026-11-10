// Briques d'interface : messages (toasts), confirmation, fenêtre modale, fermeture des menus.

import { CircleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

interface Toast {
  id: number
  text: string
  tone: 'info' | 'danger'
}

interface ConfirmRequest {
  title: string
  text?: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface UiContextValue {
  toast: (text: string, tone?: Toast['tone']) => void
  confirm: (options: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
}

const UiContext = createContext<UiContextValue | null>(null)

export function useUi(): UiContextValue {
  const value = useContext(UiContext)
  if (!value) throw new Error('UiProvider manquant')
  return value
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const toast = useCallback<UiContextValue['toast']>(
    (text, tone = 'info') => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { id, text, tone }])
      setTimeout(() => dismiss(id), tone === 'danger' ? 7000 : 4000)
    },
    [dismiss],
  )
  const confirm = useCallback<UiContextValue['confirm']>((options) => new Promise<boolean>((resolve) => setConfirmation({ ...options, resolve })), [])

  const answer = (ok: boolean) => {
    confirmation?.resolve(ok)
    setConfirmation(null)
  }

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            {t.tone === 'danger' && <CircleAlert aria-hidden width={16} height={16} />}
            <span className="toast__text">{t.text}</span>
            <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Fermer le message" onClick={() => dismiss(t.id)}>
              <X />
            </button>
          </div>
        ))}
      </div>
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => answer(false)} width={420}>
          {confirmation.text && <p className="dialog__text">{confirmation.text}</p>}
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={() => answer(false)}>
              Annuler
            </button>
            <button type="button" className={`btn ${confirmation.danger ? 'btn--danger-solid' : 'btn--primary'}`} onClick={() => answer(true)} autoFocus>
              {confirmation.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </UiContext.Provider>
  )
}

/** Fenêtre modale native (<dialog>) : Échap et clic sur le voile ferment. */
export function Modal({ title, onClose, children, width = 520, labelId }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; labelId?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = labelId ?? 'modal-title'
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="dialog"
      style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog__head">
        <h2 id={id} className="dialog__title">
          {title}
        </h2>
        <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Fermer" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  )
}

/** Ferme un menu au clic extérieur et à Échap (focus rendu au déclencheur si demandé). */
export function useDismiss(open: boolean, close: (restoreFocus: boolean) => void, root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close, root])
}
