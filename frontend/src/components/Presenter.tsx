// Plein écran « Présenter » : une diapositive à la fois, par-dessus toute la page. La fenêtre modale (<dialog>) est
// dans la couche supérieure du navigateur : elle couvre la page, que celle-ci soit passée en plein écran (demandé par
// le clic sur « Présenter », seul moment où le navigateur l'accorde) ou non (iPhone, refus) — même comportement, les
// barres du navigateur restent alors visibles. Quand le plein écran arrive, la fenêtre repasse devant la page. Les chiffres sont ceux lus à l'ouverture : rien n'est relu en cours
// de présentation. Règle du clavier dans `lib/presenter.ts`.

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { shownTitle } from '../lib/deck.ts'
import { FOCUS_FALLBACK, focusOnClose } from '../lib/dialogs.ts'
import { clockTime } from '../lib/freshness.ts'
import { presenterKey, slideAnnouncement } from '../lib/presenter.ts'
import type { Deck } from '../lib/types.ts'
import { Slide } from './Slide.tsx'

export function Presenter({ deck, startIndex, today, onClose }: { deck: Deck; startIndex: number; today: string; onClose: () => void }) {
  const count = deck.slides.length
  const [position, setPosition] = useState(startIndex)
  // Une diapositive supprimée ailleurs pendant la présentation ne laisse pas un écran vide.
  const index = Math.min(Math.max(0, position), Math.max(0, count - 1))
  const slide = deck.slides[index]
  // Aperçu : où mènerait le lien cliqué (une notification passerait sous cette fenêtre).
  const [preview, setPreview] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  const go = useCallback((target: number) => {
    setPosition(target)
    setPreview(null)
    // Le focus revient à la diapositive : la touche suivante ne réactive pas le lien ou le bouton qu'on vient de quitter.
    stage.current?.focus()
    stage.current?.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    opener.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!element.open) element.showModal()
    stage.current?.focus()
    const onFullscreen = () => {
      // Sortie du plein écran par le navigateur (Échap, geste) : la présentation se ferme avec lui.
      if (!document.fullscreenElement) {
        close.current()
        return
      }
      // La page vient d'entrer dans la couche supérieure, donc au-dessus de cette fenêtre, ouverte avant elle (le
      // plein écran est accordé un instant après le clic) : son contenu se peindrait par-dessus la diapositive.
      // Refermer puis rouvrir la fenêtre la replace en dernier dans la couche, dans la même image.
      element.close()
      element.showModal()
      stage.current?.focus()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
      // Le focus revient à « Présenter » (la fenêtre est démontée sans `close()` : le navigateur ne le rend pas seul).
      focusOnClose([opener.current, document.querySelector<HTMLElement>(FOCUS_FALLBACK)], (el) => {
        if (!el.isConnected) return false
        el.focus()
        return document.activeElement === el
      })
    }
  }, [])

  const title = slide ? shownTitle(slide) : ''
  const readAt = clockTime(deck.generated_at)

  return (
    <dialog
      ref={dialog}
      className="presenter"
      aria-label={`Présentation : ${deck.presentation.title}`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement
        const action = presenterKey(e, index, count, target.closest('a, button') !== null)
        if (action === null) {
          // Entrée ou Espace maintenue sur la diapositive : ni défilement de la page, ni rien d'autre.
          if (e.repeat && (e.key === 'Enter' || e.key === ' ') && target.closest('a, button') === null) e.preventDefault()
          return
        }
        e.preventDefault()
        if (action === 'exit') onClose()
        else go(action.go)
      }}
    >
      <div className="presenter__stage" ref={stage} tabIndex={-1}>
        {slide ? (
          <Slide key={slide.id} slide={slide} index={index} count={count} project={deck.project} today={today} onPreview={setPreview} />
        ) : (
          <p className="presenter__empty">Cette présentation n’a aucune diapositive.</p>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {slide ? slideAnnouncement(index, count, title) : ''}
      </p>

      <div className="presenter__bar">
        <p className="presenter__note" role="status">
          {preview ?? (readAt ? `Chiffres lus à ${readAt}` : '')}
        </p>
        <div className="presenter__nav">
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Diapositive précédente" title="Précédente (←)" disabled={index <= 0} onClick={() => go(index - 1)}>
            <ChevronLeft />
          </button>
          <span className="presenter__count" aria-hidden="true">
            {count > 0 ? index + 1 : 0} / {count}
          </span>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Diapositive suivante" title="Suivante (→)" disabled={index >= count - 1} onClick={() => go(index + 1)}>
            <ChevronRight />
          </button>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Quitter la présentation" title="Quitter (Échap)" onClick={onClose}>
            <X />
          </button>
        </div>
      </div>
    </dialog>
  )
}
