import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DUREE_MAX_MS, ETAT_INITIAL, reduireEnregistreur } from './enregistreur'
import { prochaineManquante, verifierFichierAudio } from './selection'
import { useEnregistreur } from './useEnregistreur'
import type { CleAudio, StatutAudio } from '@/api/types'

/** MediaRecorder simulé : produit un morceau de données à l'arrêt. */
class FauxMediaRecorder {
  static instances: FauxMediaRecorder[] = []
  static isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_flux: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm'
    FauxMediaRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['son'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const piste = { readyState: 'live', stop: vi.fn() }
const flux = { getTracks: () => [piste], getAudioTracks: () => [piste] }
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  FauxMediaRecorder.instances = []
  piste.stop.mockClear()
  getUserMedia = vi.fn(() => Promise.resolve(flux))
  vi.stubGlobal('MediaRecorder', FauxMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  URL.createObjectURL = vi.fn(() => 'blob:prise')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Laisse la promesse getUserMedia se résoudre. */
async function microAccorde() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('machine d’état de l’enregistrement (pure)', () => {
  it('décompte 3-2-1 puis enregistre ; une prise trop courte est refusée', () => {
    let e = reduireEnregistreur(ETAT_INITIAL, { type: 'demander' })
    e = reduireEnregistreur(e, { type: 'microPret' })
    expect([e.phase, e.decompte]).toEqual(['decompte', 3])
    e = reduireEnregistreur(e, { type: 'ticDecompte' })
    e = reduireEnregistreur(e, { type: 'ticDecompte' })
    expect(e.decompte).toBe(1)
    e = reduireEnregistreur(e, { type: 'ticDecompte' })
    expect(e.phase).toBe('enregistrement')
    e = reduireEnregistreur(e, { type: 'ticEnregistrement', dureeMs: 20_000, niveau: 0.5 })
    expect(e.dureeMs).toBe(DUREE_MAX_MS)
    expect(reduireEnregistreur(e, { type: 'termine', blob: new Blob(), url: 'u', dureeMs: 120 })).toMatchObject({ phase: 'erreur', erreur: 'tropCourt' })
  })

  it('ignore une demande pendant un enregistrement', () => {
    const e = { ...ETAT_INITIAL, phase: 'enregistrement' as const }
    expect(reduireEnregistreur(e, { type: 'demander' })).toBe(e)
  })
})

describe('useEnregistreur (MediaRecorder simulé)', () => {
  it('demande le micro, décompte, enregistre, puis s’arrête seul à 15 s', async () => {
    const { result } = renderHook(() => useEnregistreur())
    act(() => result.current.demarrer())
    expect(result.current.etat.phase).toBe('demande')
    await microAccorde()
    expect(result.current.etat).toMatchObject({ phase: 'decompte', decompte: 3 })
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.etat.decompte).toBe(2)
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.etat.phase).toBe('enregistrement')
    expect(FauxMediaRecorder.instances).toHaveLength(1)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.etat.dureeMs).toBeGreaterThanOrEqual(4900)
    act(() => vi.advanceTimersByTime(DUREE_MAX_MS))
    expect(result.current.etat).toMatchObject({ phase: 'pret', url: 'blob:prise' })
    expect(result.current.etat.blob?.size).toBeGreaterThan(0)
  })

  it('Espace (arrêter) garde la prise ; Refaire relance le décompte sans redemander le micro', async () => {
    const { result } = renderHook(() => useEnregistreur())
    act(() => result.current.demarrer())
    await microAccorde()
    act(() => vi.advanceTimersByTime(3000 + 2000))
    act(() => result.current.arreter())
    expect(result.current.etat.phase).toBe('pret')
    act(() => result.current.refaire())
    expect(result.current.etat.phase).toBe('decompte')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prise')
  })

  it('arrêter pendant le décompte annule sans enregistrer', async () => {
    const { result } = renderHook(() => useEnregistreur())
    act(() => result.current.demarrer())
    await microAccorde()
    act(() => result.current.arreter())
    expect(result.current.etat.phase).toBe('repos')
    act(() => vi.advanceTimersByTime(5000))
    expect(FauxMediaRecorder.instances).toHaveLength(0)
  })

  it('micro refusé → message clair (le dépôt de fichier reste possible)', async () => {
    getUserMedia.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('refus'), { name: 'NotAllowedError' })))
    const { result } = renderHook(() => useEnregistreur())
    act(() => result.current.demarrer())
    await microAccorde()
    expect(result.current.etat.phase).toBe('refuse')
  })

  it('sans MediaRecorder → indisponible', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const { result } = renderHook(() => useEnregistreur())
    act(() => result.current.demarrer())
    expect(result.current.etat.phase).toBe('indisponible')
  })

  it('libère le micro au démontage', async () => {
    const { result, unmount } = renderHook(() => useEnregistreur())
    act(() => result.current.demarrer())
    await microAccorde()
    unmount()
    expect(piste.stop).toHaveBeenCalled()
  })
})

describe('mode rafale et dépôt', () => {
  const cle = (c: string, wo: StatutAudio, ordre: number): CleAudio => ({
    cle: c,
    ecran: 'caisse',
    contexte: '',
    texte_fr: c,
    texte_en: c,
    essentielle: true,
    ordre,
    etats: { wo: { statut: wo } },
  })
  const cles = [cle('a', 'publie', 0), cle('b', 'manquant', 1), cle('c', 'brouillon', 2), cle('d', 'erreur', 3)]

  it('passe à la prochaine case manquante (ou en erreur) de la langue, en boucle', () => {
    expect(prochaineManquante(cles, 'wo', 'a')).toBe('b')
    expect(prochaineManquante(cles, 'wo', 'b')).toBe('d')
    expect(prochaineManquante(cles, 'wo', 'd')).toBe('b')
    expect(prochaineManquante([cles[0]!], 'wo', 'a')).toBeNull()
  })

  it('refuse les formats et tailles hors contrat', () => {
    expect(verifierFichierAudio({ name: 'voix.mp3', size: 1000, type: 'audio/mpeg' })).toBeNull()
    expect(verifierFichierAudio({ name: 'voix.flac', size: 1000, type: 'audio/flac' })).toBe('format')
    expect(verifierFichierAudio({ name: 'voix.wav', size: 3 * 1024 * 1024, type: 'audio/wav' })).toBe('taille')
  })
})
