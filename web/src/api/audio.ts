import { http } from './client'
import type { LangueAudio, ManifesteAudio } from './types'

export const CLE_MANIFESTE = (langue: LangueAudio) => ['audio', 'manifeste', langue] as const

export function chargerManifeste(langue: LangueAudio) {
  return http.get<ManifesteAudio>(`/api/v1/audio/manifeste/${langue}`, { publique: true })
}
