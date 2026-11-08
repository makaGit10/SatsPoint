import { create } from 'zustand'
import { definirGestionnaireNonAuthentifie } from '@/api/client'
import { CLE_MOI } from '@/api/moi'
import type { RoleBoutique, Utilisateur } from '@/api/types'
import { queryClient } from '@/lib/queryClient'
import { allerVers, cheminCourant, estCheminPublic } from '@/routes/navigation'

export type StatutSession = 'inconnu' | 'connecte' | 'anonyme'

interface EtatAuth {
  utilisateur: Utilisateur | null
  statut: StatutSession
  definir: (utilisateur: Utilisateur | null) => void
  effacer: () => void
}

export const useAuth = create<EtatAuth>((set) => ({
  utilisateur: null,
  statut: 'inconnu',
  definir: (utilisateur) => set({ utilisateur, statut: utilisateur ? 'connecte' : 'anonyme' }),
  effacer: () => set({ utilisateur: null, statut: 'anonyme' }),
}))

/** ULID de l'utilisateur courant (pour ignorer ses propres signaux temps réel). */
export function monUlid(): string | null {
  return useAuth.getState().utilisateur?.ulid ?? null
}

export function estSuperAdmin(u: Utilisateur | null | undefined) {
  return u?.role_plateforme === 'super_admin'
}

export function roleBoutique(u: Utilisateur | null | undefined): RoleBoutique | null {
  return u?.boutique?.role ?? null
}

/** Le rôle a-t-il accès à une rubrique réservée ? (refus par défaut) */
export function peut(u: Utilisateur | null | undefined, roles: readonly RoleBoutique[]): boolean {
  const role = roleBoutique(u)
  return role !== null && roles.includes(role)
}

// Un 401 sur une route privée : la session est tombée → on nettoie et on renvoie vers la connexion.
definirGestionnaireNonAuthentifie(() => {
  const etat = useAuth.getState()
  if (etat.statut !== 'anonyme') etat.effacer()
  queryClient.setQueryData(CLE_MOI, null)
  const chemin = cheminCourant()
  if (!estCheminPublic(chemin)) {
    allerVers(`/connexion?suite=${encodeURIComponent(chemin)}`, { replace: true })
  }
})
