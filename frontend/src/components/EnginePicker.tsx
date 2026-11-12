// « Moteur : Auto · Ollama · Claude » (docs/SUITE.md §5.2 d'Atelier Projets) : le choix, le modèle du moteur qui
// répondra, et la ligne bouclier qui dit exactement ce qui part. Hors ligne, « Claude » est grisé avec l'explication.
// Règles dans lib/engine.ts ; l'état des moteurs vient du Hub (lib/ai-status.ts).

import { CloudOff, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useId } from 'react'

import {
  answering,
  CLAUDE_MODEL_LABELS,
  claudeBlocked,
  effectiveChoice,
  effectiveEngine,
  ENGINE_CHOICES,
  engineTrouble,
  modelSize,
  sends,
  type EnginePrefs,
} from '../lib/engine.ts'
import { CLAUDE_MODELS, type AiStatus, type ClaudeModel, type SlideKind } from '../lib/types.ts'

export function EnginePicker({
  prefs,
  onChange,
  status,
  error,
  loading,
  kinds,
  onRecheck,
}: {
  prefs: EnginePrefs
  onChange: (prefs: EnginePrefs) => void
  /** null tant que le Hub n'a pas dit l'état des moteurs. */
  status: AiStatus | null
  /** Pourquoi cet état n'a pas pu être lu. */
  error: string | null
  loading: boolean
  /** Sorte de chaque diapositive à rédiger : la ligne bouclier nomme ce qu'elles montrent. */
  kinds: readonly SlideKind[]
  onRecheck: () => void
}) {
  const ids = { label: useId(), blocked: useId(), model: useId() }
  const shown = effectiveChoice(prefs.engine, status)
  const engine = effectiveEngine(prefs.engine, status)
  const blocked = status ? claudeBlocked(status) : null
  const trouble = status ? engineTrouble(prefs, status) : null
  const unread = status === null && !loading ? `L’état des moteurs n’a pas pu être lu${error ? ` : ${error}` : '.'}` : null
  const warning = trouble ?? unread
  const sent = status ? sends(kinds, status.max_chars, engine) : null

  return (
    <div className="engine">
      <span id={ids.label} className="label">
        Moteur
      </span>
      <div className="segmented engine__choices" role="group" aria-labelledby={ids.label}>
        {ENGINE_CHOICES.map((option) => {
          const off = option.id === 'claude' && (status === null || blocked !== null)
          return (
            <button key={option.id} type="button" aria-pressed={shown === option.id} disabled={off} aria-describedby={off && blocked ? ids.blocked : undefined} onClick={() => onChange({ ...prefs, engine: option.id })}>
              {option.label}
            </button>
          )
        })}
      </div>
      {blocked !== null && (
        <p id={ids.blocked} className="engine__note">
          <CloudOff aria-hidden />
          <span>Claude est grisé. {blocked}</span>
        </p>
      )}

      {status && engine === 'claude' && (
        <div className="engine__model">
          <label className="label" htmlFor={ids.model}>
            Modèle
          </label>
          <select id={ids.model} className="field" value={prefs.claudeModel} onChange={(e) => onChange({ ...prefs, claudeModel: e.target.value as ClaudeModel })}>
            {CLAUDE_MODELS.map((model) => (
              <option key={model} value={model}>
                {CLAUDE_MODEL_LABELS[model]}
              </option>
            ))}
          </select>
        </div>
      )}
      {status && engine === 'ollama' && status.ollama.reachable && (
        <div className="engine__model">
          <label className="label" htmlFor={ids.model}>
            Modèle
          </label>
          <select id={ids.model} className="field" value={prefs.ollamaModel ?? ''} onChange={(e) => onChange({ ...prefs, ollamaModel: e.target.value || null })}>
            <option value="">
              Celui du Hub ({status.ollama.default_model}
              {status.ollama.default_installed ? '' : ', non installé'})
            </option>
            {status.ollama.models.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name}
                {modelSize(model.size) && ` · ${modelSize(model.size)}`}
              </option>
            ))}
            {prefs.ollamaModel !== null && !status.ollama.models.some((model) => model.name === prefs.ollamaModel) && <option value={prefs.ollamaModel}>{prefs.ollamaModel} (non installé)</option>}
          </select>
        </div>
      )}

      <div className="engine__shield" data-tone={warning ? 'warning' : undefined}>
        {warning ? <TriangleAlert aria-hidden /> : <ShieldCheck aria-hidden />}
        {warning ? (
          <p role="alert">{warning}</p>
        ) : status && sent ? (
          <div className="engine__sends">
            <p>
              Réponse par {answering(prefs, status)}. {sent.lead}
            </p>
            {sent.items.length > 0 && (
              <ul>
                {sent.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {sent.tail && <p>{sent.tail}</p>}
          </div>
        ) : (
          <p>Lecture de l’état des moteurs…</p>
        )}
        {warning && (
          <button type="button" className="btn btn--sm" onClick={onRecheck} disabled={loading}>
            Vérifier à nouveau
          </button>
        )}
      </div>
    </div>
  )
}
