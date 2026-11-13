// Choix du moteur d'IA (« Moteur : Auto · Ollama · Claude », docs/SUITE.md §5.2 d'Atelier Projets) et ligne bouclier.
// Règles pures, testées. Le Hub décide seul et refuse Claude hors ligne ; ces fonctions disent à l'avance ce qui va
// se passer, et l'interface demande ensuite au Hub exactement le moteur qu'elle a annoncé (`engineRequest`) : jamais
// « Auto », qui pourrait retenir un autre moteur que celui dont la ligne bouclier vient de parler.

import { CLAUDE_MODELS, SLIDE_KINDS, type AiEngineName, type AiStatus, type ClaudeModel, type EngineChoice, type SlideKind, type WriteResult } from './types.ts'

export const ENGINE_CHOICES: readonly { id: EngineChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'claude', label: 'Claude' },
]

export const ENGINE_NAMES: Readonly<Record<AiEngineName, string>> = { ollama: 'Ollama', claude: 'Claude' }
export const CLAUDE_MODEL_LABELS: Readonly<Record<ClaudeModel, string>> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' }

/** « Ollama (llama3.2:1b) », « Claude (Sonnet) » : les modèles de Claude sont des alias, dits avec leur majuscule. */
export function engineLabel(engine: AiEngineName, model: string | null): string {
  const name = model && engine === 'claude' ? (CLAUDE_MODEL_LABELS[model as ClaudeModel] ?? model.charAt(0).toUpperCase() + model.slice(1)) : model
  return `${ENGINE_NAMES[engine]}${name ? ` (${name})` : ''}`
}

// ─── Préférences ─────────────────────────────────────────────────

export interface EnginePrefs {
  engine: EngineChoice
  /** Modèle d'Ollama choisi ; null : celui du Hub (OLLAMA_MODEL). */
  ollamaModel: string | null
  claudeModel: ClaudeModel
}

/** Clé du stockage local où le choix du moteur est mémorisé. */
export const PREFS_KEY = 'atelier-hub:ia'
export const DEFAULT_PREFS: EnginePrefs = { engine: 'auto', ollamaModel: null, claudeModel: 'sonnet' }

const safeChoice = (value: unknown): EngineChoice => ENGINE_CHOICES.find((option) => option.id === value)?.id ?? DEFAULT_PREFS.engine
const safeClaudeModel = (value: unknown): ClaudeModel => CLAUDE_MODELS.find((model) => model === value) ?? DEFAULT_PREFS.claudeModel
/** Nom de modèle plausible (« qwen2.5-coder:7b », « hf.co/org/modele:Q4_K_M »), 100 caractères au plus comme l'admet le Hub. */
const safeOllamaModel = (value: unknown): string | null => (typeof value === 'string' && value.length <= 100 && /^[\w.:/@+-]+$/.test(value) ? value : null)

/**
 * Préférences mémorisées. Le stockage se modifie à la main et peut manquer (navigation privée) : chaque valeur est
 * validée, une valeur inconnue ou illisible reprend son défaut (Auto, modèle du Hub, Sonnet).
 */
export function readPrefs(storage: Pick<Storage, 'getItem'>): EnginePrefs {
  try {
    const saved: unknown = JSON.parse(storage.getItem(PREFS_KEY) ?? 'null')
    const values = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}
    return { engine: safeChoice(values.engine), ollamaModel: safeOllamaModel(values.ollamaModel), claudeModel: safeClaudeModel(values.claudeModel) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writePrefs(storage: Pick<Storage, 'setItem'>, prefs: EnginePrefs): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* stockage indisponible : le choix vaut pour cette fenêtre */
  }
}

// ─── Ce qui va répondre ──────────────────────────────────────────

/** Pourquoi « Claude » est grisé ; null : il peut être choisi. Tant que l'état est inconnu, il reste grisé. */
export function claudeBlocked(status: AiStatus | null): string | null {
  if (!status) return 'L’état de Claude n’est pas encore connu.'
  if (!status.online) return 'Hors ligne : rien ne part vers Claude. Passe « En ligne », en haut de la page, pour l’utiliser.'
  // Les raisons du Hub n'ont pas toutes leur point final.
  if (!status.claude.available) return (status.claude.error ?? 'Claude n’est pas disponible').replace(/([^.!?…])$/, '$1.')
  return null
}

/** Choix affiché : un « Claude » mémorisé retombe sur « Auto » tant qu'il ne peut pas répondre (hors ligne, absent). */
export function effectiveChoice(choice: EngineChoice, status: AiStatus | null): EngineChoice {
  return choice === 'claude' && claudeBlocked(status) !== null ? 'auto' : choice
}

/** Moteur qui répondra — Auto : Claude si le Hub est en ligne et Claude disponible, sinon Ollama. Hors ligne : toujours Ollama. */
export function effectiveEngine(choice: EngineChoice, status: AiStatus | null): AiEngineName {
  const shown = effectiveChoice(choice, status)
  if (shown !== 'auto') return shown
  return status?.online && status.claude.available && status.auto === 'claude' ? 'claude' : 'ollama'
}

/** Modèle d'Ollama qui répondra : celui choisi, sinon celui du Hub. */
export function ollamaModel(prefs: Pick<EnginePrefs, 'ollamaModel'>, status: AiStatus): string {
  return prefs.ollamaModel ?? status.ollama.default_model
}

/** Pourquoi le moteur qui répondrait ne peut pas répondre maintenant ; null : il est prêt. */
export function engineTrouble(prefs: EnginePrefs, status: AiStatus): string | null {
  // Claude ne répond que disponible (`effectiveEngine`) : indisponible, il est grisé et c'est Ollama qui est jugé ici.
  if (effectiveEngine(prefs.engine, status) === 'claude') return null
  const { ollama } = status
  if (!ollama.reachable) return ollama.error ?? 'Ollama ne répond pas.'
  const model = ollamaModel(prefs, status)
  const installed = prefs.ollamaModel === null ? ollama.default_installed : ollama.models.some((m) => m.name === model)
  if (installed) return null
  const others = ollama.models.length > 0 ? ', ou choisis un modèle installé' : ''
  return `Modèle absent d’Ollama (${model}) : installe-le avec « ollama pull ${model} »${others}.`
}

/** « Ollama (llama3.2:1b) », « Claude (Sonnet) » : ce qui répondra. */
export function answering(prefs: EnginePrefs, status: AiStatus): string {
  return effectiveEngine(prefs.engine, status) === 'claude' ? engineLabel('claude', prefs.claudeModel) : engineLabel('ollama', ollamaModel(prefs, status))
}

/**
 * Accès de Claude dit à côté de « Réponse par … » : « forfait par jeton » quand le Hub utilise le jeton du
 * forfait (serveur sans session `claude`) ; null sinon. Le jeton lui-même n'arrive jamais jusqu'ici.
 */
export function claudeAccess(prefs: EnginePrefs, status: AiStatus): string | null {
  return effectiveEngine(prefs.engine, status) === 'claude' && status.claude.mode === 'token' ? 'forfait par jeton' : null
}

/**
 * Champs d'une demande de rédaction : le moteur annoncé, nommé — jamais « auto ». Si l'état a changé entre-temps
 * (Hub repassé hors ligne, Claude déconnecté), le Hub refuse avec sa raison au lieu de répondre par un autre moteur
 * que celui dont la ligne bouclier vient de parler.
 */
export function engineRequest(prefs: EnginePrefs, status: AiStatus | null): { engine: AiEngineName; model?: string; claude_model?: ClaudeModel } {
  if (effectiveEngine(prefs.engine, status) === 'claude') return { engine: 'claude', claude_model: prefs.claudeModel }
  return prefs.ollamaModel === null ? { engine: 'ollama' } : { engine: 'ollama', model: prefs.ollamaModel }
}

/** « 7 textes rédigés · Ollama (llama3.2:1b) », « Aucun texte rédigé · Claude (Sonnet) ». */
export function resultLabel(result: Pick<WriteResult, 'engine' | 'model' | 'written'>): string {
  const n = result.written.length
  const texts = n === 0 ? 'Aucun texte rédigé' : n === 1 ? '1 texte rédigé' : `${n} textes rédigés`
  return `${texts} · ${engineLabel(result.engine, result.model)}`
}

/** Taille d'un modèle sur le disque : « 1,3 Go », « 640 Mo » (vide si elle est inconnue). */
export function modelSize(bytes: number): string {
  if (!(bytes > 0)) return ''
  const giga = bytes / 1e9
  return giga >= 1 ? `${giga.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${Math.max(1, Math.round(bytes / 1e6))} Mo`
}

// ─── Ligne bouclier ──────────────────────────────────────────────
// Ce qui part vers une IA est ce que les diapositives choisies affichent (`slideFacts` de backend/src/domain/facts.ts
// ne lit que leur partie vivante), plus les faits généraux et les consignes. La ligne le dit par sorte.

/** Ce qui part avec toute demande, quelles que soient les diapositives (`generalFacts`, et le titre de chacune). */
export const ALWAYS_SENT = ['le nom et la description de la fiche', 'ses chiffres clés', 'le titre de chaque diapositive'] as const

/**
 * Ce que montre une diapositive de chaque sorte, donc ce qui part pour elle en plus de `ALWAYS_SENT`. null : rien de
 * plus (les chiffres clés partent toujours), ou jamais rédigée (texte libre). Le typage impose de n'oublier aucune
 * sorte : une sorte ajoutée au Hub ne compile pas tant que sa ligne manque ici.
 */
export const KIND_SENDS: Readonly<Record<SlideKind, string | null>> = {
  title: 'le titre de la présentation',
  summary: 'la synthèse (avancement, éléments en cours et bloqués, prochaine échéance, nombre de pages, de rapports, de tables, de conversions et de sources)',
  kpis: null,
  features: 'les noms, statuts, avancements, heures et échéances des features',
  active: 'les noms, types, statuts et échéances des éléments en cours',
  milestones: 'les noms et dates des jalons, atteints ou non',
  wiki: 'les titres et dates des pages du Wiki (jamais leur contenu)',
  viz: 'les noms, tailles et dates des rapports de Viz',
  tab: 'les noms, projets, nombres de lignes et dates des tables de Tab',
  convert: 'les noms, natures, tables de destination et dates des conversions',
  nexus: 'les noms des agents de Nexus, avec les apps qu’ils lisent ou leur description',
  sources: 'les noms et sortes des sources (jamais leurs adresses, leurs chemins ni leurs notes)',
  text: null,
}

export interface Sends {
  /** Phrase d'introduction (elle suffit quand rien ne part). */
  lead: string
  /** Ce qui part, une chose par entrée ; vide quand rien ne quitte la machine. */
  items: string[]
  /** Borne de ce qui part en un appel ; vide quand rien ne part. */
  tail: string
}

/**
 * Ce qui part pour ces diapositives (`kinds` : la sorte de chaque diapositive à rédiger). Avec Ollama, rien ne quitte
 * la machine qui héberge le Hub ; vers Claude, la liste de ce qui part, par sorte, dans l'ordre des sortes, chacune
 * dite une fois.
 */
export function sends(kinds: readonly SlideKind[], maxChars: number, engine: AiEngineName): Sends {
  if (engine === 'ollama') return { lead: 'Avec Ollama, rien ne quitte la machine qui héberge le Hub.', items: [], tail: '' }
  if (kinds.length === 0) return { lead: 'Rien à rédiger dans cette sélection : rien ne part vers Claude.', items: [], tail: '' }
  const chosen = new Set(kinds)
  const shown = kinds.length === 1 ? 'ce que montre la diapositive choisie' : `ce que montrent les ${kinds.length} diapositives choisies`
  return {
    lead: `Vers Claude part seulement ${shown} :`,
    items: [...ALWAYS_SENT, ...SLIDE_KINDS.flatMap((kind) => (chosen.has(kind) && KIND_SENDS[kind] ? [KIND_SENDS[kind]] : [])), 'les consignes que tu écris ici'],
    tail: `${maxChars.toLocaleString('fr-FR')} caractères au plus par appel.`,
  }
}

/** Ligne bouclier, en une phrase : exactement ce qui part pour ces diapositives. */
export function sendsLine(kinds: readonly SlideKind[], maxChars: number, engine: AiEngineName): string {
  const { lead, items, tail } = sends(kinds, maxChars, engine)
  return items.length === 0 ? lead : `${lead} ${items.join(' ; ')}. ${tail}`
}
