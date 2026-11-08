import { ErreurApi, http } from './client'
import type { Preferences, ReponseUtilisateur, Utilisateur } from './types'

export const CLE_MOI = ['moi'] as const

/** Utilisateur connecté, ou `null` si la session n'existe pas (401 attendu, sans redirection). */
export async function chargerMoi(): Promise<Utilisateur | null> {
  try {
    const reponse = await http.get<ReponseUtilisateur>('/moi', { publique: true })
    return reponse.utilisateur
  } catch (erreur) {
    if (erreur instanceof ErreurApi && erreur.estNonAuthentifie) return null
    throw erreur
  }
}

export function enregistrerPreferences(preferences: Partial<Preferences>) {
  return http.patch<ReponseUtilisateur>('/moi/preferences', preferences)
}
