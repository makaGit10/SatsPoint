import { useEffect } from 'react'
import { useConfig } from '@/api/config'
import { CLE_MOI } from '@/api/moi'
import { useAuth } from '@/auth/store'
import { queryClient } from '@/lib/queryClient'
import { invaliderManifestes } from '@/voix/useManifesteAudio'
import { abonnerCanaux } from './abonnements'
import { fermerEcho, obtenirEcho } from './echo'
import { ecouterSignaux } from './signaux'

const MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true'

/**
 * Monte la connexion temps réel pour la personne connectée et abonne ses canaux.
 * Les rubriques transverses sont traitées ici : `audios` → relecture des manifestes,
 * `preferences` → relecture de `/moi`.
 */
export function TempsReel() {
  const { data: config } = useConfig()
  const utilisateur = useAuth((s) => s.utilisateur)
  const ulid = utilisateur?.ulid ?? null
  const boutiqueUlid = utilisateur?.boutique?.ulid ?? null
  const superAdmin = utilisateur?.role_plateforme === 'super_admin'
  const reverb = config?.reverb

  useEffect(() => {
    if (!reverb || !ulid || MOCK) return
    let annule = false
    let desabonner: (() => void) | null = null

    obtenirEcho(reverb)
      .then((echo) => {
        if (annule) return
        desabonner = abonnerCanaux(echo, { boutiqueUlid, utilisateurUlid: ulid, superAdmin })
      })
      .catch((erreur: unknown) => {
        console.warn('[temps réel] connexion impossible', erreur)
      })

    return () => {
      annule = true
      desabonner?.()
    }
  }, [reverb, ulid, boutiqueUlid, superAdmin])

  // Déconnexion → on ferme la connexion (changement d'identité ; pas un simple renouvellement de session).
  useEffect(() => {
    if (ulid === null) fermerEcho()
  }, [ulid])

  useEffect(() => {
    return ecouterSignaux((signal) => {
      if (signal.rubrique === 'audios') invaliderManifestes()
      if (signal.rubrique === 'preferences' || signal.rubrique === 'sessions') void queryClient.invalidateQueries({ queryKey: CLE_MOI })
    })
  }, [])

  return null
}
