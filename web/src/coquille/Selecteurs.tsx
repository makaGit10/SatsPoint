import { ChevronDown, Languages, Monitor, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Theme } from '@/api/types'
import { localeCourante, LOCALES } from '@/i18n'
import { cn } from '@/lib/cn'
import { THEMES, useTheme } from '@/lib/theme'
import { usePreferences } from './usePreferences'

const ICONES_THEME: Record<Theme, ReactNode> = { clair: <Sun />, sombre: <Moon />, auto: <Monitor /> }

/**
 * Sélecteur compact : un <select> natif (accessible, sélecteur système sur mobile, zéro dépendance)
 * recouvre une icône ; seule l'icône est visible.
 */
function SelecteurCompact<T extends string>({
  libelle,
  valeur,
  options,
  onChange,
  icone,
  texte,
  className,
}: {
  libelle: string
  valeur: T
  options: { valeur: T; libelle: string }[]
  onChange: (v: T) => void
  icone: ReactNode
  texte?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'zone-tactile relative inline-flex h-9 items-center gap-1 rounded-md px-2 text-texte-2 transition-colors duration-150 hover:bg-surface-2 hover:text-texte focus-within:bg-surface-2',
        className,
      )}
      title={libelle}
    >
      <span className="inline-flex [&>svg]:size-[18px]" aria-hidden="true">
        {icone}
      </span>
      {texte && <span className="text-xs font-semibold uppercase">{texte}</span>}
      <ChevronDown size={12} className="text-texte-3" aria-hidden="true" />
      <select
        aria-label={libelle}
        value={valeur}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </span>
  )
}

export function SelecteurTheme({ className }: { className?: string }) {
  const { t } = useTranslation()
  const theme = useTheme((s) => s.theme)
  const { changerTheme } = usePreferences()
  return (
    <SelecteurCompact<Theme>
      libelle={t('entete.theme')}
      valeur={theme}
      onChange={changerTheme}
      icone={ICONES_THEME[theme]}
      options={THEMES.map((v) => ({ valeur: v, libelle: t(`theme.${v}`) }))}
      className={className}
    />
  )
}

export function SelecteurLangue({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  void i18n.language
  const locale = localeCourante()
  const { changerLocale } = usePreferences()
  return (
    <SelecteurCompact
      libelle={t('entete.langueInterface')}
      valeur={locale}
      onChange={changerLocale}
      icone={<Languages />}
      texte={locale}
      options={LOCALES.map((v) => ({ valeur: v, libelle: t(`langue.${v}`) }))}
      className={className}
    />
  )
}
