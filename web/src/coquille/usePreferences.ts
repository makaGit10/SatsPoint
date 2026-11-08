import type { LangueAudio, LocaleInterface, Theme } from '@/api/types'
import { useAuth } from '@/auth/store'
import { useEnregistrerPreferences } from '@/auth/useMoi'
import { changerLocale } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { useVoix } from '@/voix/store'

/** Applique une préférence à l'appareil immédiatement, puis l'enregistre sur le compte si connecté. */
export function usePreferences() {
  const connecte = useAuth((s) => s.statut === 'connecte')
  const definirTheme = useTheme((s) => s.definir)
  const definirLangueAudio = useVoix((s) => s.definirLangue)
  const definirAideVocale = useVoix((s) => s.definirActivee)
  const enregistrer = useEnregistrerPreferences()

  const persister = (p: Parameters<typeof enregistrer.mutate>[0]) => {
    if (connecte) enregistrer.mutate(p)
  }

  return {
    changerTheme: (theme: Theme) => {
      definirTheme(theme)
      persister({ theme })
    },
    changerLocale: (locale: LocaleInterface) => {
      changerLocale(locale)
      persister({ locale })
    },
    changerLangueAudio: (langue: LangueAudio | null) => {
      definirLangueAudio(langue)
      persister({ langue_audio: langue })
    },
    changerAideVocale: (activee: boolean) => {
      definirAideVocale(activee)
      persister({ aide_vocale: activee })
    },
  }
}
