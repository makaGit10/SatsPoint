import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { http } from './client'
import { telecharger } from './telechargement'
import type { FormatExport } from './exports'
import type { FiltresVentes, PageVentes, Vente } from './types'

// Caisse et paiements (création, tentatives, lecture du statut…) : `./paiements` — réexportés ici pour les écrans qui lisent les deux.
export { annulerVente, CLE_PAIEMENTS, CLE_VENTES, clePaiement, confirmerManuellement, creerVente, lirePaiement, nouvelleTentative, simulerPaiement, verifierPaiement } from './paiements'

export const cleVente = (ulid: string) => ['ventes', 'detail', ulid] as const

export function chargerVente(ulid: string) {
  return http.get<{ vente: Vente }>(`/ventes/${ulid}`)
}

export function useVente(ulid: string | null | undefined) {
  return useQuery({
    queryKey: cleVente(ulid ?? ''),
    queryFn: () => chargerVente(ulid!),
    enabled: Boolean(ulid),
    select: (r) => r.vente,
  })
}

/** Ventes par page (liste compacte, lisible au téléphone) — même valeur que le défaut du serveur. */
export const VENTES_PAR_PAGE = 20

export function parametresVentes(filtres: FiltresVentes): URLSearchParams {
  const p = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') p.set(cle, String(valeur))
  }
  return p
}

export function chargerVentes(filtres: FiltresVentes, page = 1, parPage = VENTES_PAR_PAGE) {
  const p = parametresVentes(filtres)
  p.set('page', String(page))
  p.set('par_page', String(parPage))
  return http.get<PageVentes>(`/ventes?${p}`)
}

/**
 * Liste paginée par numéro de page (CONTRAT_API § 13). Pendant le changement de page ou de filtre,
 * la page précédente reste affichée (pas de liste vidée) ; le rechargement en direct relit la page courante.
 */
export function useVentes(filtres: FiltresVentes, page: number, parPage = VENTES_PAR_PAGE) {
  return useQuery({
    queryKey: ['ventes', 'liste', filtres, page, parPage],
    queryFn: () => chargerVentes(filtres, page, parPage),
    placeholderData: keepPreviousData,
  })
}

/** Export respectant les filtres en cours (CSV, Excel, PDF). Téléchargé via fetch pour garder les cookies de session. */
export function exporterVentes(filtres: FiltresVentes, format: FormatExport = 'csv'): Promise<void> {
  const p = parametresVentes(filtres)
  p.set('format', format)
  return telecharger(`/exports/ventes?${p}`, `ventes-${new Date().toISOString().slice(0, 10)}.${format}`)
}
