import { decouperSignal, encoderWav, formeOnde, mixerMono, reechantillonner, tauxSortie } from './decoupe'

/**
 * Découpe des blancs dans le navigateur, partagée par le studio audio et les noms d'articles dits à voix haute :
 * décodage Web Audio de l'enregistrement du micro (webm, mp4, ogg) ou d'un fichier déposé (mp3, wav, m4a, ogg, webm),
 * découpe (`decoupe.ts`), puis WAV PCM 16 bits mono 44,1 / 48 kHz. Si ce navigateur ne sait pas décoder le format,
 * l'original est rendu tel quel (`decoupe: false`) : le serveur coupe les blancs de toute façon. Jamais d'exception.
 */
export const BARRES_FORME = 48

export interface ResultatDecoupe {
  /** WAV coupé, ou l'original si le décodage est impossible. */
  blob: Blob
  /** Durée après découpe (null si inconnue : décodage impossible). */
  dureeMs: number | null
  dureeAvantMs: number | null
  formeAvant: number[]
  formeApres: number[]
  /** Voix détectée (false : enregistrement silencieux, à refaire). */
  voix: boolean
  /** false : format non décodable ici, original renvoyé sans découpe. */
  decoupe: boolean
}

type FenetreAudio = typeof window & {
  webkitAudioContext?: typeof AudioContext
  webkitOfflineAudioContext?: typeof OfflineAudioContext
}

/** Décode un Blob (promesse ou rappels : ancien Safari). */
async function decoder(octets: ArrayBuffer): Promise<AudioBuffer | null> {
  const f = window as FenetreAudio
  const HorsLigne = f.OfflineAudioContext ?? f.webkitOfflineAudioContext
  const Direct = f.AudioContext ?? f.webkitAudioContext
  const essayer = (ctx: BaseAudioContext) =>
    new Promise<AudioBuffer>((resolve, reject) => {
      const promesse = ctx.decodeAudioData(octets.slice(0), resolve, reject)
      if (promesse && typeof promesse.then === 'function') promesse.then(resolve, reject)
    })
  if (HorsLigne) {
    try {
      return await essayer(new HorsLigne(1, 1, 48_000))
    } catch {
      /* on tente le contexte direct */
    }
  }
  if (Direct) {
    let ctx: AudioContext | null = null
    try {
      ctx = new Direct()
      return await essayer(ctx)
    } catch {
      return null
    } finally {
      void ctx?.close().catch(() => undefined)
    }
  }
  return null
}

/** Découpe complète d'un enregistrement (studio : aperçu avant / après puis envoi). */
export async function decouperEnregistrement(source: Blob): Promise<ResultatDecoupe> {
  const original: ResultatDecoupe = { blob: source, dureeMs: null, dureeAvantMs: null, formeAvant: [], formeApres: [], voix: true, decoupe: false }
  if (typeof window === 'undefined') return original
  let tampon: AudioBuffer | null = null
  try {
    tampon = await decoder(await source.arrayBuffer())
  } catch {
    tampon = null
  }
  if (!tampon || tampon.length === 0) return original
  try {
    const canaux = Array.from({ length: tampon.numberOfChannels }, (_, i) => tampon.getChannelData(i))
    const taux = tauxSortie(tampon.sampleRate)
    const mono = reechantillonner(mixerMono(canaux), tampon.sampleRate, taux)
    const r = decouperSignal(mono, taux)
    const formeAvant = formeOnde(mono, BARRES_FORME)
    if (!r.voix) return { ...original, dureeMs: r.dureeAvantMs, dureeAvantMs: r.dureeAvantMs, formeAvant, formeApres: formeAvant, voix: false, decoupe: true }
    return {
      blob: new Blob([encoderWav(r.echantillons, taux)], { type: 'audio/wav' }),
      dureeMs: r.dureeMs,
      dureeAvantMs: r.dureeAvantMs,
      formeAvant,
      formeApres: formeOnde(r.echantillons, BARRES_FORME),
      voix: true,
      decoupe: true,
    }
  } catch {
    return original
  }
}

/**
 * Forme courte (noms d'articles dits à voix haute) : blancs coupés, original rendu si le décodage est impossible
 * ou si aucune voix n'est détectée (le serveur décide).
 */
export async function couperSilences(enregistrement: Blob): Promise<{ blob: Blob; dureeMs: number | null }> {
  const r = await decouperEnregistrement(enregistrement)
  if (!r.voix) return { blob: enregistrement, dureeMs: r.dureeAvantMs }
  return { blob: r.blob, dureeMs: r.dureeMs }
}
