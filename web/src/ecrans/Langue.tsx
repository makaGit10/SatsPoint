import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { LangueAudio } from '@/api/types'
import { useAuth } from '@/auth/store'
import { useEnregistrerPreferences } from '@/auth/useMoi'
import { Marque } from '@/coquille/Marque'
import { cheminAccueil } from '@/coquille/navigation'
import { SqueletteApplication } from '@/coquille/SqueletteEcran'
import { changerLocale } from '@/i18n'
import { cn } from '@/lib/cn'
import { CLES_STOCKAGE, ecrireStockage } from '@/lib/stockage'
import { HautParleur } from '@/voix/HautParleur'
import { LANGUES_LOCALES, useVoix } from '@/voix/store'

type CodeTuile = LangueAudio | 'en'

interface Tuile {
  code: CodeTuile
  /** Langue du haut-parleur (l'anglais n'a pas d'audio propre : il est dit depuis le manifeste français). */
  langueAudio: LangueAudio
  locale: 'fr' | 'en'
}

const TUILES: Tuile[] = [
  { code: 'wo', langueAudio: 'wo', locale: 'fr' },
  { code: 'srr', langueAudio: 'srr', locale: 'fr' },
  { code: 'ff', langueAudio: 'ff', locale: 'fr' },
  { code: 'dyo', langueAudio: 'dyo', locale: 'fr' },
  { code: 'fr', langueAudio: 'fr', locale: 'fr' },
  { code: 'en', langueAudio: 'fr', locale: 'en' },
]

/** Premier lancement : six grandes tuiles, chacune avec un haut-parleur qui dit le nom de la langue dans cette langue. */
export default function Langue() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const langueCourante = useVoix((s) => s.langueAudio)
  const utilisateur = useAuth((s) => s.utilisateur)
  const statut = useAuth((s) => s.statut)
  const enregistrer = useEnregistrerPreferences()

  const choisir = (tuile: Tuile) => {
    const voix = useVoix.getState()
    const langueAudio: LangueAudio | null = tuile.code === 'en' ? null : tuile.code
    const aideVocale = langueAudio !== null && LANGUES_LOCALES.includes(langueAudio)
    voix.definirLangue(langueAudio)
    voix.definirActivee(aideVocale)
    changerLocale(tuile.locale)
    ecrireStockage(CLES_STOCKAGE.langueChoisie, tuile.code)
    if (utilisateur) enregistrer.mutate({ locale: tuile.locale, langue_audio: langueAudio, aide_vocale: aideVocale })
    navigate(utilisateur ? cheminAccueil(utilisateur) : '/accueil', { replace: true })
  }

  // Session encore inconnue : un choix fait maintenant ne serait pas enregistré sur le compte, puis serait écrasé
  // par les préférences du compte à l'arrivée de `/moi`. On attend (un seul aller-retour).
  if (statut === 'inconnu') return <SqueletteApplication />

  return (
    <div className="flex min-h-dvh flex-col bg-fond" data-ecran="langue">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Marque taille="lg" sansTexte className="mb-4" />
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-texte">
            {t('langue.titre')}
            <HautParleur cle="langue.titre" langue="fr" taille={16} />
          </h1>
          <p className="mt-1 text-sm text-texte-2">{t('langue.sousTitre')}</p>
        </div>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label={t('langue.titre')}>
          {TUILES.map((tuile) => {
            const actif = tuile.code !== 'en' && langueCourante === tuile.code
            return (
              <li key={tuile.code} className="relative">
                <button
                  type="button"
                  onClick={() => choisir(tuile)}
                  aria-pressed={actif}
                  className={cn(
                    'flex h-24 w-full flex-col items-start justify-end rounded-xl border bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.985] md:h-28',
                    actif ? 'border-accent ring-2 ring-accent/25' : 'border-bordure hover:border-bordure-forte hover:shadow-sm',
                  )}
                >
                  <span className="text-xl font-semibold text-texte">{t(`langue.${tuile.code}`)}</span>
                  <span className="text-xs text-texte-3 uppercase">{tuile.code}</span>
                </button>
                <span className="absolute top-1.5 right-1.5">
                  <HautParleur cle={`langue.${tuile.code}`} langue={tuile.langueAudio} taille={16} />
                </span>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
