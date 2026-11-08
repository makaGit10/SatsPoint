import { QueryClient } from '@tanstack/react-query'
import { ErreurApi } from '@/api/client'

/** Client TanStack Query unique (utilisé aussi hors React : annonces vocales, temps réel). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (tentatives, erreur) => {
        if (erreur instanceof ErreurApi && !erreur.reseau && erreur.statut < 500) return false
        return tentatives < 2
      },
    },
    mutations: { retry: false },
  },
})
