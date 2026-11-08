import { create } from 'zustand'
import type { LangueAudio } from '@/api/types'
import { CLES_STOCKAGE, ecrireStockage, lireStockage } from '@/lib/stockage'

export const LANGUES_AUDIO: LangueAudio[] = ['wo', 'srr', 'ff', 'dyo', 'fr']
/** Langues locales : l'aide vocale est activée par défaut quand l'une d'elles est choisie. */
export const LANGUES_LOCALES: LangueAudio[] = ['wo', 'srr', 'ff', 'dyo']

export function estLangueAudio(valeur: unknown): valeur is LangueAudio {
  return typeof valeur === 'string' && (LANGUES_AUDIO as string[]).includes(valeur)
}

interface EtatVoix {
  /** Langue des audios ; `null` = aucune (interface en anglais sans voix, par exemple). */
  langueAudio: LangueAudio | null
  /** Aide vocale affichée (haut-parleurs) et annonces automatiques. */
  activee: boolean
  /** Clé vocale en cours de lecture (pour l'animation d'ondes). */
  cleEnLecture: string | null
  definirLangue: (langue: LangueAudio | null) => void
  definirActivee: (activee: boolean) => void
  definirLecture: (cle: string | null) => void
}

function lireLangue(): LangueAudio | null {
  const v = lireStockage(CLES_STOCKAGE.langueAudio)
  return estLangueAudio(v) ? v : null
}

function lireActivee(langue: LangueAudio | null): boolean {
  const v = lireStockage(CLES_STOCKAGE.aideVocale)
  if (v === '1') return true
  if (v === '0') return false
  return langue !== null && LANGUES_LOCALES.includes(langue)
}

const langueInitiale = lireLangue()

export const useVoix = create<EtatVoix>((set) => ({
  langueAudio: langueInitiale,
  activee: lireActivee(langueInitiale),
  cleEnLecture: null,
  definirLangue: (langueAudio) => {
    ecrireStockage(CLES_STOCKAGE.langueAudio, langueAudio)
    set({ langueAudio })
  },
  definirActivee: (activee) => {
    ecrireStockage(CLES_STOCKAGE.aideVocale, activee ? '1' : '0')
    set({ activee })
  },
  definirLecture: (cleEnLecture) => set({ cleEnLecture }),
}))
