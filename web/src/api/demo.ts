import { http } from './client'
import type { ReponseUtilisateur } from './types'

export type ProfilDemo = 'proprietaire' | 'gerant' | 'caissier'
export interface CompteDemo {
  profil: ProfilDemo
  nom: string
  actuel: boolean
}

/** Accès rapide du jury (serveur avec DEMO_CONNEXION_RAPIDE) : liste vide si désactivé (404) ou injoignable. */
export function lireProfilsDemo(): Promise<CompteDemo[]> {
  return http.get<{ profils: CompteDemo[] }>('/auth/demo/profils', { publique: true }).then((r) => r?.profils ?? []).catch(() => [])
}

export function connexionDemo(profil: ProfilDemo) {
  return http.post<ReponseUtilisateur>('/auth/demo/connexion', { profil }, { publique: true })
}
