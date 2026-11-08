import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { Equipe, Invitation, Membre, RoleBoutique } from './types'

export const CLE_EQUIPE = ['equipe'] as const

export function useEquipe(actif = true) {
  return useQuery({ queryKey: CLE_EQUIPE, queryFn: () => http.get<Equipe>('/equipe'), enabled: actif })
}

export function inviter(contact: string, role: RoleBoutique) {
  return http.post<{ invitation: Invitation }>('/equipe/invitations', { contact, role })
}

export function annulerInvitation(ulid: string) {
  return http.delete<null>(`/equipe/invitations/${ulid}`)
}

export function modifierMembre(ulid: string, corps: { role?: RoleBoutique; actif?: boolean }) {
  return http.patch<{ membre: Membre }>(`/equipe/${ulid}`, corps)
}

export function retirerMembre(ulid: string) {
  return http.delete<null>(`/equipe/${ulid}`)
}
