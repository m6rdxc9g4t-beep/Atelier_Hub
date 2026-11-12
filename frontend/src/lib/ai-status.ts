// État des moteurs d'IA et mode en ligne, partagés par l'interrupteur de la barre haute et le choix du moteur : une
// seule lecture (`GET /api/ai/status`), un seul endroit qui change le mode (`PUT /api/settings/online-mode`).
// Jamais demandé en aperçu : l'IA y est désactivée.

import { useSyncExternalStore } from 'react'

import { api } from './hub-api.ts'
import type { AiStatus } from './types.ts'

export interface AiState {
  /** null tant que le Hub n'a pas répondu. */
  status: AiStatus | null
  /** Pourquoi la dernière lecture a échoué ; null si elle a abouti. */
  error: string | null
  loading: boolean
  /** Le mode en ligne est en train de changer. */
  switching: boolean
}

let state: AiState = { status: null, error: null, loading: false, switching: false }
const listeners = new Set<() => void>()
let seq = 0

function set(patch: Partial<AiState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

/** Relit l'état des moteurs. `refresh` : Claude est revérifié sans attendre la fin de son cache (Ollama l'est toujours). */
export async function loadAiStatus(refresh = false): Promise<void> {
  const mine = ++seq
  set({ loading: true })
  try {
    const status = await api.aiStatus(refresh)
    if (mine === seq) set({ status, error: null, loading: false })
  } catch (error) {
    if (mine === seq) set({ error: (error as Error).message, loading: false })
  }
}

/** Passe « En ligne » ou « Hors ligne », puis relit l'état (Claude n'est interrogé qu'en ligne). L'échec est rendu à l'appelant. */
export async function setOnlineMode(online: boolean): Promise<void> {
  set({ switching: true })
  try {
    const saved = await api.setOnline(online)
    // Le mode est dit tout de suite ; l'état de Claude suit avec la relecture.
    if (state.status) set({ status: { ...state.status, online: saved.online, auto: saved.online ? state.status.auto : 'ollama' } })
    await loadAiStatus()
  } finally {
    set({ switching: false })
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAiStatus(): AiState {
  return useSyncExternalStore(subscribe, () => state)
}
