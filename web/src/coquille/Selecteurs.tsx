import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { localeCourante, LOCALES } from '@/i18n'
import { cn } from '@/lib/cn'
import { themeEffectif, useTheme } from '@/lib/theme'
import { HautParleur } from '@/voix/HautParleur'
import { usePreferences } from './usePreferences'

/**
 * Bascule clair / sombre en un geste : soleil en clair, lune en sombre (l'icône pivote).
 * Le thème « automatique » reste disponible dans les réglages ; ici on part du thème réellement affiché.
 */
export function SelecteurTheme({ className }: { className?: string }) {
  const { t } = useTranslation()
  const theme = useTheme((s) => s.theme)
  const { changerTheme } = usePreferences()
  const sombre = themeEffectif(theme) === 'sombre'
  const cible = sombre ? 'clair' : 'sombre'
  const libelle = `${t('entete.theme')} : ${t(`theme.${cible}`)}`
  return (
    <button
      type="button"
      onClick={() => changerTheme(cible)}
      aria-label={libelle}
      title={libelle}
      data-theme-actuel={sombre ? 'sombre' : 'clair'}
      className={cn(
        'zone-tactile relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-texte-2 transition-colors duration-200 hover:bg-surface-2 hover:text-texte',
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn('absolute size-[19px] transition-all duration-300 ease-out', sombre ? 'scale-50 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100')}
      />
      <Moon
        aria-hidden="true"
        className={cn('absolute size-[18px] transition-all duration-300 ease-out', sombre ? 'scale-100 rotate-0 opacity-100' : 'scale-50 rotate-90 opacity-0')}
      />
      {/* Dit le thème proposé (celui qu'un toucher appliquera). */}
      <HautParleur cle={sombre ? 'theme.clair' : 'theme.sombre'} dansBouton coin="-top-1 -right-1" />
    </button>
  )
}

/** Langue de l'interface : pastille « FR | EN », la langue active est surlignée. */
export function SelecteurLangue({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  void i18n.language
  const locale = localeCourante()
  const { changerLocale } = usePreferences()
  return (
    <div
      role="group"
      aria-label={t('entete.langueInterface')}
      className={cn('inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-bordure bg-surface-2 p-0.5', className)}
    >
      {LOCALES.map((v) => {
        const actif = v === locale
        return (
          <button
            key={v}
            type="button"
            lang={v}
            aria-pressed={actif}
            // Le nom accessible commence par le texte visible (« FR — Français », WCAG 2.5.3).
            aria-label={`${v.toUpperCase()} — ${t(`langue.${v}`)}`}
            title={t(`langue.${v}`)}
            onClick={() => {
              if (!actif) changerLocale(v)
            }}
            className={cn(
              'relative inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2.5 text-xs font-bold tracking-wide uppercase transition-all duration-200',
              actif ? 'bg-texte text-fond shadow-sm' : 'text-texte-2 hover:text-texte',
            )}
          >
            {v}
            <HautParleur cle={v === 'en' ? 'langue.en' : 'langue.fr'} dansBouton coin="-top-1.5 -right-1" />
          </button>
        )
      })}
    </div>
  )
}
