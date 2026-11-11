import { useEffect } from 'react'
import { create } from 'zustand'
import i18next, { chargerPaquet, localeCourante } from '@/i18n'
import { arreter, lectureEnCours, lire, lireTexte } from './lecteur'
import { useVoix } from './store'
import { obtenirUrlAudio } from './useManifesteAudio'

/**
 * Guide vocal par écran (CAHIER § 6.12) : chaque écran déclare sa clé (`guide.caisse`…) avec `useGuideVocal`.
 * - À l'arrivée, si l'aide vocale est active, l'explication est lue UNE fois par session et par langue,
 *   seulement après un premier geste (règle des navigateurs ; le choix de la langue en est un) et sans
 *   jamais couvrir un autre son (on attend la fin du son en cours).
 * - En quittant l'écran, la lecture du guide s'arrête.
 * - Le bouton rond « Réécouter l'aide » (coin bas) et la feuille vocale relisent le guide de l'écran courant.
 * Source du son : l'enregistrement publié au studio (langue choisie, puis français) ; à défaut, la voix du
 * navigateur lit le texte dans la langue de l'interface, en attendant l'enregistrement.
 */

const DELAI_MS = 450
const CLE_SESSION = 'satspoint.guides-lus'

interface EtatGuide {
  /** Guides des écrans montés, du plus ancien au plus récent (une fenêtre ouverte passe devant sa page). */
  pile: string[]
  entrer: (cle: string) => void
  sortir: (cle: string) => void
}

export const useGuide = create<EtatGuide>((set) => ({
  pile: [],
  entrer: (cle) => set((e) => ({ pile: [...e.pile.filter((c) => c !== cle), cle] })),
  sortir: (cle) => set((e) => ({ pile: e.pile.filter((c) => c !== cle) })),
}))

/** Clé du guide de l'écran affiché, ou `null`. */
export function guideCourant(pile = useGuide.getState().pile): string | null {
  return pile.length ? pile[pile.length - 1]! : null
}

export function useGuideCourant(): string | null {
  return useGuide((e) => guideCourant(e.pile))
}

// ---------------------------------------------------------------------------- session : guides déjà lus

let lusMemoire = new Set<string>()

function lus(): Set<string> {
  try {
    const brut = window.sessionStorage.getItem(CLE_SESSION)
    if (brut) lusMemoire = new Set((JSON.parse(brut) as unknown[]).filter((v): v is string => typeof v === 'string'))
  } catch {
    /* stockage indisponible : mémoire seulement */
  }
  return lusMemoire
}

function marquerLu(marque: string) {
  const ensemble = lus()
  ensemble.add(marque)
  try {
    window.sessionStorage.setItem(CLE_SESSION, JSON.stringify([...ensemble]))
  } catch {
    /* mémoire seulement */
  }
}

/** Tests : oublie les guides lus. */
export function oublierGuidesLus() {
  lusMemoire = new Set()
  try {
    window.sessionStorage.removeItem(CLE_SESSION)
  } catch {
    /* rien */
  }
}

// ---------------------------------------------------------------------------- premier geste

let gesteFait = false
const enAttenteGeste = new Set<() => void>()

function aEuUnGeste(): boolean {
  if (gesteFait) return true
  const activation = (typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation : undefined)
  return activation?.hasBeenActive === true
}

if (typeof window !== 'undefined') {
  const marquer = () => {
    gesteFait = true
    window.removeEventListener('pointerdown', marquer, true)
    window.removeEventListener('keydown', marquer, true)
    for (const rappel of [...enAttenteGeste]) rappel()
    enAttenteGeste.clear()
  }
  window.addEventListener('pointerdown', marquer, true)
  window.addEventListener('keydown', marquer, true)
}

function apresGeste(rappel: () => void): () => void {
  if (aEuUnGeste()) {
    rappel()
    return () => undefined
  }
  enAttenteGeste.add(rappel)
  return () => {
    enAttenteGeste.delete(rappel)
  }
}

/** Attend qu'aucun son ne soit en cours (jamais deux audios superposés). */
function apresSilence(rappel: () => void): () => void {
  if (!lectureEnCours()) {
    rappel()
    return () => undefined
  }
  const desabonner = useVoix.subscribe((etat) => {
    if (etat.cleEnLecture === null) {
      desabonner()
      rappel()
    }
  })
  return desabonner
}

// ---------------------------------------------------------------------------- lecture

/** Lit le guide `cle` (enregistrement, sinon voix du navigateur). Un second appui pendant la lecture l'arrête. */
export async function jouerGuide(cle: string): Promise<boolean> {
  const { langueAudio } = useVoix.getState()
  if (langueAudio) {
    const url = await obtenirUrlAudio(cle, langueAudio)
    if (url) {
      lire(url, cle)
      return true
    }
  }
  try {
    await chargerPaquet('guide')
  } catch {
    return false
  }
  const texte = i18next.t(cle, { defaultValue: '' })
  if (!texte || texte === cle) return false
  return lireTexte(texte, localeCourante() === 'en' ? 'en-US' : 'fr-FR', cle)
}

export interface OptionsGuide {
  /** `false` : l'écran n'est pas (encore) affiché (chargement, fenêtre fermée) ; rien n'est déclaré ni lu. */
  actif?: boolean
}

/**
 * Déclare le guide vocal de l'écran : `useGuideVocal('guide.caisse')`. La clé est une clé i18n (paquet `guide`)
 * et une clé vocale essentielle du registre (studio). Lecture automatique une fois par session et par langue
 * quand l'aide vocale est active ; arrêt en quittant l'écran ; « Réécouter l'aide » la relit.
 */
export function useGuideVocal(cle: string, options: OptionsGuide = {}) {
  const actif = options.actif !== false
  const activee = useVoix((s) => s.activee)
  const langue = useVoix((s) => s.langueAudio)

  useEffect(() => {
    if (!actif) return
    useGuide.getState().entrer(cle)
    return () => {
      useGuide.getState().sortir(cle)
      if (useVoix.getState().cleEnLecture === cle) arreter()
    }
  }, [cle, actif])

  useEffect(() => {
    if (!actif || !activee) return
    const marque = `${langue ?? localeCourante()}:${cle}`
    if (lus().has(marque)) return
    let annule = false
    let minuterie: ReturnType<typeof setTimeout> | undefined
    let desabonnerSilence: (() => void) | undefined
    const desabonnerGeste = apresGeste(() => {
      minuterie = setTimeout(() => {
        desabonnerSilence = apresSilence(() => {
          // L'écran est peut-être déjà quitté, ou un autre guide est passé devant (fenêtre ouverte).
          if (annule || guideCourant() !== cle || lus().has(marque)) return
          marquerLu(marque)
          void jouerGuide(cle)
        })
      }, DELAI_MS)
    })
    return () => {
      annule = true
      desabonnerGeste()
      if (minuterie) clearTimeout(minuterie)
      desabonnerSilence?.()
    }
  }, [cle, actif, activee, langue])
}
