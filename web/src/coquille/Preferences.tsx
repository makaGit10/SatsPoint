import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCatalogue, usePaysCourant } from '@/api/catalogue'
import type { CodePays, Theme } from '@/api/types'
import { Interrupteur } from '@/composants/Interrupteur'
import { localeCourante, LOCALES } from '@/i18n'
import { languesProposees } from '@/lib/catalogue'
import { cn } from '@/lib/cn'
import { THEMES, useTheme } from '@/lib/theme'
import { HautParleur } from '@/voix/HautParleur'
import { useVoix } from '@/voix/store'
import { usePreferences } from './usePreferences'

const ICONES_THEME = { clair: Sun, sombre: Moon, auto: Monitor } as const

function Segment<T extends string>({
  valeur,
  options,
  onChange,
  libelle,
}: {
  valeur: T
  options: { valeur: T; libelle: string; icone?: typeof Sun }[]
  onChange: (v: T) => void
  libelle: string
}) {
  return (
    <div role="radiogroup" aria-label={libelle} className="inline-flex h-12 w-full items-stretch gap-1 rounded-full bg-surface-2 p-1 md:h-11">
      {options.map((o) => {
        const Icone = o.icone
        const actif = o.valeur === valeur
        return (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(o.valeur)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150',
              actif ? 'bg-inverse text-inverse-texte shadow-sm' : 'text-texte-2 hover:text-texte',
            )}
          >
            {Icone && <Icone size={15} aria-hidden="true" />}
            {o.libelle}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Préférences d'affichage et de voix : thème, langue d'interface, aide vocale, langue de la voix.
 * Langues de la voix = celles du pays (de la boutique, sinon de l'appareil) + le français ; la langue en cours reste visible.
 */
export function PanneauPreferences({ className, pays }: { className?: string; pays?: CodePays }) {
  const { t, i18n } = useTranslation()
  void i18n.language
  const theme = useTheme((s) => s.theme)
  const langueAudio = useVoix((s) => s.langueAudio)
  const aideVocale = useVoix((s) => s.activee)
  const catalogue = useCatalogue()
  const paysAppareil = usePaysCourant()
  const { changerTheme, changerLocale, changerLangueAudio, changerAideVocale } = usePreferences()

  const proposees = languesProposees(catalogue.langues, pays ?? paysAppareil)
  const enCours = catalogue.langues.find((l) => l.code === langueAudio)
  const langues = enCours && !proposees.includes(enCours) ? [enCours, ...proposees] : proposees

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('theme.titre')}</h3>
        <Segment<Theme>
          libelle={t('theme.titre')}
          valeur={theme}
          onChange={changerTheme}
          options={THEMES.map((v) => ({ valeur: v, libelle: t(`theme.${v}`), icone: ICONES_THEME[v] }))}
        />
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('entete.langueInterface')}</h3>
        <Segment
          libelle={t('entete.langueInterface')}
          valeur={localeCourante()}
          onChange={changerLocale}
          options={LOCALES.map((v) => ({ valeur: v, libelle: t(`langue.${v}`) }))}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Interrupteur
          coche={aideVocale}
          onChange={changerAideVocale}
          libelle={t('utilisateur.aideVocale')}
          description={t('utilisateur.aideVocaleAide')}
        />
        <div className="flex flex-col gap-1.5" data-inactif={!aideVocale || undefined}>
          <h3 className="text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('utilisateur.langueAudio')}</h3>
          <div role="radiogroup" aria-label={t('utilisateur.langueAudio')} className="grid grid-cols-3 gap-1.5">
            {langues.map((l) => {
              const actif = l.code === langueAudio
              return (
                <div
                  key={l.code}
                  className={cn(
                    'relative flex h-10 items-center rounded-md border text-sm font-medium transition-colors duration-150',
                    actif ? 'border-accent bg-accent-doux text-texte' : 'border-bordure bg-surface text-texte-2 hover:bg-surface-2',
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={actif}
                    onClick={() => changerLangueAudio(l.code)}
                    lang={l.code}
                    className="h-full flex-1 truncate px-2 text-left"
                  >
                    {l.nom_local}
                  </button>
                  <HautParleur cle={`langue.${l.code}`} langue={l.code} className="mr-0.5" />
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
