import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { usePaysCourant } from '@/api/catalogue'
import { useAuth } from '@/auth/store'
import { useEnregistrerPreferences } from '@/auth/useMoi'
import { Marque } from '@/coquille/Marque'
import { cheminAccueil } from '@/coquille/navigation'
import { SqueletteApplication } from '@/coquille/SqueletteEcran'
import { useGuideVocal } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'
import { useVoix } from '@/voix/store'
import { appliquerChoixLangue, ChoixPays, TuilesLangues, useTuilesLangues, type TuileLangue } from './langue/ChoixLangue'

/**
 * Premier lancement : le pays (compact, déduit du navigateur, Sénégal par défaut), puis une grande tuile par langue
 * de ce pays + Français + English, chacune avec un haut-parleur qui dit le nom de la langue dans cette langue.
 * Mêmes tuiles que le panneau de première visite de la page de présentation et la feuille « Aide vocale ».
 */
export default function Langue() {
  const { t } = useTranslation()
  useGuideVocal('guide.langue')
  const navigate = useNavigate()
  const langueCourante = useVoix((s) => s.langueAudio)
  const utilisateur = useAuth((s) => s.utilisateur)
  const statut = useAuth((s) => s.statut)
  const enregistrer = useEnregistrerPreferences()
  const paysCourant = usePaysCourant()
  const tuiles = useTuilesLangues({ anglais: true })

  const choisir = (tuile: TuileLangue) => {
    const choix = appliquerChoixLangue(tuile, paysCourant)
    if (utilisateur) enregistrer.mutate(choix)
    navigate(utilisateur ? cheminAccueil(utilisateur) : '/accueil', { replace: true })
  }

  // Session encore inconnue : un choix fait maintenant ne serait pas enregistré sur le compte, puis serait écrasé
  // par les préférences du compte à l'arrivée de `/moi`. On attend (un seul aller-retour).
  if (statut === 'inconnu') return <SqueletteApplication />

  return (
    <div className="flex min-h-dvh flex-col" data-ecran="langue">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <Marque taille="lg" sansTexte className="mb-4" />
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-texte">
            {t('langue.titre')}
            <HautParleur cle="langue.titre" langue="fr" taille={16} />
          </h1>
          <p className="mt-1 text-sm text-texte-2">{t('langue.sousTitre')}</p>
        </div>

        <ChoixPays className="mb-4" />

        <TuilesLangues tuiles={tuiles} actif={langueCourante} onChoisir={choisir} libelle={t('langue.titre')} />
      </main>
    </div>
  )
}
