/**
 * Découpe des silences du nom dit à voix haute, AVANT l'envoi (le serveur les coupe aussi : ffmpeg du studio).
 *
 * À FUSIONNER : version minimale locale. La découpe partagée de l'aide vocale (web/src/voix/, autre chantier)
 * remplacera `couperSilences` dès qu'elle sera disponible — même signature : Blob → { blob, dureeMs }.
 *
 * Principe : décodage, passage en mono 16 kHz, énergie (RMS) par fenêtres de 20 ms, seuil adaptatif
 * (bruit de fond + marge), 120 ms gardées avant et après la voix, sortie WAV 16 bits (≈ 32 Ko par seconde).
 */
export const TAUX_SORTIE = 16_000
const FENETRE_MS = 20
const MARGE_MS = 120

/**
 * Indices [début, fin[ de la voix dans un signal mono, ou null si aucune voix ne dépasse le seuil.
 * Seuil = max(0,01 ; 4 × bruit de fond (10e centile) ; 12 % de la crête) — fonction pure (testée).
 */
export function bornesVoix(echantillons: Float32Array, taux: number): [number, number] | null {
  const taille = Math.max(1, Math.round((taux * FENETRE_MS) / 1000))
  const niveaux: number[] = []
  for (let i = 0; i < echantillons.length; i += taille) {
    let somme = 0
    const fin = Math.min(echantillons.length, i + taille)
    for (let j = i; j < fin; j++) somme += echantillons[j]! * echantillons[j]!
    niveaux.push(Math.sqrt(somme / Math.max(1, fin - i)))
  }
  if (niveaux.length === 0) return null
  const tries = [...niveaux].sort((a, b) => a - b)
  const bruit = tries[Math.floor(tries.length * 0.1)] ?? 0
  const crete = tries[tries.length - 1] ?? 0
  const seuil = Math.max(0.01, bruit * 4, crete * 0.12)
  const premiere = niveaux.findIndex((n) => n >= seuil)
  if (premiere < 0) return null
  let derniere = premiere
  for (let k = niveaux.length - 1; k >= premiere; k--) {
    if (niveaux[k]! >= seuil) {
      derniere = k
      break
    }
  }
  const marge = Math.round((taux * MARGE_MS) / 1000)
  return [Math.max(0, premiere * taille - marge), Math.min(echantillons.length, (derniere + 1) * taille + marge)]
}

/** WAV PCM 16 bits mono. */
export function encoderWav(echantillons: Float32Array, taux: number): Blob {
  const octets = echantillons.length * 2
  const tampon = new ArrayBuffer(44 + octets)
  const v = new DataView(tampon)
  const texte = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)))
  texte(0, 'RIFF')
  v.setUint32(4, 36 + octets, true)
  texte(8, 'WAVE')
  texte(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, taux, true)
  v.setUint32(28, taux * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  texte(36, 'data')
  v.setUint32(40, octets, true)
  for (let i = 0; i < echantillons.length; i++) {
    const s = Math.max(-1, Math.min(1, echantillons[i]!))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([tampon], { type: 'audio/wav' })
}

/** Silences de début et de fin coupés ; en cas d'échec (navigateur, format), l'enregistrement est rendu tel quel. */
export async function couperSilences(enregistrement: Blob): Promise<{ blob: Blob; dureeMs: number | null }> {
  const fenetre = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext; OfflineAudioContext?: typeof OfflineAudioContext }
  const Contexte = fenetre.AudioContext ?? fenetre.webkitAudioContext
  if (!Contexte || !fenetre.OfflineAudioContext) return { blob: enregistrement, dureeMs: null }
  let contexte: AudioContext | null = null
  try {
    contexte = new Contexte()
    const source = await contexte.decodeAudioData(await enregistrement.arrayBuffer())
    const longueur = Math.max(1, Math.ceil(source.duration * TAUX_SORTIE))
    const horsLigne = new fenetre.OfflineAudioContext(1, longueur, TAUX_SORTIE)
    const lecteur = horsLigne.createBufferSource()
    lecteur.buffer = source
    lecteur.connect(horsLigne.destination)
    lecteur.start()
    const mono = (await horsLigne.startRendering()).getChannelData(0)
    const bornes = bornesVoix(mono, TAUX_SORTIE)
    const garde = bornes ? mono.subarray(bornes[0], bornes[1]) : mono
    return { blob: encoderWav(garde, TAUX_SORTIE), dureeMs: Math.round((garde.length / TAUX_SORTIE) * 1000) }
  } catch {
    return { blob: enregistrement, dureeMs: null }
  } finally {
    void contexte?.close().catch(() => undefined)
  }
}
