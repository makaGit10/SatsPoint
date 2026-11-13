/**
 * Découpe des blancs d'un enregistrement vocal (studio audio, noms d'articles dits à voix haute), AVANT l'aperçu et
 * l'envoi. Fonctions PURES (aucune API du navigateur : testées avec des signaux synthétiques) ; le décodage et
 * l'encodage du Blob sont dans `decoupeAudio.ts`. Le serveur coupe aussi (ffmpeg) et reste juge.
 *
 * Méthode :
 * 1. énergie (RMS) par fenêtres de 10 ms, en dBFS ;
 * 2. bruit de fond = 10e centile des fenêtres, crête = 99e centile ;
 *    seuil = min(bruit + 12 dB, mi-chemin bruit ↔ crête), borné entre -55 et -28 dBFS (micros de téléphone bruyants) ;
 *    « aucune voix » si la crête dépasse le bruit de moins de 10 dB ou reste sous -50 dBFS ;
 * 3. zones de voix = fenêtres au-dessus du seuil (bouffées de moins de 30 ms ignorées : clics, souffle) ;
 * 4. on garde 100 ms avant la première voix et 120 ms après la dernière (fins de mots) ;
 *    tout silence INTERNE de plus de 0,5 s est ramené à 0,25 s (fondus de 8 ms aux raccords : aucun clic) ;
 * 5. normalisation légère : crête visée -1 dBFS, gain plafonné à +12 dB, jamais d'écrêtage.
 */

export interface OptionsDecoupe {
  fenetreMs: number
  avantMs: number
  apresMs: number
  /** Au-delà, un silence interne est raccourci… */
  silenceMaxMs: number
  /** …à cette durée. */
  silenceGardeMs: number
  fonduMs: number
  /** Bouffée minimale comptée comme de la voix. */
  voixMinMs: number
  margeBruitDb: number
  seuilMinDb: number
  seuilMaxDb: number
  creteCibleDb: number
  gainMaxDb: number
}

export const OPTIONS_DECOUPE: OptionsDecoupe = {
  fenetreMs: 10,
  avantMs: 100,
  apresMs: 120,
  silenceMaxMs: 500,
  silenceGardeMs: 250,
  fonduMs: 8,
  voixMinMs: 30,
  margeBruitDb: 12,
  seuilMinDb: -55,
  seuilMaxDb: -28,
  creteCibleDb: -1,
  gainMaxDb: 12,
}

/** Taux de sortie : 44,1 ou 48 kHz conservés, tout autre taux rééchantillonné à 48 kHz. */
export function tauxSortie(taux: number): number {
  return taux === 44_100 || taux === 48_000 ? taux : 48_000
}

export function versDb(lineaire: number): number {
  return 20 * Math.log10(Math.max(lineaire, 1e-9))
}

function depuisDb(db: number): number {
  return 10 ** (db / 20)
}

/** Moyenne des canaux (mixage mono). */
export function mixerMono(canaux: readonly Float32Array[]): Float32Array {
  if (canaux.length === 0) return new Float32Array(0)
  if (canaux.length === 1) return canaux[0]!
  const n = Math.min(...canaux.map((c) => c.length))
  const sortie = new Float32Array(n)
  for (const c of canaux) for (let i = 0; i < n; i++) sortie[i]! += c[i]! / canaux.length
  return sortie
}

/** Rééchantillonnage linéaire (voix : largement suffisant). */
export function reechantillonner(echantillons: Float32Array, de: number, vers: number): Float32Array {
  if (de === vers || echantillons.length === 0) return echantillons
  const n = Math.max(1, Math.round((echantillons.length * vers) / de))
  const sortie = new Float32Array(n)
  const pas = de / vers
  for (let i = 0; i < n; i++) {
    const x = i * pas
    const a = Math.floor(x)
    const b = Math.min(echantillons.length - 1, a + 1)
    const f = x - a
    sortie[i] = (echantillons[a] ?? 0) * (1 - f) + (echantillons[b] ?? 0) * f
  }
  return sortie
}

/** Énergie RMS (dBFS) par fenêtres consécutives de `fenetreMs`. */
export function enveloppeDb(echantillons: Float32Array, taux: number, fenetreMs = OPTIONS_DECOUPE.fenetreMs): Float32Array {
  const taille = Math.max(1, Math.round((taux * fenetreMs) / 1000))
  const n = Math.ceil(echantillons.length / taille)
  const env = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const debut = k * taille
    const fin = Math.min(echantillons.length, debut + taille)
    let somme = 0
    for (let i = debut; i < fin; i++) somme += echantillons[i]! * echantillons[i]!
    env[k] = versDb(Math.sqrt(somme / Math.max(1, fin - debut)))
  }
  return env
}

function centile(valeurs: Float32Array, p: number): number {
  if (valeurs.length === 0) return -180
  const tries = Float32Array.from(valeurs).sort()
  return tries[Math.min(tries.length - 1, Math.max(0, Math.floor(tries.length * p)))]!
}

export interface Seuil {
  bruitDb: number
  creteDb: number
  seuilDb: number
  voix: boolean
}

/** Seuil adaptatif au bruit de fond (micro de téléphone, rue, boutique). */
export function seuilAdaptatif(env: Float32Array, options: OptionsDecoupe = OPTIONS_DECOUPE): Seuil {
  const bruitDb = Math.max(-90, centile(env, 0.1))
  const creteDb = centile(env, 0.99)
  // Signal fort d'un bout à l'autre, sans creux (fichier déjà coupé, parole continue) : tout est de la voix,
  // rien n'est coupé — sinon le « fond » mesuré serait la voix elle-même et l'enregistrement serait refusé.
  if (creteDb - bruitDb < 10 && bruitDb > -35) return { bruitDb, creteDb, seuilDb: Math.max(options.seuilMinDb, bruitDb - 10), voix: true }
  const brut = Math.min(bruitDb + options.margeBruitDb, (bruitDb + creteDb) / 2)
  const seuilDb = Math.min(options.seuilMaxDb, Math.max(options.seuilMinDb, brut))
  const voix = creteDb - bruitDb >= 10 && creteDb > -50 && creteDb > seuilDb
  return { bruitDb, creteDb, seuilDb, voix }
}

/** Zones de voix [début, fin[ en indices de fenêtre ; les bouffées trop courtes sont ignorées. */
export function zonesVoix(env: Float32Array, seuilDb: number, voixMinFenetres: number): Array<[number, number]> {
  const zones: Array<[number, number]> = []
  let debut = -1
  for (let k = 0; k <= env.length; k++) {
    const actif = k < env.length && env[k]! >= seuilDb
    if (actif && debut < 0) debut = k
    else if (!actif && debut >= 0) {
      if (k - debut >= voixMinFenetres) zones.push([debut, k])
      debut = -1
    }
  }
  return zones
}

export interface ResultatPur {
  echantillons: Float32Array
  taux: number
  /** Aucune voix détectée : `echantillons` est l'original (rien n'est coupé). */
  voix: boolean
  dureeAvantMs: number
  dureeMs: number
  seuil: Seuil
  gainDb: number
  /** Silences internes raccourcis. */
  silencesRaccourcis: number
}

function fondu(morceau: Float32Array, longueur: number, entree: boolean, sortie: boolean) {
  const n = Math.min(longueur, Math.floor(morceau.length / 2))
  for (let i = 0; i < n; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n)
    if (entree) morceau[i]! *= g
    if (sortie) morceau[morceau.length - 1 - i]! *= g
  }
}

/** Découpe complète d'un signal mono : blancs du début / de la fin, silences internes longs, normalisation légère. */
export function decouperSignal(source: Float32Array, taux: number, options: OptionsDecoupe = OPTIONS_DECOUPE): ResultatPur {
  const ms = (n: number) => Math.round((n / taux) * 1000)
  const env = enveloppeDb(source, taux, options.fenetreMs)
  const seuil = seuilAdaptatif(env, options)
  const base = { taux, dureeAvantMs: ms(source.length), seuil }
  const fenetre = Math.max(1, Math.round((taux * options.fenetreMs) / 1000))
  const zones = seuil.voix ? zonesVoix(env, seuil.seuilDb, Math.max(1, Math.round(options.voixMinMs / options.fenetreMs))) : []
  if (zones.length === 0) return { ...base, echantillons: source, voix: false, dureeMs: ms(source.length), gainDb: 0, silencesRaccourcis: 0 }

  const avant = Math.round((taux * options.avantMs) / 1000)
  const apres = Math.round((taux * options.apresMs) / 1000)
  const garde = Math.round((taux * options.silenceGardeMs) / 1000)
  const silenceMax = Math.round((taux * options.silenceMaxMs) / 1000)

  // Intervalles d'échantillons à garder : chaque zone avec ses marges ; les silences internes longs sont raccourcis.
  const intervalles: Array<[number, number]> = []
  let silencesRaccourcis = 0
  let courant: [number, number] = [Math.max(0, zones[0]![0] * fenetre - avant), 0]
  for (let z = 0; z < zones.length; z++) {
    const finVoix = Math.min(source.length, zones[z]![1] * fenetre)
    const suivante = zones[z + 1]
    if (!suivante) {
      courant[1] = Math.min(source.length, finVoix + apres)
      intervalles.push(courant)
      break
    }
    const debutSuivante = suivante[0] * fenetre
    if (debutSuivante - finVoix > silenceMax) {
      // Garder la moitié du silence conservé après la voix, l'autre moitié avant la suivante.
      courant[1] = finVoix + Math.floor(garde / 2)
      intervalles.push(courant)
      courant = [debutSuivante - Math.ceil(garde / 2), 0]
      silencesRaccourcis++
    }
  }

  const total = intervalles.reduce((s, [a, b]) => s + (b - a), 0)
  const sortie = new Float32Array(total)
  const longueurFondu = Math.max(1, Math.round((taux * options.fonduMs) / 1000))
  let position = 0
  for (const [a, b] of intervalles) {
    const morceau = source.slice(a, b)
    // Fondus à chaque raccord (dans le silence conservé) et aux deux extrémités.
    fondu(morceau, longueurFondu, true, true)
    sortie.set(morceau, position)
    position += morceau.length
  }

  let crete = 0
  for (let i = 0; i < sortie.length; i++) crete = Math.max(crete, Math.abs(sortie[i]!))
  let gainDb = 0
  if (crete > 0) {
    const gain = Math.min(depuisDb(options.gainMaxDb), depuisDb(options.creteCibleDb) / crete)
    gainDb = versDb(gain)
    for (let i = 0; i < sortie.length; i++) sortie[i] = Math.max(-1, Math.min(1, sortie[i]! * gain))
  }

  return { ...base, echantillons: sortie, voix: true, dureeMs: ms(sortie.length), gainDb, silencesRaccourcis }
}

/** Résumé de forme d'onde : `n` crêtes (0–1) pour dessiner des barres. */
export function formeOnde(echantillons: Float32Array, n: number): number[] {
  if (n <= 0) return []
  const forme = new Array<number>(n).fill(0)
  if (echantillons.length === 0) return forme
  const pas = echantillons.length / n
  for (let k = 0; k < n; k++) {
    const debut = Math.floor(k * pas)
    const fin = Math.max(debut + 1, Math.floor((k + 1) * pas))
    let m = 0
    for (let i = debut; i < fin && i < echantillons.length; i++) m = Math.max(m, Math.abs(echantillons[i]!))
    forme[k] = Math.min(1, m)
  }
  return forme
}

/** WAV PCM 16 bits mono (en-tête RIFF/WAVE de 44 octets). */
export function encoderWav(echantillons: Float32Array, taux: number): ArrayBuffer {
  const octets = echantillons.length * 2
  const tampon = new ArrayBuffer(44 + octets)
  const v = new DataView(tampon)
  const texte = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i))
  }
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
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
  }
  return tampon
}
