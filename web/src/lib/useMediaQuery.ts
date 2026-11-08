import { useSyncExternalStore } from 'react'

/** Vrai si la requête média correspond (mise à jour en direct). */
export function useMediaQuery(requete: string): boolean {
  return useSyncExternalStore(
    (rappel) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
      const mq = window.matchMedia(requete)
      mq.addEventListener?.('change', rappel)
      return () => mq.removeEventListener?.('change', rappel)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(requete).matches : false),
    () => false,
  )
}

/** Bureau / tablette paysage (≥ 768 px, point de rupture `md`). */
export function useEstBureau(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
