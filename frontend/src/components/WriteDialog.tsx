// « Rédiger avec l'IA » : une IA écrit le texte (`body`) des diapositives choisies à partir de ce qu'elles affichent.
// Rien d'autre ne change : ni titre, ni chiffres, ni ordre. Le Hub vérifie chaque nombre de la réponse ; un texte qui
// ne passe pas n'est pas enregistré, la diapositive garde le sien, et la fenêtre dit lesquelles et pourquoi.
// Une requête par morceau (`writeChunks`) : la progression se voit, « Arrêter » abandonne la requête en cours (le Hub
// interrompt alors l'appel au moteur) et ce qui est déjà rédigé reste. Une fenêtre dit elle-même ce qui s'y passe :
// l'échec d'une requête s'affiche au-dessus de ses boutons (une notification passerait dessous).

import { Sparkles, Square } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { loadAiStatus, useAiStatus } from '../lib/ai-status.ts'
import { shownTitle } from '../lib/deck.ts'
import { answering, engineRequest, engineTrouble, readPrefs, resultLabel, writePrefs, type EnginePrefs } from '../lib/engine.ts'
import { plural } from '../lib/format.ts'
import { api } from '../lib/hub-api.ts'
import type { Deck, WriteResult } from '../lib/types.ts'
import { elapsedLabel, INSTRUCTIONS_MAX, keptLines, leftAside, manualTexts, mergeResults, progressLabel, skipReason, untouchedNotice, writable, writeChunks } from '../lib/writing.ts'
import { EnginePicker } from './EnginePicker.tsx'
import { Modal } from './ui.tsx'

/** Stockage du choix du moteur ; absent (navigation privée stricte) : le choix vaut pour cette fenêtre. */
function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage
  } catch {
    return { getItem: () => null, setItem: () => undefined }
  }
}

type Phase = 'setup' | 'running' | 'done'

interface Progress {
  /** Diapositives dont la requête est revenue. */
  done: number
  /** Diapositives de la requête en cours. */
  chunk: number
  total: number
  /** Ce qui répond (« Ollama (llama3.2:1b) »). */
  engine: string
  /** Une diapositive par requête (Ollama) : un petit modèle local peut être lent. */
  slow: boolean
}

export function WriteDialog({
  deck,
  slideId,
  onClose,
  onWritten,
}: {
  deck: Deck
  /** Diapositive depuis laquelle la fenêtre est ouverte ; null : toute la présentation. */
  slideId: number | null
  /** `incomplete` : la rédaction a été arrêtée ou a échoué en route (la présentation est à relire dans le Hub). */
  onClose: (incomplete: boolean) => void
  /** Une requête est revenue : ses textes sont enregistrés. */
  onWritten: (result: WriteResult) => void
}) {
  const ai = useAiStatus()
  const [prefs, setPrefs] = useState<EnginePrefs>(() => readPrefs(storage()))
  const [single, setSingle] = useState(slideId !== null)
  const [instructions, setInstructions] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [phase, setPhase] = useState<Phase>('setup')
  const [progress, setProgress] = useState<Progress>({ done: 0, chunk: 0, total: 0, engine: '', slow: false })
  const [seconds, setSeconds] = useState(0)
  const [results, setResults] = useState<WriteResult[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [stopped, setStopped] = useState(false)
  const [stopping, setStopping] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const stopButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const ids = { scope: useId(), scopeHelp: useId(), instructions: useId(), count: useId(), instructionsHelp: useId() }

  // L'état des moteurs est relu à l'ouverture (Ollama lancé, mode changé entre-temps), Claude revérifié.
  useEffect(() => {
    void loadAiStatus(true)
  }, [])

  // La fenêtre se ferme en route (retour du navigateur) : la requête en cours est abandonnée.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      controller.current?.abort()
    }
  }, [])

  // Durée écoulée, tant que le moteur travaille.
  useEffect(() => {
    if (phase !== 'running') return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds((Date.now() - started) / 1000), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  // Le bouton qui avait le focus (« Rédiger », puis « Arrêter ») disparaît : le focus va à celui qui le remplace.
  useEffect(() => {
    if (phase === 'running') stopButton.current?.focus()
    else if (phase === 'done') closeButton.current?.focus()
  }, [phase])

  const slide = slideId === null ? null : (deck.slides.find((item) => item.id === slideId) ?? null)
  const scope = single && slide ? [slide.id] : null
  const targets = writable(deck, scope, overwrite)
  const kinds = targets.flatMap((id) => deck.slides.find((item) => item.id === id)?.kind ?? [])
  const manual = manualTexts(deck, scope)
  const aside = leftAside(deck, scope, overwrite)
  const trouble = ai.status ? engineTrouble(prefs, ai.status) : null
  const ready = ai.status !== null && trouble === null && targets.length > 0

  const choose = (next: EnginePrefs) => {
    setPrefs(next)
    writePrefs(storage(), next)
  }

  let scopeHelp: string
  if (targets.length > 0) scopeHelp = `${plural(targets.length, 'diapositive à rédiger', 'diapositives à rédiger')}.${aside ? ` Gardent leur texte : ${aside}.` : ''}`
  else if (scope && slide) scopeHelp = `Cette diapositive ne sera pas rédigée : ${skipReason(slide, overwrite)}.${slide.text_source === 'manual' && !overwrite ? ' Coche « Réécrire aussi mes textes » pour le remplacer.' : ''}`
  else scopeHelp = aside ? `Rien à rédiger. Gardent leur texte : ${aside}.` : 'Rien à rédiger : la présentation n’a pas de diapositive.'

  const run = async (event: FormEvent) => {
    event.preventDefault()
    if (!ai.status || !ready) return
    const request = engineRequest(prefs, ai.status)
    const chunks = writeChunks(request.engine, targets)
    const engine = answering(prefs, ai.status)
    const slow = request.engine === 'ollama'
    const note = instructions.trim()
    const abort = new AbortController()
    controller.current = abort
    const collected: WriteResult[] = []
    let done = 0
    setResults([])
    setFailure(null)
    setStopped(false)
    setStopping(false)
    setSeconds(0)
    setProgress({ done, chunk: chunks[0]?.length ?? 0, total: targets.length, engine, slow })
    setPhase('running')
    for (const chunk of chunks) {
      if (abort.signal.aborted) break
      setProgress({ done, chunk: chunk.length, total: targets.length, engine, slow })
      try {
        const result = await api.write(deck.presentation.id, { slide_ids: chunk, ...request, ...(note && { instructions: note }), ...(overwrite && { overwrite_manual: true }) }, abort.signal)
        if (!alive.current) return
        collected.push(result)
        done += chunk.length
        setResults([...collected])
        onWritten(result)
      } catch (error) {
        if (!alive.current) return
        // Une requête qui échoue arrête la suite : ce qui précède reste, la raison est dite au-dessus des boutons.
        if (!abort.signal.aborted) setFailure((error as Error).message)
        break
      }
    }
    setStopped(abort.signal.aborted)
    setProgress({ done, chunk: 0, total: targets.length, engine, slow })
    setPhase('done')
  }

  const stop = () => {
    setStopping(true)
    controller.current?.abort()
  }

  // Échap ou le voile pendant la rédaction : on arrête (et on lit le bilan), on ne ferme pas à l'aveugle.
  const close = () => {
    if (phase === 'running') stop()
    else onClose(phase === 'done' && (stopped || failure !== null))
  }

  const merged = mergeResults(results)
  const kept = merged ? keptLines(deck, merged.kept) : []
  const written = results.reduce((sum, result) => sum + result.written.length, 0)

  return (
    <Modal title="Rédiger avec l’IA" onClose={close} labelId="write-title" width={560}>
      {phase === 'setup' && (
        <form onSubmit={(event) => void run(event)} className="write">
          <div className="dialog__body">
            <p className="write__intro">
              L’IA écrit le texte de chaque diapositive à partir de ce qu’elle affiche. Le Hub vérifie chaque nombre : un texte qui cite un chiffre absent n’est pas
              retenu. Titres et chiffres ne changent pas.
            </p>
            <div className="form-row">
              <span id={ids.scope} className="label">
                Portée
              </span>
              {slide ? (
                <div className="segmented segmented--wrap" role="group" aria-labelledby={ids.scope} aria-describedby={ids.scopeHelp}>
                  <button type="button" aria-pressed={single} onClick={() => setSingle(true)}>
                    Cette diapositive
                  </button>
                  <button type="button" aria-pressed={!single} onClick={() => setSingle(false)}>
                    Toute la présentation
                  </button>
                </div>
              ) : (
                <p className="write__scope">Toute la présentation — {plural(deck.slides.length, 'diapositive', 'diapositives')}</p>
              )}
              <p id={ids.scopeHelp} className="field-help">
                {single && slide && `« ${shownTitle(slide)} ». `}
                {scopeHelp}
              </p>
            </div>

            <div className="form-row">
              <EnginePicker prefs={prefs} onChange={choose} status={ai.status} error={ai.error} loading={ai.loading} kinds={kinds} onRecheck={() => void loadAiStatus(true)} />
            </div>

            <div className="form-row">
              <label className="label" htmlFor={ids.instructions}>
                Consignes
                <span className="label__opt">facultatif</span>
                <span id={ids.count} className="label__opt write__count">
                  {instructions.length} / {INSTRUCTIONS_MAX}
                </span>
              </label>
              <textarea
                id={ids.instructions}
                className="field"
                rows={2}
                value={instructions}
                maxLength={INSTRUCTIONS_MAX}
                placeholder="Pour un comité de direction, ton factuel."
                aria-describedby={`${ids.count} ${ids.instructionsHelp}`}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <p id={ids.instructionsHelp} className="field-help">
                Public visé, ton, ce sur quoi insister. Elles partent avec les faits des diapositives.
              </p>
            </div>

            {manual > 0 && (
              <div className="form-row">
                <label className="check">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  <span>
                    Réécrire aussi mes textes
                    <span className="check__help">
                      {manual === 1 ? '1 diapositive porte un texte que tu as écrit' : `${manual} diapositives portent un texte que tu as écrit`} : sans cette case, il est gardé.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={() => onClose(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn--primary" disabled={!ready}>
              <Sparkles aria-hidden />
              Rédiger
            </button>
          </div>
        </form>
      )}

      {phase === 'running' && (
        <div className="write">
          <div className="dialog__body">
            <p className="write__progress">
              <span role="status">{progressLabel(progress.done, progress.chunk, progress.total)}</span>
              {/* La durée change chaque seconde : hors de la zone annoncée, un lecteur d'écran la lirait sans fin. */}
              <span className="write__elapsed" aria-hidden="true">
                {elapsedLabel(seconds)}
              </span>
            </p>
            <progress className="write__bar" max={progress.total} value={progress.done} aria-label="Diapositives traitées" />
            <p className="field-help">
              Réponse par {progress.engine}.{written > 0 && ` ${plural(written, 'texte déjà enregistré', 'textes déjà enregistrés')}.`}
              {progress.slow ? ' Un petit modèle local peut prendre plusieurs dizaines de secondes par diapositive.' : ' Jusqu’à douze diapositives par appel.'}
            </p>
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn" ref={stopButton} onClick={stop} disabled={stopping}>
              <Square aria-hidden />
              {stopping ? 'Arrêt…' : 'Arrêter'}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="write">
          <div className="dialog__body">
            <p className="write__result" role="status">
              {merged ? resultLabel(merged) : 'Aucun texte rédigé'}
            </p>
            {(stopped || failure !== null) && <p className="write__note">{untouchedNotice(progress.total, progress.done, stopped) || (stopped ? 'Rédaction arrêtée.' : '')}</p>}
            {written > 0 && <p className="write__note">Chaque texte est daté et marqué de son moteur ; « Phrase automatique », en mode « Modifier », le retire.</p>}
            {kept.length > 0 && (
              <>
                <p className="label write__kept-title">{kept.length === 1 ? 'Une diapositive garde son texte' : `${kept.length} diapositives gardent leur texte`}</p>
                <ul className="write__kept">
                  {kept.map((line) => (
                    <li key={line.slide_id}>
                      <span className="write__kept-n">{line.n > 0 ? line.n : '—'}</span>
                      <span className="write__kept-name">{line.title}</span>
                      <span className="write__kept-reason">{line.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="dialog__actions">
            <p className="dialog-message" role="alert">
              {failure}
            </p>
            <button type="button" className="btn btn--primary" ref={closeButton} onClick={() => onClose(stopped || failure !== null)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
