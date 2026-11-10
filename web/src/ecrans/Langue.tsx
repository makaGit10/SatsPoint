import { ChevronDown, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCatalogue, usePaysCourant } from '@/api/catalogue'
import type { CodePays, LangueAudio } from '@/api/types'
import { useAuth } from '@/auth/store'
import { useEnregistrerPreferences } from '@/auth/useMoi'
import { Marque } from '@/coquille/Marque'
import { cheminAccueil } from '@/coquille/navigation'
import { SqueletteApplication } from '@/coquille/SqueletteEcran'
import { changerLocale, localeCourante } from '@/i18n'
import { languesDuPays, nomPays } from '@/lib/catalogue'
import { cn } from '@/lib/cn'
import { CLES_STOCKAGE, ecrireStockage } from '@/lib/stockage'
import { HautParleur } from '@/voix/HautParleur'
import { estLangueLocale, useVoix } from '@/voix/store'

interface Tuile {
  /** Code de la langue audio, ou `en` (interface anglaise, sans voix). */
  code: string
  /** Nom affiché en grand : dans la langue elle-même. */
  nom: string
  /** Langue du haut-parleur (l'anglais n'a pas d'audio propre : il est dit depuis le manifeste français). */
  langueAudio: LangueAudio
  locale: 'fr' | 'en'
}

/**
 * Premier lancement : le pays (compact, déduit du navigateur, Sénégal par défaut), puis une grande tuile par langue
 * de ce pays + Français + English, chacune avec un haut-parleur qui dit le nom de la langue dans cette langue.
 */
export default function Langue() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const langueCourante = useVoix((s) => s.langueAudio)
  const utilisateur = useAuth((s) => s.utilisateur)
  const statut = useAuth((s) => s.statut)
  const enregistrer = useEnregistrerPreferences()
  const { pays, langues } = useCatalogue()
  const paysCourant = usePaysCourant()

  const francais = langues.find((l) => l.code === 'fr')
  const tuiles: Tuile[] = [
    ...languesDuPays(langues, paysCourant).map((l) => ({ code: l.code, nom: l.nom_local, langueAudio: l.code, locale: 'fr' as const })),
    { code: 'fr', nom: francais?.nom_local ?? t('langue.fr'), langueAudio: 'fr', locale: 'fr' },
    { code: 'en', nom: t('langue.en'), langueAudio: 'fr', locale: 'en' },
  ]

  const choisir = (tuile: Tuile) => {
    const voix = useVoix.getState()
    const langueAudio: LangueAudio | null = tuile.code === 'en' ? null : tuile.code
    const aideVocale = estLangueLocale(langueAudio)
    voix.definirPays(paysCourant)
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

        {pays.length > 1 && (
          <div className="mx-auto mb-4 flex h-10 items-center gap-1.5 verre rounded-full pr-1 pl-3 text-sm" data-choix-pays>
            <MapPin size={15} aria-hidden="true" className="shrink-0 text-accent-trait" />
            <span className="relative inline-flex items-center">
              <select
                aria-label={t('langue.pays')}
                value={paysCourant}
                onChange={(e) => useVoix.getState().definirPays(e.target.value as CodePays)}
                className="h-8 max-w-[60vw] cursor-pointer appearance-none rounded-full bg-transparent pr-6 font-semibold text-texte outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {pays.map((p) => (
                  <option key={p.code} value={p.code}>
                    {nomPays(p, localeCourante())}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1 text-texte-3" />
            </span>
            <HautParleur cle="langue.pays" langue="fr" />
          </div>
        )}

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label={t('langue.titre')}>
          {tuiles.map((tuile) => {
            const actif = tuile.code !== 'en' && langueCourante === tuile.code
            return (
              <li key={tuile.code} className="relative">
                <button
                  type="button"
                  onClick={() => choisir(tuile)}
                  aria-pressed={actif}
                  lang={tuile.code === 'en' ? 'en' : tuile.code}
                  className={cn(
                    'flex h-24 w-full flex-col items-start justify-end rounded-xl border bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.985] md:h-28',
                    actif ? 'border-accent ring-2 ring-accent/25' : 'border-bordure hover:border-bordure-forte hover:shadow-sm',
                  )}
                >
                  <span className="max-w-full truncate text-xl font-semibold text-texte">{tuile.nom}</span>
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
