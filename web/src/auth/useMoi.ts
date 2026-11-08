import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connecter, deconnecter, demanderReinitialisation, inscrire, reinitialiserMotDePasse } from '@/api/auth'
import { CLE_MOI, chargerMoi, enregistrerPreferences } from '@/api/moi'
import type { DonneesConnexion, DonneesInscription, DonneesReinitialisation, Preferences, Utilisateur } from '@/api/types'
import { changerLocale } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { useVoix } from '@/voix/store'
import { useAuth } from './store'

/** Session courante : `data` = utilisateur, `null` si anonyme, `undefined` tant que c'est inconnu. */
export function useMoi() {
  return useQuery({
    queryKey: CLE_MOI,
    queryFn: chargerMoi,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/**
 * Propage la session dans le store auth et applique les préférences du compte
 * (langue, thème, voix) à l'appareil. À monter une seule fois à la racine.
 */
export function useSynchroSession() {
  const { data, isSuccess, isError } = useMoi()
  const definir = useAuth((s) => s.definir)

  useEffect(() => {
    if (isSuccess) {
      definir(data ?? null)
      if (data) appliquerPreferences(data.preferences)
    } else if (isError) {
      definir(null)
    }
  }, [data, isSuccess, isError, definir])
}

function appliquerPreferences(p: Preferences) {
  changerLocale(p.locale)
  useTheme.getState().definir(p.theme)
  const voix = useVoix.getState()
  voix.definirLangue(p.langue_audio)
  voix.definirActivee(p.aide_vocale)
}

function useAppliquerSession() {
  const client = useQueryClient()
  const definir = useAuth((s) => s.definir)
  return (utilisateur: Utilisateur | null) => {
    client.setQueryData(CLE_MOI, utilisateur)
    definir(utilisateur)
    if (utilisateur) appliquerPreferences(utilisateur.preferences)
  }
}

export function useConnexion() {
  const appliquer = useAppliquerSession()
  return useMutation({
    mutationFn: (donnees: DonneesConnexion) => connecter(donnees),
    onSuccess: ({ utilisateur }) => appliquer(utilisateur),
  })
}

export function useInscription() {
  const appliquer = useAppliquerSession()
  return useMutation({
    mutationFn: (donnees: DonneesInscription) => inscrire(donnees),
    onSuccess: ({ utilisateur }) => appliquer(utilisateur),
  })
}

export function useDeconnexion() {
  const client = useQueryClient()
  const effacer = useAuth((s) => s.effacer)
  return useMutation({
    mutationFn: deconnecter,
    onSettled: () => {
      effacer()
      client.setQueryData(CLE_MOI, null)
      // On vide les données métier mais on garde la config publique et les manifestes audio.
      client.removeQueries({ predicate: (q) => !['config', 'audio'].includes(String(q.queryKey[0])) })
    },
  })
}

export function useDemandeReinitialisation() {
  return useMutation({ mutationFn: (identifiant: string) => demanderReinitialisation(identifiant) })
}

export function useReinitialisation() {
  return useMutation({ mutationFn: (donnees: DonneesReinitialisation) => reinitialiserMotDePasse(donnees) })
}

/** Enregistre une préférence côté serveur si connecté ; l'appareil est déjà à jour (optimiste). */
export function useEnregistrerPreferences() {
  const client = useQueryClient()
  const definir = useAuth((s) => s.definir)
  return useMutation({
    mutationFn: (p: Partial<Preferences>) => enregistrerPreferences(p),
    onSuccess: ({ utilisateur }) => {
      client.setQueryData(CLE_MOI, utilisateur)
      definir(utilisateur)
    },
  })
}
