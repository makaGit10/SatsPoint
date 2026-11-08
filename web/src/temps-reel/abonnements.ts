import type { SignalDonnees } from '@/api/types'
import { emettreSignal } from './signaux'

export const EVENEMENT = '.donnees.modifiees'

/** Sous-ensemble d'Echo utilisé ici (permet un faux Echo dans les tests). */
export interface CanalMinimal {
  listen(evenement: string, rappel: (donnees: unknown) => void): unknown
  stopListening(evenement: string, rappel?: (donnees: unknown) => void): unknown
}
export interface EchoMinimal {
  private(nom: string): CanalMinimal
  channel(nom: string): CanalMinimal
  leave(nom: string): void
}

export interface CiblesAbonnement {
  boutiqueUlid?: string | null
  utilisateurUlid?: string | null
  superAdmin?: boolean
}

function estSignal(valeur: unknown): valeur is SignalDonnees {
  return Boolean(valeur) && typeof valeur === 'object' && typeof (valeur as SignalDonnees).rubrique === 'string'
}

/**
 * Abonne les canaux de la personne connectée et republie chaque signal sur le bus interne.
 * Retourne la fonction de désabonnement.
 */
export function abonnerCanaux(echo: EchoMinimal, cibles: CiblesAbonnement): () => void {
  const nettoyages: Array<() => void> = []

  const brancher = (nom: string, prive: boolean) => {
    const canal = prive ? echo.private(nom) : echo.channel(nom)
    const rappel = (donnees: unknown) => {
      if (!estSignal(donnees)) return
      emettreSignal({
        rubrique: donnees.rubrique,
        auteur: donnees.auteur ?? null,
        horodatage: donnees.horodatage ?? new Date().toISOString(),
        canal: nom,
      })
    }
    canal.listen(EVENEMENT, rappel)
    nettoyages.push(() => {
      canal.stopListening(EVENEMENT, rappel)
      echo.leave(nom)
    })
  }

  if (cibles.boutiqueUlid) brancher(`boutique.${cibles.boutiqueUlid}`, true)
  if (cibles.utilisateurUlid) brancher(`user.${cibles.utilisateurUlid}`, true)
  if (cibles.superAdmin) brancher('admin', true)
  brancher('plateforme', false)

  return () => {
    for (const nettoyer of nettoyages.splice(0)) nettoyer()
  }
}
