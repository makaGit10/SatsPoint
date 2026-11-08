import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { Cours } from './types'

export const CLE_COURS = ['cours'] as const
/** Le cours est rafraîchi toutes les 60 s (cahier § 7.1). */
export const RAFRAICHISSEMENT_COURS = 60_000

export function chargerCours() {
  return http.get<Cours>('/cours')
}

/** Cours BTC/XOF courant : rafraîchi en silence toutes les 60 s tant que l'écran est affiché. */
export function useCours(actif = true) {
  return useQuery({
    queryKey: CLE_COURS,
    queryFn: chargerCours,
    staleTime: RAFRAICHISSEMENT_COURS,
    refetchInterval: actif ? RAFRAICHISSEMENT_COURS : false,
    refetchIntervalInBackground: false,
    enabled: actif,
  })
}
