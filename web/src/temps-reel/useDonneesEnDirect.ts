import { useEffect, useRef } from 'react'
import { monUlid } from '@/auth/store'
import { ecouterSignaux, type SignalRecu } from './signaux'
import { saisieEnCours } from './useSaisieEnCours'

/** Fenêtre de regroupement : plusieurs signaux rapprochés → un seul rechargement. */
export const DELAI_REGROUPEMENT = 800
/** Nouvel essai quand une saisie est en cours. */
export const DELAI_SAISIE = 1000

/**
 * Hook unique du temps réel (DIRECTIVES § 3 / A.2) :
 * - écoute les rubriques demandées et appelle `recharger` (rechargement silencieux : à brancher sur
 *   `queryClient.invalidateQueries`, qui ne vide jamais le cache) ;
 * - ignore ses propres modifications (`auteur === moi.ulid`) ;
 * - regroupe les signaux sur ~800 ms ;
 * - attend que l'onglet soit visible ;
 * - ne recharge jamais pendant une saisie (réessaie chaque seconde).
 */
export function useDonneesEnDirect(rubriques: readonly string[], recharger: () => unknown) {
  const refRecharger = useRef(recharger)
  useEffect(() => {
    refRecharger.current = recharger
  }, [recharger])

  const cleRubriques = rubriques.join('|')

  useEffect(() => {
    const ensemble = new Set(cleRubriques.split('|').filter(Boolean))
    if (ensemble.size === 0) return

    let actif = true
    let minuterie: ReturnType<typeof setTimeout> | null = null
    let attendVisibilite = false

    const executer = () => {
      minuterie = null
      if (!actif) return
      if (document.visibilityState === 'hidden') {
        attendVisibilite = true
        return
      }
      if (saisieEnCours()) {
        minuterie = setTimeout(executer, DELAI_SAISIE)
        return
      }
      try {
        const resultat = refRecharger.current()
        if (resultat instanceof Promise) resultat.catch(() => undefined)
      } catch {
        /* en cas d'erreur, on garde ce qui est affiché */
      }
    }

    const planifier = () => {
      if (minuterie !== null || attendVisibilite) return
      minuterie = setTimeout(executer, DELAI_REGROUPEMENT)
    }

    const surSignal = (signal: SignalRecu) => {
      if (!ensemble.has(signal.rubrique)) return
      const moi = monUlid()
      if (signal.auteur && moi && signal.auteur === moi) return
      planifier()
    }

    const surVisibilite = () => {
      if (document.visibilityState === 'visible' && attendVisibilite) {
        attendVisibilite = false
        executer()
      }
    }

    const desabonner = ecouterSignaux(surSignal)
    document.addEventListener('visibilitychange', surVisibilite)

    return () => {
      actif = false
      desabonner()
      document.removeEventListener('visibilitychange', surVisibilite)
      if (minuterie !== null) clearTimeout(minuterie)
    }
  }, [cleRubriques])
}
