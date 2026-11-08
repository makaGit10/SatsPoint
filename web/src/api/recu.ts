import { useQuery } from '@tanstack/react-query'
import { http } from './client'

/**
 * Reçu public (`GET /r/{jeton}`, Accept: application/json). Le détail des champs n'est pas encore figé
 * par le contrat : cette forme est une hypothèse de travail à aligner avec le back.
 */
export interface Recu {
  numero: string
  montant_xof: number
  sats: number | null
  methode: 'lightning' | 'mobile_money'
  statut: 'payee' | 'en_attente' | 'annulee' | 'expiree'
  paye_le: string | null
  boutique: { nom: string; ville: string }
  message: string | null
}

export function useRecu(jeton: string | undefined) {
  return useQuery({
    queryKey: ['recu', jeton],
    queryFn: () => http.get<Recu>(`/r/${encodeURIComponent(jeton ?? '')}`, { publique: true }),
    enabled: Boolean(jeton),
    staleTime: 60_000,
    retry: false,
  })
}
