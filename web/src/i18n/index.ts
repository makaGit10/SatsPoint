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

/**
 * Paquets de traductions chargés à la demande (écrans d'administration, studio audio, double authentification,
 * import) : ils ne pèsent rien dans le JavaScript du premier écran. Les clés gardent leur chemin habituel
 * (`studio.enregistrer`…), fusionnées dans l'espace `translation`.
 */
const PAQUETS = {
  admin: {
    fr: () => import('./admin.fr.json').then((m) => m.default as Record<string, unknown>),
    en: () => import('./admin.en.json').then((m) => m.default as Record<string, unknown>),
  },
  // Portefeuille et équipe (écrans de gestion).
  gestion: {
    fr: () => import('./gestion.fr.json').then((m) => m.default as Record<string, unknown>),
    en: () => import('./gestion.en.json').then((m) => m.default as Record<string, unknown>),
  },
  // Recherche globale, invitation, menus d'export.
  extras: {
    fr: () => import('./extras.fr.json').then((m) => m.default as Record<string, unknown>),
    en: () => import('./extras.en.json').then((m) => m.default as Record<string, unknown>),
  },
} satisfies Record<string, Record<LocaleInterface, () => Promise<Record<string, unknown>>>>

export type NomPaquet = keyof typeof PAQUETS

const paquetsDemandes = new Set<NomPaquet>()
const paquetsCharges = new Set<string>()

async function chargerPaquetLocale(nom: NomPaquet, locale: LocaleInterface) {
  const cle = `${nom}:${locale}`
  if (paquetsCharges.has(cle)) return
  // Le paquet principal d'abord : sinon `hasResourceBundle` serait vrai et il ne serait jamais chargé.
  await chargerLangue(locale)
  const ressources = await PAQUETS[nom][locale]()
  i18next.addResourceBundle(locale, 'translation', ressources, true, false)
  paquetsCharges.add(cle)
}

/** Charge un paquet pour la langue courante (et le français, langue de repli) ; il suit ensuite les changements de langue. */
export async function chargerPaquet(nom: NomPaquet): Promise<void> {
  paquetsDemandes.add(nom)
  const locale = localeCourante()
  await Promise.all([chargerPaquetLocale(nom, locale), locale === 'fr' ? null : chargerPaquetLocale(nom, 'fr')])
}

export async function changerLocale(locale: LocaleInterface) {
  if (localeCourante() === locale && i18next.hasResourceBundle(locale, 'translation')) return
  await chargerLangue(locale)
  await Promise.all([...paquetsDemandes].map((nom) => chargerPaquetLocale(nom, locale)))
  await i18next.changeLanguage(locale)
}

function synchroniserLang(langue: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = langue.slice(0, 2)
}
synchroniserLang(i18next.resolvedLanguage ?? 'fr')
i18next.on('languageChanged', synchroniserLang)

export default i18next
