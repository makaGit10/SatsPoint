import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { RoleBoutique } from '@/api/types'
import { deuxFaAActiver, deuxFaAValider, estSuperAdmin, peut, useAuth } from '@/auth/store'
import { notifier } from '@/composants/toastStore'
import { cheminAccueil } from '@/coquille/navigation'
import { SqueletteApplication } from '@/coquille/SqueletteEcran'
import { langueChoisie } from '@/lib/stockage'

/** `/` : aiguille vers la langue, l'accueil ou l'espace de la personne. */
export function Aiguillage() {
  const { statut, utilisateur } = useAuth()
  if (!langueChoisie()) return <Navigate to="/langue" replace />
  if (statut === 'inconnu') return <SqueletteApplication />
  return <Navigate to={cheminAccueil(utilisateur)} replace />
}

/** Écrans réservés aux personnes non connectées (connexion, inscription…). */
export function RequiertInvite() {
  const { statut, utilisateur } = useAuth()
  if (!langueChoisie()) return <Navigate to="/langue" replace />
  if (statut === 'inconnu') return <SqueletteApplication />
  if (statut === 'connecte') return <Navigate to={cheminAccueil(utilisateur)} replace />
  return <Outlet />
}

/** Session obligatoire ; sinon connexion avec retour (`?suite=`). Double authentification active → vérification d'abord. */
export function RequiertSession() {
  const { statut, utilisateur } = useAuth()
  const { pathname, search } = useLocation()
  if (statut === 'inconnu') return <SqueletteApplication />
  const suite = encodeURIComponent(`${pathname}${search}`)
  if (statut === 'anonyme') return <Navigate to={`/connexion?suite=${suite}`} replace />
  if (deuxFaAValider(utilisateur) && pathname !== '/verification-2fa') return <Navigate to={`/verification-2fa?suite=${suite}`} replace />
  return <Outlet />
}

/**
 * Espace boutique : un super-admin est renvoyé vers sa console, une personne sans boutique vers le démarrage guidé.
 */
export function RequiertBoutique() {
  const utilisateur = useAuth((s) => s.utilisateur)
  const { pathname } = useLocation()
  if (estSuperAdmin(utilisateur)) return <Navigate to="/admin" replace />
  if (!utilisateur?.boutique && pathname !== '/demarrage') return <Navigate to="/demarrage" replace />
  return <Outlet />
}

function AccesRefuse({ vers }: { vers: string }) {
  const { t } = useTranslation()
  useEffect(() => {
    notifier({ type: 'erreur', titre: t('erreurs.accesRefuse'), voix: 'erreurs.accesRefuse' })
  }, [t])
  return <Navigate to={vers} replace />
}

/** Rôle de boutique requis (refus par défaut). */
export function RequiertRole({ roles }: { roles: readonly RoleBoutique[] }) {
  const utilisateur = useAuth((s) => s.utilisateur)
  if (!peut(utilisateur, roles)) return <AccesRefuse vers={cheminAccueil(utilisateur)} />
  return <Outlet />
}

/** `/admin/*` : super-admin uniquement, double authentification activée puis validée (refus par défaut). */
export function RequiertSuperAdmin() {
  const utilisateur = useAuth((s) => s.utilisateur)
  const { pathname } = useLocation()
  if (!estSuperAdmin(utilisateur)) return <AccesRefuse vers={cheminAccueil(utilisateur)} />
  if (deuxFaAActiver(utilisateur) || !utilisateur?.deux_fa) return <Navigate to={`/securite/2fa?suite=${encodeURIComponent(pathname)}`} replace />
  if (deuxFaAValider(utilisateur)) return <Navigate to={`/verification-2fa?suite=${encodeURIComponent(pathname)}`} replace />
  return <Outlet />
}
