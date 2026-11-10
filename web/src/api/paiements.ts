import { http } from './client'
import type { CorpsCreationVente, MethodePaiement, Operateur, Paiement, ReponsePaiement, Vente } from './types'

/**
 * Caisse et paiements (contrat § 3). Module séparé de `ventes.ts` (liste, pagination, export) pour que la caisse
 * — premier écran — n'embarque pas le code de la liste paginée.
 */

export const CLE_VENTES = ['ventes'] as const
export const CLE_PAIEMENTS = ['paiements'] as const
export const clePaiement = (ulid: string) => ['paiements', ulid] as const

export function creerVente(corps: CorpsCreationVente) {
  return http.post<{ vente: Vente }>('/ventes', corps)
}

/** Nouvelle tentative (changement de méthode ou demande expirée) : les tentatives en attente passent à `annule`. */
/** `moyen` : ulid du moyen du pays (méthode `moyen_pays`, CONTRAT_API § 14.4). */
export function nouvelleTentative(venteUlid: string, methode: MethodePaiement, operateur?: Operateur, moyen?: string) {
  return http.post<{ paiement: Paiement }>(`/ventes/${venteUlid}/paiements`, { methode, ...(operateur ? { operateur } : {}), ...(moyen ? { moyen } : {}) })
}

/** Seule source de vérité du statut : relu à chaque signal temps réel et toutes les 3 s en secours. */
export function lirePaiement(ulid: string, signal?: AbortSignal) {
  return http.get<ReponsePaiement>(`/paiements/${ulid}`, { signal })
}

export function verifierPaiement(ulid: string) {
  return http.post<ReponsePaiement>(`/paiements/${ulid}/verifier`)
}

export function simulerPaiement(ulid: string) {
  return http.post<{ paiement: Paiement }>(`/paiements/${ulid}/simuler`)
}

export function confirmerManuellement(ulid: string) {
  return http.post<{ paiement: Paiement; vente: Vente }>(`/paiements/${ulid}/confirmer-manuellement`, { confirmation: true })
}

export function annulerVente(ulid: string) {
  return http.post<{ vente: Vente }>(`/ventes/${ulid}/annuler`)
}
