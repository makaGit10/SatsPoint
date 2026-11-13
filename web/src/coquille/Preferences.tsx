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
/** Clé vocale de chaque thème (le registre lit les propriétés `voix:`). */
const VOIX_THEME: Record<Theme, string> = Object.fromEntries(
  [
    { theme: 'clair', voix: 'theme.clair' },
    { theme: 'sombre', voix: 'theme.sombre' },
    { theme: 'auto', voix: 'theme.auto' },
  ].map((o) => [o.theme, o.voix]),
) as Record<Theme, string>

function Segment<T extends string>({
  valeur,
  options,
  onChange,
  libelle,
}: {
  valeur: T
  options: { valeur: T; libelle: string; icone?: typeof Sun; voix: string }[]
  onChange: (v: T) => void
  libelle: string
}) {
  return (
    <div role="radiogroup" aria-label={libelle} className="inline-flex min-h-12 w-full items-stretch gap-1 rounded-2xl bg-surface-2 p-1 sm:h-12 sm:rounded-full md:h-11">
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
              // Mobile : icône et haut-parleur au-dessus du mot (trois options tiennent en 390 px) ; une ligne dès 640 px.
              'relative inline-flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-0 sm:text-sm',
              actif ? 'bg-inverse text-inverse-texte shadow-sm' : 'text-texte-2 hover:text-texte',
            )}
          >
            <span className="inline-flex items-center gap-1 sm:contents">
              {Icone && <Icone size={15} aria-hidden="true" />}
              <HautParleur cle={o.voix} dansBouton enLigne className="sm:order-last" />
            </span>
            <span className="max-w-full truncate">{o.libelle}</span>
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
        <h3 className="flex items-center gap-0.5 text-xs font-semibold tracking-wide text-texte-3 uppercase">
          {t('theme.titre')}
          <HautParleur cle="theme.titre" className="-my-2" />
        </h3>
        <Segment<Theme>
          libelle={t('theme.titre')}
          valeur={theme}
          onChange={changerTheme}
          options={THEMES.map((v) => ({ valeur: v, libelle: t(`theme.${v}`), icone: ICONES_THEME[v], voix: VOIX_THEME[v] }))}
        />
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-0.5 text-xs font-semibold tracking-wide text-texte-3 uppercase">
          {t('entete.langueInterface')}
          <HautParleur cle="entete.langueInterface" className="-my-2" />
        </h3>
        <Segment
          libelle={t('entete.langueInterface')}
          valeur={localeCourante()}
          onChange={changerLocale}
          options={LOCALES.map((v) => ({ valeur: v, libelle: t(`langue.${v}`), voix: v === 'en' ? 'langue.en' : 'langue.fr' }))}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Interrupteur
          coche={aideVocale}
          onChange={changerAideVocale}
          libelle={t('utilisateur.aideVocale')} voix="utilisateur.aideVocale"
          description={t('utilisateur.aideVocaleAide')}
        />
        <div className="flex flex-col gap-1.5" data-inactif={!aideVocale || undefined}>
          <h3 className="flex items-center gap-0.5 text-xs font-semibold tracking-wide text-texte-3 uppercase">
            {t('utilisateur.langueAudio')}
            <HautParleur cle="utilisateur.langueAudio" className="-my-2" />
          </h3>
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
