// Briques d'interface : messages (toasts), confirmation, fenêtre modale, fermeture des menus.

import { CircleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import { confirmFocus, FOCUS_FALLBACK, focusOnClose, focusOnOpen, isHeldEnter } from '../lib/dialogs.ts'

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

  // Une suppression ne se confirme pas d'une Entrée de trop : le focus attend sur « Annuler ».
  const focused = confirmFocus(confirmation?.danger === true)

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
            <button type="button" className="btn" onClick={() => answer(false)} data-autofocus={focused === 'cancel' ? '' : undefined}>
              Annuler
            </button>
            <button
              type="button"
              className={`btn ${confirmation.danger ? 'btn--danger-solid' : 'btn--primary'}`}
              onClick={() => answer(true)}
              data-autofocus={focused === 'confirm' ? '' : undefined}
            >
              {confirmation.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </UiContext.Provider>
  )
}

/**
 * Fenêtre modale native (<dialog>) : Échap et clic sur le voile ferment. Le focus va à l'élément `data-autofocus`
 * (l'attribut `autoFocus` de React agit avant l'ouverture, donc sans effet) et revient au déclencheur à la fermeture
 * (au bouton du menu, `data-focus-fallback`, quand le déclencheur n'est plus à l'écran).
 * Règles (focus, touche maintenue) dans `lib/dialogs.ts`.
 */
export function Modal({ title, onClose, children, width = 520, labelId }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; labelId?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = labelId ?? 'modal-title'
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Qui a ouvert la fenêtre : le focus lui revient à la fermeture (la fenêtre est démontée sans `close()`,
    // le navigateur ne le rend donc pas de lui-même).
    opener.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    // `showModal()` place le focus sur le premier bouton (« Fermer ») : le champ marqué `data-autofocus` le reprend.
    // Pas au doigt : le clavier de l'écran s'ouvrirait par-dessus la fenêtre avant qu'on ait rien demandé.
    focusOnOpen<HTMLElement>(dialog, window.matchMedia('(pointer: coarse)').matches)?.focus()
    return () => {
      // Le déclencheur, sinon le bouton du menu : au téléphone, une entrée de la barre latérale est repliée avec elle.
      focusOnClose([opener.current, document.querySelector<HTMLElement>(FOCUS_FALLBACK)], (el) => {
        if (!el.isConnected) return false
        el.focus()
        return document.activeElement === el
      })
    }
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
      onKeyDown={(e) => {
        // La touche qui a ouvert la fenêtre, encore enfoncée, n'y clique rien (ni bouton, ni envoi du formulaire).
        if (isHeldEnter(e, (e.target as HTMLElement).tagName)) e.preventDefault()
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
