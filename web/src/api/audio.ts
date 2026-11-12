import { http } from './client'
import type { LangueAudio, ManifesteAudio } from './types'

export const CLE_MANIFESTE = (langue: LangueAudio) => ['audio', 'manifeste', langue] as const

/**
 * Toujours revalidé auprès du serveur (`no-cache` + ETag → 304 sans corps) : la réponse est publique et gardée 60 s
 * par le navigateur ; sans cela, la relecture qui suit une publication au studio pourrait recevoir l'ancienne version.
 */
export function chargerManifeste(langue: LangueAudio) {
  return http.get<ManifesteAudio>(`/api/v1/audio/manifeste/${langue}`, { publique: true, cache: 'no-cache' })
}
