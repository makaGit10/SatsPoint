import { useVoix } from './store'

/**
 * Lecteur audio unique : un nouveau son coupe le précédent (enregistrement ou synthèse vocale de repli).
 * L'élément <audio> est créé à la demande (ou fourni par <LecteurAudio/>).
 */
let element: HTMLAudioElement | null = null
/** Clé lue par la synthèse vocale du navigateur (repli des guides sans enregistrement), sinon `null`. */
let cleSynthese: string | null = null

function obtenirElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.preload = 'none'
    brancher(element)
  }
  return element
}

function brancher(audio: HTMLAudioElement) {
  const fin = () => {
    // Une synthèse en cours garde son animation ; un événement « pause » en retard (son remplacé puis relancé
    // aussitôt) ne coupe pas l'animation du nouveau son : seul un élément réellement à l'arrêt la retire.
    if (cleSynthese === null && (audio.paused || audio.ended)) useVoix.getState().definirLecture(null)
  }
  audio.addEventListener('ended', fin)
  audio.addEventListener('error', fin)
  audio.addEventListener('pause', fin)
}

/** Utilisé par <LecteurAudio/> pour fournir l'élément monté dans le DOM. */
export function definirElementAudio(audio: HTMLAudioElement | null) {
  if (audio && audio !== element) {
    element?.pause()
    element = audio
    brancher(audio)
  }
}

function couperSynthese() {
  if (cleSynthese === null) return
  cleSynthese = null
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* synthèse indisponible */
  }
}

/** Un son (enregistré ou synthétisé) est-il en cours ? */
export function lectureEnCours(): boolean {
  return useVoix.getState().cleEnLecture !== null
}

export function arreter() {
  couperSynthese()
  element?.pause()
  useVoix.getState().definirLecture(null)
}

export function lire(url: string, cle: string) {
  const audio = obtenirElement()
  if (useVoix.getState().cleEnLecture === cle && (!audio.paused || cleSynthese === cle)) {
    arreter()
    return
  }
  couperSynthese()
  audio.pause()
  audio.src = url
  audio.currentTime = 0
  useVoix.getState().definirLecture(cle)
  const promesse = audio.play()
  if (promesse && typeof promesse.catch === 'function') {
    promesse.catch(() => useVoix.getState().definirLecture(null))
  }
}

/** La synthèse vocale du navigateur est-elle utilisable ? */
export function syntheseDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

/**
 * Repli des guides vocaux tant qu'aucun enregistrement n'est publié : la voix du navigateur lit le texte
 * (langue de l'interface). Même règle que `lire` : un seul son à la fois, un second appui arrête.
 */
export function lireTexte(texte: string, langue: string, cle: string): boolean {
  if (!syntheseDisponible() || !texte) return false
  if (useVoix.getState().cleEnLecture === cle && cleSynthese === cle) {
    arreter()
    return true
  }
  element?.pause()
  couperSynthese()
  const enonce = new window.SpeechSynthesisUtterance(texte)
  enonce.lang = langue
  enonce.rate = 0.95
  const voix = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(langue.slice(0, 2).toLowerCase()))
  if (voix) enonce.voice = voix
  const fin = () => {
    if (cleSynthese !== cle) return
    cleSynthese = null
    useVoix.getState().definirLecture(null)
  }
  enonce.onend = fin
  enonce.onerror = fin
  cleSynthese = cle
  useVoix.getState().definirLecture(cle)
  try {
    window.speechSynthesis.speak(enonce)
  } catch {
    fin()
    return false
  }
  return true
}
