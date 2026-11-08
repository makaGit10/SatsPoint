import { http } from './client'
import type { GroupeRecherche } from './types'

export const CLE_RECENTES = ['recherche', 'recentes'] as const

export function rechercher(q: string, signal?: AbortSignal) {
  return http.get<{ groupes: GroupeRecherche[] }>(`/recherche?q=${encodeURIComponent(q)}`, signal ? { signal } : undefined)
}

export function chargerRecentes() {
  return http.get<{ recentes: string[] }>('/recherche/recentes')
}

export function memoriserRecherche(terme: string) {
  return http.post<unknown>('/recherche/recentes', { terme })
}

export function effacerRecentes() {
  return http.delete<null>('/recherche/recentes')
}
