import { useVoix } from './store'

/**
 * Lecteur audio unique : un nouveau son coupe le précédent.
 * L'élément <audio> est créé à la demande (ou fourni par <LecteurAudio/>).
 */
let element: HTMLAudioElement | null = null

function obtenirElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.preload = 'none'
    brancher(element)
  }
  return element
}

function brancher(audio: HTMLAudioElement) {
  const fin = () => useVoix.getState().definirLecture(null)
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

export function arreter() {
  if (!element) return
  element.pause()
  useVoix.getState().definirLecture(null)
}

export function lire(url: string, cle: string) {
  const audio = obtenirElement()
  if (useVoix.getState().cleEnLecture === cle && !audio.paused) {
    arreter()
    return
  }
  audio.pause()
  audio.src = url
  audio.currentTime = 0
  useVoix.getState().definirLecture(cle)
  const promesse = audio.play()
  if (promesse && typeof promesse.catch === 'function') {
    promesse.catch(() => useVoix.getState().definirLecture(null))
  }
}
