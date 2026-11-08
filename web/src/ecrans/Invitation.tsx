import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarClock, Check, LogIn, MailX, Store, UserPlus, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { accepterInvitation, lireInvitation } from '@/api/invitations'
import { useAuth } from '@/auth/store'
import { appliquerUtilisateur } from '@/auth/useMoi'
import { Bouton, BoutonLien } from '@/composants/Bouton'
import { EtatVide } from '@/composants/EtatVide'
import { SqueletteTexte } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { cheminAccueil } from '@/coquille/navigation'
import { ErreurFormulaire, TitreAuth } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { formaterDateHeure } from '@/lib/format'
import { HautParleur } from '@/voix/HautParleur'

/** Invitation à rejoindre une boutique (lien reçu par SMS / WhatsApp) : boutique, rôle, contact masqué, puis acceptation. */
export default function Invitation() {
  const { t, i18n } = useTranslation()
  const { jeton = '' } = useParams()
  const navigate = useNavigate()
  const messageErreur = useMessageErreur()
  const { statut, utilisateur } = useAuth()
  const [erreur, setErreur] = useState<string | null>(null)
  const requete = useQuery({ queryKey: ['invitation', jeton], queryFn: () => lireInvitation(jeton), retry: false, select: (r) => r.invitation })
  const invitation = requete.data
  const expiree = requete.error instanceof ErreurApi && (requete.error.statut === 410 || requete.error.code === 'INVITATION_EXPIREE')
  const suite = encodeURIComponent(`/invitation/${jeton}`)

  const acceptation = useMutation({
    mutationFn: () => accepterInvitation(jeton),
    onSuccess: ({ utilisateur: u }) => {
      appliquerUtilisateur(u)
      notifier({ type: 'succes', titre: t('invitation.bienvenue', { boutique: u.boutique?.nom ?? invitation?.boutique.nom ?? '' }), voix: 'invitation.bienvenue' })
      navigate(cheminAccueil(u), { replace: true })
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.code === 'DEJA_MEMBRE') setErreur(t('invitation.dejaMembre'))
      // 403 : le compte connecté n'est pas le contact invité.
      else if (e instanceof ErreurApi && e.estInterdit && !e.code?.startsWith('BOUTIQUE_')) setErreur(t('invitation.memeContact'))
      else setErreur(messageErreur(e))
    },
  })

  return (
    <MiseEnPageInvite ecran="invitation">
      {requete.isPending ? (
        <div data-chargement="invitation" aria-busy="true">
          <SqueletteTexte lignes={5} />
        </div>
      ) : requete.isError || !invitation ? (
        <EtatVide
          ton="neutre"
          icone={<MailX />}
          titre={expiree ? t('invitation.expiree.titre') : t('invitation.invalide.titre')}
          texte={expiree ? t('invitation.expiree.texte') : t('invitation.invalide.texte')}
          action={
            <BoutonLien to="/accueil" variante="secondaire" voix="invitation.retourAccueil">
              {t('invitation.retourAccueil')}
            </BoutonLien>
          }
        />
      ) : (
        <>
          <TitreAuth titre={t('invitation.titre')} sousTitre={t('invitation.sousTitre')} voix="invitation.titre" />
          <dl className="mb-4 divide-y divide-bordure rounded-lg border border-bordure bg-surface" data-invitation>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Store size={18} className="shrink-0 text-accent-texte" aria-hidden="true" />
              <dt className="sr-only">{t('invitation.boutique')}</dt>
              <dd className="min-w-0 flex-1 truncate text-base font-semibold text-texte">{invitation.boutique.nom}</dd>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <UserRound size={18} className="shrink-0 text-texte-3" aria-hidden="true" />
              <dt className="text-sm text-texte-3">{t('invitation.role')}</dt>
              <dd className="ml-auto flex items-center gap-1 text-sm font-medium text-texte">
                {t(`roles.${invitation.role}`)}
                <HautParleur cle={`roles.${invitation.role}`} />
              </dd>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <LogIn size={18} className="shrink-0 text-texte-3" aria-hidden="true" />
              <dt className="text-sm text-texte-3">{t('invitation.pour')}</dt>
              <dd className="ml-auto font-mono text-sm text-texte tabulaire">{invitation.contact_masque}</dd>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <CalendarClock size={18} className="shrink-0 text-texte-3" aria-hidden="true" />
              <dt className="text-sm text-texte-3">{t('invitation.expire')}</dt>
              <dd className="ml-auto text-sm text-texte tabulaire">{formaterDateHeure(invitation.expire_le, i18n.language?.startsWith('en') ? 'en' : 'fr')}</dd>
            </div>
          </dl>
          <p className="mb-4 text-sm text-texte-2">{t(`invitation.droits.${invitation.role}`)}</p>

          {statut === 'connecte' && utilisateur ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-texte-3">{t('invitation.connecteEnTantQue', { nom: utilisateur.nom })}</p>
              <ErreurFormulaire message={erreur} />
              <Bouton taille="lg" pleineLargeur icone={<Check />} voix="invitation.accepter" chargement={acceptation.isPending} onClick={() => acceptation.mutate()}>
                {t('invitation.accepter')}
              </Bouton>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <BoutonLien to={`/inscription?suite=${suite}`} taille="lg" pleineLargeur icone={<UserPlus />} voix="invitation.creerCompte">
                {t('invitation.creerCompte')}
              </BoutonLien>
              <BoutonLien to={`/connexion?suite=${suite}`} variante="secondaire" taille="lg" pleineLargeur icone={<LogIn />} voix="invitation.meConnecter">
                {t('invitation.meConnecter')}
              </BoutonLien>
              <p className="mt-1 text-center text-xs text-texte-3">{t('invitation.memeContact')}</p>
            </div>
          )}
        </>
      )}
    </MiseEnPageInvite>
  )
}
