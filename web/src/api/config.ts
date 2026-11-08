import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { Config } from './types'

export const CLE_CONFIG = ['config'] as const

export function chargerConfig() {
  return http.get<Config>('/config', { publique: true })
}

/** Configuration publique (nom, mode démo, Reverb, langues). Mise en cache longue. */
export function useConfig() {
  return useQuery({
    queryKey: CLE_CONFIG,
    queryFn: chargerConfig,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  })
}
