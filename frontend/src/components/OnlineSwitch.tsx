// Interrupteur « Hors ligne / En ligne » de la barre haute (docs/SUITE.md §5.1 d'Atelier Projets). Hors ligne par
// défaut : rien ne part vers Claude. Seul toi le changes, ici ; aucune IA ne passe le Hub en ligne. Seul l'état
// « En ligne » est signalé (un état nominal reste neutre). Absent de l'aperçu : l'IA y est désactivée.

import { Cloud, HardDrive } from 'lucide-react'
import { useEffect } from 'react'

import { loadAiStatus, setOnlineMode, useAiStatus } from '../lib/ai-status.ts'
import { useUi } from './ui.tsx'

export function OnlineSwitch() {
  const { toast } = useUi()
  const { status, error, switching } = useAiStatus()

  useEffect(() => {
    void loadAiStatus()
  }, [])

  const online = status?.online ?? false
  const toggle = () => {
    setOnlineMode(!online).catch((failure: Error) => toast(`Le mode n’a pas changé : ${failure.message}`, 'danger'))
  }
  const title =
    status === null
      ? (error ?? 'Lecture du mode…')
      : online
        ? 'En ligne : Claude peut rédiger, avec ce que la ligne bouclier annonce. Clique pour repasser hors ligne.'
        : 'Hors ligne : rien ne part vers Claude. Clique pour autoriser Claude.'

  return (
    <button type="button" role="switch" className="online-switch" aria-checked={online} aria-busy={switching || undefined} disabled={status === null || switching} title={title} onClick={toggle}>
      {online ? <Cloud aria-hidden /> : <HardDrive aria-hidden />}
      {online ? 'En ligne' : 'Hors ligne'}
    </button>
  )
}
