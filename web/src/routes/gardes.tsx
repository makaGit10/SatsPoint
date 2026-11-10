import { Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import type { RoleBoutique } from '@/api/types'
import { destinationDeconnexion, deuxFaAActiver, deuxFaAValider, estSuperAdmin, peut, useAuth } from '@/auth/store'
import { notifier } from '@/composants/toastStore'
import { cheminAccueil } from '@/coquille/navigation'
import { SqueletteApplication } from '@/coquille/SqueletteEcran'
import { langueChoisie } from '@/lib/stockage'
import { Landing } from './ecrans'
import { suiteSure } from './navigation'

/**
 * `/` : page de présentation pour les visiteurs ; une personne connectée va directement à son espace
 * (en passant par le choix de la langue si elle ne l'a pas encore fait).
 */
export function Aiguillage() {
  const { statut, utilisateur } = useAuth()
  if (statut === 'inconnu') return <SqueletteApplication />
  if (statut === 'connecte') {
    if (!langueChoisie()) return <Navigate to="/langue" replace />
    return <Navigate to={cheminAccueil(utilisateur)} replace />
  }
  return (
    <Suspense fallback={<SqueletteApplication />}>
      <Landing />
    </Suspense>
  )
}

/** Écrans réservés aux personnes non connectées (connexion, inscription…). */
export function RequiertInvite() {
  const { statut, utilisateur } = useAuth()
  const [params] = useSearchParams()
  if (!langueChoisie()) return <Navigate to="/langue" replace />
  if (statut === 'inconnu') return <SqueletteApplication />
  if (statut === 'connecte') {
    // Connexion ou inscription réussie : la session est appliquée avant que l'écran ne navigue lui-même,
    // c'est donc cette garde qui honore `?suite=` (chemin interne uniquement) et la double authentification.
    const vers = suiteSure(params.get('suite')) ?? cheminAccueil(utilisateur)
    if (utilisateur?.deux_fa?.active && !utilisateur.deux_fa.validee) return <Navigate to={`/verification-2fa?suite=${encodeURIComponent(vers)}`} replace />
    return <Navigate to={vers} replace />
  }
  return <Outlet />
}

/** Session obligatoire ; sinon connexion avec retour (`?suite=`). Double authentification active → vérification d'abord. */
export function RequiertSession() {
  const { statut, utilisateur } = useAuth()
  const { pathname, search } = useLocation()
  if (statut === 'inconnu') return <SqueletteApplication />
  const suite = encodeURIComponent(`${pathname}${search}`)
  if (statut === 'anonyme') return <Navigate to={destinationDeconnexion() ?? `/connexion?suite=${suite}`} replace />
  if (deuxFaAValider(utilisateur) && pathname !== '/verification-2fa') return <Navigate to={`/verification-2fa?suite=${suite}`} replace />
  return <Outlet />
}

/**
 * Espace boutique : une personne sans boutique (super-admin compris) va au démarrage guidé. Le super-admin n'y voit
 * que SA boutique : l'API ne sert que la boutique dont on est membre.
 */
export function RequiertBoutique() {
  const utilisateur = useAuth((s) => s.utilisateur)
  const { pathname } = useLocation()
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

/** `/demarrage` : la personne sans boutique (création) ou le propriétaire ; gérant et caissier n'y ont rien à faire. */
export function RequiertDemarrage() {
  const utilisateur = useAuth((s) => s.utilisateur)
  if (utilisateur?.boutique && !peut(utilisateur, ['proprietaire'])) return <AccesRefuse vers={cheminAccueil(utilisateur)} />
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
