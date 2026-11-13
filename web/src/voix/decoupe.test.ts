import { describe, expect, it } from 'vitest'
import { decouperSignal, encoderWav, enveloppeDb, formeOnde, mixerMono, reechantillonner, seuilAdaptatif, tauxSortie, versDb } from './decoupe'

const TAUX = 48_000

/** Générateur déterministe (bruit reproductible). */
function aleatoire(graine = 7) {
  let e = graine >>> 0
  return () => {
    e = (e * 1664525 + 1013904223) >>> 0
    return e / 0x100000000 - 0.5
  }
}

/** Signal : suite de segments `silence` (bruit de micro de téléphone ≈ -48 dBFS) ou `voix` (sinus 220 Hz modulé). */
function signal(segments: Array<['silence' | 'voix', number]>, { bruit = 0.008, amplitude = 0.3 } = {}) {
  const hasard = aleatoire()
  const total = segments.reduce((s, [, ms]) => s + Math.round((TAUX * ms) / 1000), 0)
  const sortie = new Float32Array(total)
  let i = 0
  for (const [type, ms] of segments) {
    const n = Math.round((TAUX * ms) / 1000)
    for (let k = 0; k < n; k++, i++) {
      const b = hasard() * 2 * bruit
      sortie[i] = type === 'voix' ? amplitude * Math.sin((2 * Math.PI * 220 * k) / TAUX) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * k) / TAUX)) + b : b
    }
  }
  return sortie
}

describe('découpe des blancs (fonctions pures)', () => {
  it('coupe le début et la fin en gardant ~100 ms avant et ~120 ms après la voix', () => {
    const r = decouperSignal(signal([['silence', 1500], ['voix', 800], ['silence', 1000]]), TAUX)
    expect(r.voix).toBe(true)
    expect(r.dureeAvantMs).toBe(3300)
    // 800 ms de voix + 100 + 120 de marges (± une fenêtre de 10 ms de chaque côté).
    expect(r.dureeMs).toBeGreaterThanOrEqual(1000)
    expect(r.dureeMs).toBeLessThanOrEqual(1060)
  })

  it('ramène un silence interne de plus de 0,5 s à 0,25 s, garde les pauses courtes entre les mots', () => {
    const long = decouperSignal(signal([['silence', 600], ['voix', 600], ['silence', 1200], ['voix', 600], ['silence', 900]]), TAUX)
    expect(long.silencesRaccourcis).toBe(1)
    // 1200 voix + 250 de silence gardé + 220 de marges.
    expect(long.dureeMs).toBeGreaterThanOrEqual(1640)
    expect(long.dureeMs).toBeLessThanOrEqual(1720)

    const court = decouperSignal(signal([['voix', 500], ['silence', 300], ['voix', 500]]), TAUX)
    expect(court.silencesRaccourcis).toBe(0)
    expect(court.dureeMs).toBeGreaterThanOrEqual(1280)
  })

  it('laisse quasi intact un signal sans silence', () => {
    const r = decouperSignal(signal([['voix', 1500]]), TAUX)
    expect(r.voix).toBe(true)
    expect(Math.abs(r.dureeMs - 1500)).toBeLessThanOrEqual(20)
  })

  it('garde entier un son continu sans aucun creux (fichier déjà coupé net) au lieu de le refuser', () => {
    const ton = new Float32Array(TAUX * 1.2)
    for (let k = 0; k < ton.length; k++) ton[k] = 0.37 * Math.sin((2 * Math.PI * 440 * k) / TAUX)
    const r = decouperSignal(ton, TAUX)
    expect(r.voix).toBe(true)
    expect(Math.abs(r.dureeMs - 1200)).toBeLessThanOrEqual(20)
  })

  it('signale « aucune voix » sur un silence (bruit de fond seul) et ne coupe rien', () => {
    const source = signal([['silence', 2000]])
    const r = decouperSignal(source, TAUX)
    expect(r.voix).toBe(false)
    expect(r.echantillons).toBe(source)
    expect(decouperSignal(new Float32Array(TAUX), TAUX).voix).toBe(false)
  })

  it('ignore un clic isolé dans le silence (bouffée de moins de 30 ms)', () => {
    const source = signal([['silence', 800], ['voix', 600], ['silence', 1500]])
    const clic = Math.round(TAUX * 1.9)
    for (let k = 0; k < Math.round(TAUX * 0.01); k++) source[clic + k] = 0.5
    const r = decouperSignal(source, TAUX)
    expect(r.dureeMs).toBeLessThanOrEqual(860)
  })

  it('normalise légèrement : crête à -1 dBFS sans jamais écrêter, gain plafonné à +12 dB', () => {
    const fort = decouperSignal(signal([['voix', 500]], { amplitude: 0.95, bruit: 0.002 }), TAUX)
    const creteFort = Math.max(...fort.echantillons.map(Math.abs))
    expect(creteFort).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6)

    const faible = decouperSignal(signal([['silence', 300], ['voix', 500], ['silence', 300]], { amplitude: 0.02, bruit: 0.0005 }), TAUX)
    expect(faible.voix).toBe(true)
    expect(faible.gainDb).toBeLessThanOrEqual(12 + 1e-6)
    expect(faible.gainDb).toBeGreaterThan(11)
  })

  it('seuil adaptatif borné, adapté au bruit du micro', () => {
    const bruyant = seuilAdaptatif(enveloppeDb(signal([['silence', 1000], ['voix', 500]], { bruit: 0.03 }), TAUX))
    const calme = seuilAdaptatif(enveloppeDb(signal([['silence', 1000], ['voix', 500]], { bruit: 0 }), TAUX))
    expect(bruyant.seuilDb).toBeGreaterThan(calme.seuilDb)
    for (const s of [bruyant, calme]) {
      expect(s.seuilDb).toBeGreaterThanOrEqual(-55)
      expect(s.seuilDb).toBeLessThanOrEqual(-28)
    }
    expect(versDb(1)).toBe(0)
  })

  it('mono, rééchantillonnage, forme d’onde et taux de sortie', () => {
    expect(Array.from(mixerMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5])
    expect(reechantillonner(new Float32Array(22_050), 22_050, 48_000).length).toBe(48_000)
    expect(tauxSortie(44_100)).toBe(44_100)
    expect(tauxSortie(48_000)).toBe(48_000)
    expect(tauxSortie(16_000)).toBe(48_000)
    const forme = formeOnde(signal([['silence', 500], ['voix', 500]]), 20)
    expect(forme).toHaveLength(20)
    expect(Math.max(...forme.slice(0, 9))).toBeLessThan(0.05)
    expect(Math.max(...forme.slice(11))).toBeGreaterThan(0.2)
  })

  it('encode un WAV PCM 16 bits mono valide', () => {
    const wav = encoderWav(Float32Array.of(0, 1, -1, 0.5), 48_000)
    const v = new DataView(wav)
    const lire = (p: number, n: number) => String.fromCharCode(...new Uint8Array(wav, p, n))
    expect(lire(0, 4)).toBe('RIFF')
    expect(lire(8, 4)).toBe('WAVE')
    expect(lire(36, 4)).toBe('data')
    expect(wav.byteLength).toBe(44 + 8)
    expect(v.getUint32(4, true)).toBe(36 + 8)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(48_000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getInt16(46, true)).toBe(0x7fff)
    expect(v.getInt16(48, true)).toBe(-0x8000)
  })
})
