import { LogOut, ShieldCheck } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/store'
import { useDeconnexion } from '@/auth/useMoi'
import { Bouton, BoutonLien } from '@/composants/Bouton'
import { Dialogue } from '@/composants/Dialogue'
import { SqueletteTexte } from '@/composants/Squelette'
import { Avatar } from './MenuUtilisateur'

const PanneauPreferences = lazy(() => import('./Preferences').then((m) => ({ default: m.PanneauPreferences })))

/** Fenêtre « Mon compte » : identité, préférences, sécurité, déconnexion. */
export default function FenetreCompte({ ouvert, onOuvertChange }: { ouvert: boolean; onOuvertChange: (ouvert: boolean) => void }) {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const deconnexion = useDeconnexion()
  const navigate = useNavigate()

  if (!utilisateur) return null

  const role = utilisateur.role_plateforme === 'super_admin' ? t('roles.super_admin') : utilisateur.boutique ? t(`roles.${utilisateur.boutique.role}`) : null

  const seDeconnecter = () => {
    deconnexion.mutate(undefined, {
      onSettled: () => {
        onOuvertChange(false)
        navigate('/accueil', { replace: true })
      },
    })
  }

  return (
    <Dialogue
      ouvert={ouvert}
      onOuvertChange={onOuvertChange}
      taille="sm"
      voix="entete.menuUtilisateur"
      titre={
        <span className="flex items-center gap-2.5">
          <Avatar nom={utilisateur.nom} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-texte">{utilisateur.nom}</span>
            <span className="block truncate text-xs font-normal text-texte-3">
              {utilisateur.boutique ? `${utilisateur.boutique.nom} · ` : ''}
              {role}
            </span>
          </span>
        </span>
      }
      pied={
        <div className="flex w-full flex-col gap-2">
        <BoutonLien to="/securite/2fa" variante="fantome" icone={<ShieldCheck />} voix="utilisateur.securite" onClick={() => onOuvertChange(false)} pleineLargeur>
          {t('utilisateur.securite')}
          {utilisateur.deux_fa?.active && <span className="ml-1 rounded-full bg-succes-doux px-1.5 text-2xs text-succes-texte">{t('utilisateur.deuxFaActive')}</span>}
        </BoutonLien>
        <Bouton variante="secondaire" icone={<LogOut />} voix="utilisateur.deconnexion" chargement={deconnexion.isPending} onClick={seDeconnecter} pleineLargeur>
          {t('utilisateur.deconnexion')}
        </Bouton>
        </div>
      }
    >
      <Suspense fallback={<SqueletteTexte lignes={4} className="py-1" />}>
        <PanneauPreferences className="pt-1 pb-1" />
      </Suspense>
    </Dialogue>
  )
}
