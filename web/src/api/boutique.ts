import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { BoutiqueDetail, ReglagesBoutique, Utilisateur } from './types'

export const CLE_BOUTIQUE = ['boutique'] as const

export function chargerBoutique() {
  return http.get<{ boutique: BoutiqueDetail }>('/boutique')
}

/** Boutique courante (réglages, moyens actifs, PayTech). Rubrique temps réel : `parametres`. */
export function useBoutique(actif = true) {
  return useQuery({ queryKey: CLE_BOUTIQUE, queryFn: chargerBoutique, enabled: actif, select: (r) => r.boutique, staleTime: 60_000 })
}

export interface ModificationBoutique {
  nom?: string
  telephone?: string | null
  ville?: string
  reglages?: Partial<ReglagesBoutique>
  paiement_test?: true
}

/** Création de la boutique (démarrage guidé, étape 1) — ajout au contrat § 8. */
export function creerBoutique(corps: { nom: string; telephone?: string | null; ville: string }) {
  return http.post<{ boutique: BoutiqueDetail; utilisateur: Utilisateur }>('/boutique', corps)
}

export function modifierBoutique(corps: ModificationBoutique) {
  return http.patch<{ boutique: BoutiqueDetail }>('/boutique', corps)
}

export function enregistrerPaytech(corps: { api_key?: string; api_secret?: string; environnement: 'test' | 'prod' }) {
  return http.put<{ configure: boolean; environnement: 'test' | 'prod' }>('/boutique/paytech', corps)
}

export function supprimerPaytech() {
  return http.delete<null>('/boutique/paytech')
}

export function verifierPaytech() {
  return http.post<{ ok: boolean; message: string }>('/boutique/paytech/verifier')
}
