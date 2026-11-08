import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { http } from './client'
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

export function parametresVentes(filtres: FiltresVentes, curseur?: string | null): URLSearchParams {
  const p = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') p.set(cle, String(valeur))
  }
  if (curseur) p.set('curseur', curseur)
  return p
}

export function chargerVentes(filtres: FiltresVentes, curseur?: string | null) {
  return http.get<PageVentes>(`/ventes?${parametresVentes(filtres, curseur)}`)
}

/** Liste paginée par curseur (« voir plus ») ; les pages chargées sont conservées lors d'un rechargement silencieux. */
export function useVentes(filtres: FiltresVentes) {
  return useInfiniteQuery({
    queryKey: ['ventes', 'liste', filtres],
    queryFn: ({ pageParam }) => chargerVentes(filtres, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (derniere) => derniere.curseur_suivant,
    placeholderData: (precedent) => precedent,
  })
}

/** Export respectant les filtres en cours (CSV en P0). Téléchargé via fetch pour garder les cookies de session. */
export async function exporterVentes(filtres: FiltresVentes, format: 'csv' | 'xlsx' | 'pdf' = 'csv'): Promise<void> {
  const p = parametresVentes(filtres)
  p.set('format', format)
  const reponse = await fetch(`/api/v1/exports/ventes?${p}`, { credentials: 'include', headers: { Accept: 'text/csv, */*' } })
  if (!reponse.ok) throw new Error(`export ${reponse.status}`)
  const blob = await reponse.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ventes-${new Date().toISOString().slice(0, 10)}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
