import type Echo from 'laravel-echo'
import { http } from '@/api/client'
import type { Config } from '@/api/types'

/**
 * Connexion temps réel unique pour toute l'application (Laravel Echo + Reverb).
 * - créée une seule fois, jamais recréée au renouvellement de session : l'autorisation des canaux
 *   relit les cookies et le jeton CSRF à chaque (re)connexion ;
 * - reconnexion automatique (pusher-js) + relance si le serveur refuse ;
 * - chargée à la demande (hors du JavaScript initial).
 */
type EchoReverb = Echo<'reverb'>

let instance: EchoReverb | null = null
let promesse: Promise<EchoReverb> | null = null
let relance: ReturnType<typeof setTimeout> | null = null
let fermetureVoulue = false

interface CanalAutorisable {
  name: string
}
type RappelAutorisation = (erreur: Error | null, donnees: unknown) => void

export async function obtenirEcho(reverb: Config['reverb']): Promise<EchoReverb> {
  if (instance) return instance
  promesse ??= (async () => {
    const [{ default: EchoClasse }, { default: Pusher }] = await Promise.all([import('laravel-echo'), import('pusher-js')])
    ;(window as unknown as { Pusher: unknown }).Pusher = Pusher

    const echo = new EchoClasse({
      broadcaster: 'reverb',
      key: reverb.cle,
      wsHost: reverb.hote,
      wsPort: reverb.port,
      wssPort: reverb.port,
      forceTLS: reverb.schema === 'https',
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      withCredentials: true,
      authEndpoint: '/broadcasting/auth',
      // Autorisation via notre client : cookies de session + X-XSRF-TOKEN relus à chaque appel.
      authorizer: (canal: CanalAutorisable) => ({
        authorize: (socketId: string, rappel: RappelAutorisation) => {
          http
            .post<unknown>('/broadcasting/auth', { socket_id: socketId, channel_name: canal.name }, { publique: true })
            .then((donnees) => rappel(null, donnees))
            .catch((erreur: unknown) => rappel(erreur instanceof Error ? erreur : new Error('autorisation refusée'), null))
        },
      }),
    } as unknown as ConstructorParameters<typeof EchoClasse>[0]) as EchoReverb

    surveillerConnexion(echo)
    fermetureVoulue = false
    instance = echo
    return echo
  })()
  try {
    return await promesse
  } finally {
    promesse = null
  }
}

/** Relance la connexion si le serveur la refuse ou si elle tombe sans raison. */
function surveillerConnexion(echo: EchoReverb) {
  const pusher = (echo.connector as unknown as { pusher?: { connection?: { bind: (ev: string, cb: (etat: unknown) => void) => void }; connect: () => void } }).pusher
  if (!pusher?.connection) return
  let tentatives = 0
  pusher.connection.bind('state_change', (etat) => {
    const courant = (etat as { current?: string }).current
    if (courant === 'connected') {
      tentatives = 0
      return
    }
    if ((courant === 'failed' || courant === 'disconnected' || courant === 'unavailable') && !fermetureVoulue && relance === null) {
      const delai = Math.min(30_000, 1000 * 2 ** Math.min(tentatives, 5))
      tentatives += 1
      relance = setTimeout(() => {
        relance = null
        if (!fermetureVoulue) pusher.connect()
      }, delai)
    }
  })
}

export function echoCourant(): EchoReverb | null {
  return instance
}

/** Déconnexion volontaire (changement d'utilisateur). */
export function fermerEcho() {
  fermetureVoulue = true
  if (relance !== null) {
    clearTimeout(relance)
    relance = null
  }
  instance?.disconnect()
  instance = null
}
