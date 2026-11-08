import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { RecuPublic } from './types'

export type Recu = RecuPublic

/** Reçu public (`GET /r/{jeton}`, Accept: application/json) — contrat § 5, aucune donnée personnelle. */
export function useRecu(jeton: string | undefined) {
  return useQuery({
    queryKey: ['recu', jeton],
    queryFn: () => http.get<RecuPublic>(`/r/${encodeURIComponent(jeton ?? '')}`, { publique: true }),
    enabled: Boolean(jeton),
    staleTime: 60_000,
    retry: false,
  })
}
