import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Outlet, ScrollRestoration, useNavigate, useRouteError } from 'react-router-dom'
import { useSynchroSession } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { useToasts } from '@/composants/toastStore'
import { SqueletteApplication } from '@/coquille/SqueletteEcran'
import { LecteurAudio } from '@/voix/LecteurAudio'
import { definirNavigateur } from './navigation'

// L'affichage des notifications n'est chargé qu'à la première notification.
const Toasts = lazy(() => import('@/composants/Toast').then((m) => ({ default: m.Toasts })))

/** Racine : synchronise la session, expose la navigation hors React, monte le lecteur audio et les notifications. */
export function Racine() {
  const navigate = useNavigate()
  const aDesToasts = useToasts((s) => s.toasts.length > 0)
  useSynchroSession()
  useEffect(() => {
    definirNavigateur((vers, options) => navigate(vers, options))
    return () => definirNavigateur(null)
  }, [navigate])

  return (
    <>
      <Suspense fallback={<SqueletteApplication />}>
        <Outlet />
      </Suspense>
      <LecteurAudio />
      {aDesToasts && (
        <Suspense fallback={null}>
          <Toasts />
        </Suspense>
      )}
      <ScrollRestoration />
    </>
  )
}

/** Erreur de rendu ou de chargement d'un morceau : message générique, retour à l'accueil (rechargement complet). */
export function ErreurRacine() {
  const { t } = useTranslation()
  const erreur = useRouteError()
  const introuvable = isRouteErrorResponse(erreur) && erreur.status === 404
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-fond px-6 text-center" data-ecran="erreur">
      <p className="text-lg font-semibold text-texte">{introuvable ? t('introuvable.titre') : t('erreurs.inattendue')}</p>
      <Bouton variante="secondaire" onClick={() => window.location.assign('/')}>
        {t('introuvable.retour')}
      </Bouton>
    </div>
  )
}
