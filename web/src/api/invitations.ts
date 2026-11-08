import { http } from './client'
import type { InvitationPublique, ReponseUtilisateur } from './types'

export function lireInvitation(jeton: string) {
  return http.get<{ invitation: InvitationPublique }>(`/invitations/${encodeURIComponent(jeton)}`, { publique: true })
}

export function accepterInvitation(jeton: string) {
  return http.post<ReponseUtilisateur>(`/invitations/${encodeURIComponent(jeton)}/accepter`)
}
