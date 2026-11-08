import { http } from './client'
import type { EtatDeuxFa, InitialisationDeuxFa, Utilisateur } from './types'

/** Le back peut renvoyer `{ utilisateur }` ou seulement `{ deux_fa }` : le front relit `/moi` dans les deux cas. */
export interface ReponseDeuxFa {
  utilisateur?: Utilisateur
  deux_fa?: EtatDeuxFa
}

export function initialiserDeuxFa() {
  return http.post<InitialisationDeuxFa>('/auth/2fa/initialiser')
}

export function activerDeuxFa(code: string) {
  return http.post<ReponseDeuxFa & { codes_secours: string[] }>('/auth/2fa/activer', { code })
}

export function verifierDeuxFa(code: string) {
  return http.post<ReponseDeuxFa & { codes_secours_restants?: number }>('/auth/2fa/verifier', { code })
}

export function desactiverDeuxFa(password: string) {
  return http.delete<null>('/auth/2fa', { corps: { password } })
}
