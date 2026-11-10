// API utilisée par l'interface : le serveur du Hub, ou l'aperçu figé en mode « demo ».
// MODE est remplacé à la compilation : la branche inutile (et snapshot.json hors démo) disparaît du paquet.
import { httpApi, type HubApi } from './api.ts'
import { demoApi } from './demo.ts'

export const api: HubApi = import.meta.env.MODE === 'demo' ? demoApi : httpApi
