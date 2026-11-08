import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { CLES_STOCKAGE } from '@/lib/stockage'
import fr from './fr.json'

export const LOCALES = ['fr', 'en'] as const
export type LocaleInterface = (typeof LOCALES)[number]

export function estLocale(valeur: unknown): valeur is LocaleInterface {
  return valeur === 'fr' || valeur === 'en'
}

/** Le français est embarqué (langue par défaut et de repli) ; l'anglais est chargé à la demande. */
const CHARGEURS: Record<LocaleInterface, () => Promise<Record<string, unknown>>> = {
  fr: () => Promise.resolve(fr),
  en: () => import('./en.json').then((m) => m.default),
}

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr } },
    partialBundledLanguages: true,
    supportedLngs: [...LOCALES],
    fallbackLng: 'fr',
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: CLES_STOCKAGE.locale,
      caches: ['localStorage'],
    },
    returnNull: false,
  })

/** Locale d'interface effective (`fr` | `en`). */
export function localeCourante(): LocaleInterface {
  const l = (i18next.language ?? i18next.resolvedLanguage ?? 'fr').slice(0, 2)
  return estLocale(l) ? l : 'fr'
}

const enCours = new Map<LocaleInterface, Promise<void>>()

/** Garantit que le paquet de traduction d'une langue est chargé. */
export function chargerLangue(locale: LocaleInterface): Promise<void> {
  if (i18next.hasResourceBundle(locale, 'translation')) return Promise.resolve()
  let promesse = enCours.get(locale)
  if (!promesse) {
    promesse = CHARGEURS[locale]()
      .then((ressources) => {
        i18next.addResourceBundle(locale, 'translation', ressources, true, true)
      })
      .finally(() => enCours.delete(locale))
    enCours.set(locale, promesse)
  }
  return promesse
}

/** À attendre avant le premier rendu : la langue détectée est prête (pas de clés brutes ni de bascule visible). */
export async function pretLangue(): Promise<void> {
  const l = (i18next.language ?? 'fr').slice(0, 2)
  const locale = estLocale(l) ? l : 'fr'
  await chargerLangue(locale)
  // Recalcule la langue résolue maintenant que le paquet est présent.
  if (i18next.resolvedLanguage !== locale) await i18next.changeLanguage(locale)
}

export async function changerLocale(locale: LocaleInterface) {
  if (localeCourante() === locale && i18next.hasResourceBundle(locale, 'translation')) return
  await chargerLangue(locale)
  await i18next.changeLanguage(locale)
}

function synchroniserLang(langue: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = langue.slice(0, 2)
}
synchroniserLang(i18next.resolvedLanguage ?? 'fr')
i18next.on('languageChanged', synchroniserLang)

export default i18next
