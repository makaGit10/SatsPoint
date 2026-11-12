import { ChevronDown, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCatalogue, usePaysCourant } from '@/api/catalogue'
import type { CodePays, LangueAudio, LocaleInterface } from '@/api/types'
import { changerLocale, localeCourante } from '@/i18n'
import { languesDuPays, languesProposees, nomPays } from '@/lib/catalogue'
import { cn } from '@/lib/cn'
import { CLES_STOCKAGE, ecrireStockage } from '@/lib/stockage'
import { HautParleur } from '@/voix/HautParleur'
import { estLangueLocale, useVoix } from '@/voix/store'

/**
 * Choix de la langue, partagé par l'écran `/langue`, le panneau de première visite de la page de présentation et la
 * feuille « Aide vocale » : pays compact, puis une grande tuile par langue, chacune avec son haut-parleur qui dit le
 * nom de la langue DANS cette langue (une personne qui ne lit pas reconnaît la sienne).
 */
export interface TuileLangue {
  /** Code de la langue audio, ou `en` (interface anglaise, sans voix). */
  code: string
  /** Nom affiché en grand : dans la langue elle-même. */
  nom: string
  /** Langue du haut-parleur (l'anglais n'a pas d'audio propre : il est dit depuis le manifeste français). */
  langueAudio: LangueAudio
  locale: LocaleInterface
}

/** Tuiles : langues du pays, puis Français (et English si demandé). */
export function useTuilesLangues({ anglais }: { anglais: boolean }): TuileLangue[] {
  const { t } = useTranslation()
  const { langues } = useCatalogue()
  const pays = usePaysCourant()
  if (!anglais) return languesProposees(langues, pays).map((l) => ({ code: l.code, nom: l.nom_local, langueAudio: l.code, locale: 'fr' }))
  const francais = langues.find((l) => l.code === 'fr')
  return [
    ...languesDuPays(langues, pays).map((l) => ({ code: l.code, nom: l.nom_local, langueAudio: l.code, locale: 'fr' as const })),
    { code: 'fr', nom: francais?.nom_local ?? t('langue.fr'), langueAudio: 'fr', locale: 'fr' },
    { code: 'en', nom: t('langue.en'), langueAudio: 'fr', locale: 'en' },
  ]
}

/** Préférences produites par un choix de langue (premier lancement) : langue locale → aide vocale activée. */
export interface ChoixApplique {
  locale: LocaleInterface
  langue_audio: LangueAudio | null
  aide_vocale: boolean
}

/**
 * Applique le choix fait au premier lancement sur cet appareil : pays, langue de la voix, aide vocale (activée pour une
 * langue locale), langue de l'interface, et mémorise que le choix est fait. Retourne les préférences à enregistrer sur le compte.
 */
export function appliquerChoixLangue(tuile: TuileLangue, pays: CodePays): ChoixApplique {
  const voix = useVoix.getState()
  const langueAudio: LangueAudio | null = tuile.code === 'en' ? null : tuile.code
  const aideVocale = estLangueLocale(langueAudio)
  voix.definirPays(pays)
  voix.definirLangue(langueAudio)
  voix.definirActivee(aideVocale)
  void changerLocale(tuile.locale)
  ecrireStockage(CLES_STOCKAGE.langueChoisie, tuile.code)
  return { locale: tuile.locale, langue_audio: langueAudio, aide_vocale: aideVocale }
}

/** Sélecteur de pays compact (déduit du navigateur, Sénégal par défaut), avec son haut-parleur. Masqué s'il n'y a qu'un pays. */
export function ChoixPays({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { pays } = useCatalogue()
  const paysCourant = usePaysCourant()
  if (pays.length <= 1) return null
  return (
    <div className={cn('mx-auto flex h-10 items-center gap-1.5 verre rounded-full pr-1 pl-3 text-sm', className)} data-choix-pays>
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
  )
}

/** Grandes tuiles de langues ; `actif` = code surligné. */
export function TuilesLangues({
  tuiles,
  actif,
  onChoisir,
  compactes,
  libelle,
}: {
  tuiles: readonly TuileLangue[]
  actif: string | null
  onChoisir: (tuile: TuileLangue) => void
  /** Feuille « Aide vocale » : tuiles plus basses. */
  compactes?: boolean
  libelle: string
}) {
  return (
    <ul className={cn('grid gap-3', compactes ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 md:grid-cols-3')} aria-label={libelle} data-tuiles-langues>
      {tuiles.map((tuile) => {
        const estActive = actif === tuile.code
        return (
          <li key={tuile.code} className="relative">
            <button
              type="button"
              onClick={() => onChoisir(tuile)}
              aria-pressed={estActive}
              lang={tuile.code === 'en' ? 'en' : tuile.code}
              data-langue={tuile.code}
              className={cn(
                'flex w-full flex-col items-start justify-end rounded-xl border bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.985]',
                compactes ? 'h-[72px]' : 'h-24 md:h-28',
                estActive ? 'border-accent ring-2 ring-accent/25' : 'border-bordure hover:border-bordure-forte hover:shadow-sm',
              )}
            >
              <span className={cn('max-w-full truncate pr-7 font-semibold text-texte', compactes ? 'text-lg' : 'text-xl')}>{tuile.nom}</span>
              <span className="text-xs text-texte-3 uppercase">{tuile.code}</span>
            </button>
            <span className="absolute top-1.5 right-1.5">
              <HautParleur cle={`langue.${tuile.code}`} langue={tuile.langueAudio} taille={16} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
