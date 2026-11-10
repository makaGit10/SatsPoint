import { create } from 'zustand'
import type { CodePays, LangueAudio } from '@/api/types'
import { MOTIF_CODE_LANGUE } from '@/lib/catalogue'
import { CLES_STOCKAGE, ecrireStockage, lireStockage } from '@/lib/stockage'

/**
 * Les langues audio sont dynamiques (catalogue du super-admin, CONTRAT_API § 14) : un code valide suffit ici ;
 * la liste proposée vient de `GET /config` (voir `lib/catalogue.ts`).
 */
export function estLangueAudio(valeur: unknown): valeur is LangueAudio {
  return typeof valeur === 'string' && MOTIF_CODE_LANGUE.test(valeur)
}

/** Langue locale (toute langue sauf le français) : l'aide vocale est activée par défaut quand elle est choisie. */
export function estLangueLocale(langue: LangueAudio | null): boolean {
  return langue !== null && langue !== 'fr'
}

interface EtatVoix {
  /** Langue des audios ; `null` = aucune (interface en anglais sans voix, par exemple). */
  langueAudio: LangueAudio | null
  /** Pays choisi sur cet appareil (filtre les langues proposées) ; `null` = pas encore choisi. */
  pays: CodePays | null
  /** Aide vocale affichée (haut-parleurs) et annonces automatiques. */
  activee: boolean
  /** Clé vocale en cours de lecture (pour l'animation d'ondes). */
  cleEnLecture: string | null
  definirLangue: (langue: LangueAudio | null) => void
  definirPays: (pays: CodePays) => void
  definirActivee: (activee: boolean) => void
  definirLecture: (cle: string | null) => void
}

function lireLangue(): LangueAudio | null {
  const v = lireStockage(CLES_STOCKAGE.langueAudio)
  return estLangueAudio(v) ? v : null
}

function lirePays(): CodePays | null {
  const v = lireStockage(CLES_STOCKAGE.pays)
  return v && /^[A-Z]{2}$/.test(v) ? (v as CodePays) : null
}

function lireActivee(langue: LangueAudio | null): boolean {
  const v = lireStockage(CLES_STOCKAGE.aideVocale)
  if (v === '1') return true
  if (v === '0') return false
  return estLangueLocale(langue)
}

const langueInitiale = lireLangue()

export const useVoix = create<EtatVoix>((set) => ({
  langueAudio: langueInitiale,
  pays: lirePays(),
  activee: lireActivee(langueInitiale),
  cleEnLecture: null,
  definirLangue: (langueAudio) => {
    ecrireStockage(CLES_STOCKAGE.langueAudio, langueAudio)
    set({ langueAudio })
  },
  definirPays: (pays) => {
    ecrireStockage(CLES_STOCKAGE.pays, pays)
    set({ pays })
  },
  definirActivee: (activee) => {
    ecrireStockage(CLES_STOCKAGE.aideVocale, activee ? '1' : '0')
    set({ activee })
  },
  definirLecture: (cleEnLecture) => set({ cleEnLecture }),
}))
