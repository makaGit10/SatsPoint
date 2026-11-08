import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { ErreurApi } from '@/api/client'
import { clePaiement, lirePaiement, verifierPaiement } from '@/api/paiements'
import type { ReponsePaiement } from '@/api/types'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'

/** Vérification périodique de secours tant que la tentative est en attente (cahier § 6.4 : 2–3 s). */
export const INTERVALLE_SECOURS = 3000

export type EtatSuivi = 'chargement' | 'en_attente' | 'reussi' | 'expire' | 'annule' | 'echoue' | 'introuvable' | 'erreur'

/** L'écran ne décide jamais qu'un paiement est payé : seul le serveur le dit (`vente.statut === 'payee'`). */
export function deriverEtat(donnees: ReponsePaiement | undefined, erreur: unknown, chargement: boolean): EtatSuivi {
  if (donnees) {
    if (donnees.vente.statut === 'payee' || donnees.paiement.statut === 'reussi') return 'reussi'
    if (donnees.vente.statut === 'annulee') return 'annule'
    switch (donnees.paiement.statut) {
      case 'en_attente':
        return 'en_attente'
      case 'expire':
        return 'expire'
      case 'echoue':
        return 'echoue'
      default:
        return donnees.vente.statut === 'expiree' ? 'expire' : 'annule'
    }
  }
  if (erreur instanceof ErreurApi) return erreur.statut === 404 ? 'introuvable' : 'erreur'
  if (erreur) return 'erreur'
  return chargement ? 'chargement' : 'erreur'
}

/**
 * Machine d'état de l'écran de paiement :
 * - lit `GET /paiements/{ulid}` ;
 * - relit à chaque signal temps réel `paiements` / `ventes` (rechargement silencieux) ;
 * - secours : relit toutes les 3 s tant que la tentative est `en_attente` ;
 * - `verifier()` force la consultation (`POST /paiements/{ulid}/verifier`).
 */
export function useSuiviPaiement(ulid: string | undefined, options: { intervalle?: number } = {}) {
  const intervalle = options.intervalle ?? INTERVALLE_SECOURS
  const cle = clePaiement(ulid ?? '')

  const requete = useQuery({
    queryKey: cle,
    queryFn: ({ signal }) => lirePaiement(ulid!, signal),
    enabled: Boolean(ulid),
    staleTime: 0,
    gcTime: 60_000,
    retry: (n, e) => !(e instanceof ErreurApi && e.statut < 500) && n < 2,
    refetchInterval: (q) => (q.state.data?.paiement.statut === 'en_attente' && q.state.data.vente.statut === 'en_attente' ? intervalle : false),
    refetchIntervalInBackground: false,
  })

  const recharger = useCallback(() => {
    if (ulid) void queryClient.invalidateQueries({ queryKey: clePaiement(ulid) })
  }, [ulid])
  useDonneesEnDirect(['paiements', 'ventes'], recharger)

  const verification = useMutation({
    mutationFn: () => verifierPaiement(ulid!),
    onSuccess: (donnees) => queryClient.setQueryData(cle, donnees),
  })

  const etat = deriverEtat(requete.data, requete.error, requete.isPending)

  return {
    etat,
    paiement: requete.data?.paiement ?? null,
    vente: requete.data?.vente ?? null,
    verifier: verification.mutateAsync,
    verificationEnCours: verification.isPending,
    recharger,
  }
}
