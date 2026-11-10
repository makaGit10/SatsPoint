import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { bornerPage, lirePage, nombrePages, tranche, type InfosPagination } from './pagination'

/**
 * Numéro de page porté par l'adresse (`?page=2`) : la page survit au rechargement et au retour arrière.
 * `allerA` ajoute une entrée d'historique (le bouton retour revient à la page précédente) ;
 * `remplacer` corrige l'adresse sans nouvelle entrée (page 1 après un filtre, page qui n'existe plus).
 */
export function usePageUrl(param = 'page') {
  const [params, setParams] = useSearchParams()
  const page = lirePage(params.get(param))

  const allerA = useCallback(
    (numero: number, options: { remplacer?: boolean } = {}) => {
      setParams(
        (actuels) => {
          const suivants = new URLSearchParams(actuels)
          if (numero <= 1) suivants.delete(param)
          else suivants.set(param, String(Math.trunc(numero)))
          return suivants
        },
        { replace: options.remplacer ?? false },
      )
    },
    [param, setParams],
  )
  const reinitialiser = useCallback(() => allerA(1, { remplacer: true }), [allerA])

  return { page, allerA, reinitialiser }
}

/**
 * Liste paginée par le serveur : si la page demandée n'existe plus (lignes supprimées, autre écran),
 * le serveur renvoie une page vide avec le vrai nombre de pages ; on revient alors à la dernière.
 */
export function useCorrectionPage(pagination: InfosPagination | undefined, allerA: (page: number, options?: { remplacer?: boolean }) => void) {
  const horsLimites = pagination ? pagination.page > pagination.pages : false
  const derniere = pagination?.pages ?? 1
  useEffect(() => {
    if (horsLimites) allerA(derniere, { remplacer: true })
  }, [horsLimites, derniere, allerA])
}

/**
 * Pagination côté écran d'une liste déjà chargée (articles, équipe, studio) : recherche et filtres
 * s'appliquent AVANT (on passe la liste filtrée). La page est bornée et l'adresse corrigée si besoin.
 */
export function usePaginationLocale<T>(elements: readonly T[] | undefined, { parPage = 20, param = 'page' }: { parPage?: number; param?: string } = {}) {
  const { page: demandee, allerA, reinitialiser } = usePageUrl(param)
  const total = elements?.length ?? 0
  const pages = nombrePages(total, parPage)
  // Tant que la liste n'est pas chargée, on garde la page demandée (pas de retour intempestif à 1).
  const page = elements ? bornerPage(demandee, pages) : demandee

  useEffect(() => {
    if (elements && page !== demandee) allerA(page, { remplacer: true })
  }, [elements, page, demandee, allerA])

  const visibles = useMemo(() => tranche(elements ?? [], page, parPage), [elements, page, parPage])

  return { visibles, page, pages, total, parPage, debut: (page - 1) * parPage, allerA, reinitialiser }
}
