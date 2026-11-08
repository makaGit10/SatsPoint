import type { SignalDonnees } from '@/api/types'

/**
 * Bus interne des signaux temps réel. Les canaux Echo y publient ; `useDonneesEnDirect` y écoute.
 * Le signal ne contient jamais de donnée métier : rubrique, auteur, horodatage, canal.
 */
export interface SignalRecu extends SignalDonnees {
  canal: string
}

type Ecouteur = (signal: SignalRecu) => void

const ecouteurs = new Set<Ecouteur>()

export function ecouterSignaux(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur)
  return () => {
    ecouteurs.delete(ecouteur)
  }
}

export function emettreSignal(signal: SignalRecu) {
  for (const ecouteur of [...ecouteurs]) {
    try {
      ecouteur(signal)
    } catch (erreur) {
      console.error('[temps réel] écouteur en erreur', erreur)
    }
  }
}

/** Nombre d'écouteurs actifs (tests). */
export function nombreEcouteurs() {
  return ecouteurs.size
}
