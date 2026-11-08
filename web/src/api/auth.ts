import { http } from './client'
import type { DonneesConnexion, DonneesInscription, DonneesReinitialisation, ReponseUtilisateur } from './types'

export function inscrire(donnees: DonneesInscription) {
  return http.post<ReponseUtilisateur>('/auth/inscription', donnees, { publique: true })
}

export function connecter(donnees: DonneesConnexion) {
  return http.post<ReponseUtilisateur>('/auth/connexion', donnees, { publique: true })
}

export function deconnecter() {
  return http.post<null>('/auth/deconnexion', undefined, { publique: true })
}

export function demanderReinitialisation(identifiant: string) {
  return http.post<null>('/auth/mot-de-passe/oubli', { identifiant }, { publique: true })
}

export function reinitialiserMotDePasse(donnees: DonneesReinitialisation) {
  return http.post<null>('/auth/mot-de-passe/reinitialisation', donnees, { publique: true })
}
