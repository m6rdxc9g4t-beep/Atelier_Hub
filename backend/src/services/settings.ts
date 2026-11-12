// Réglages du Hub. Seul endroit qui écrit dans `settings` (migration 4).
// Mode en ligne (docs/SUITE.md §5.1) : hors ligne par défaut. Hors ligne, rien ne part vers Claude. Seul
// l'utilisateur le change, par `PUT /api/settings/online-mode` (gardes Host / Origin de toute écriture) : aucune
// autre route, aucune IA ne passe le Hub en ligne.

import type { Db } from '../db/database.js'

export const OFFLINE_MESSAGE = 'Mode hors ligne : rien ne part vers Claude. Passe « En ligne » (en haut de la page) pour l’utiliser.'

const ONLINE = 'online_mode'

/** En ligne ? Faux tant que rien n'est enregistré, et pour toute valeur illisible. */
export function isOnline(db: Db): boolean {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(ONLINE) as { value: string } | undefined
  if (!row) return false
  try {
    return JSON.parse(row.value) === true
  } catch {
    return false
  }
}

export function setOnline(db: Db, online: boolean): { online: boolean } {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(ONLINE, JSON.stringify(online === true))
  return { online: isOnline(db) }
}
