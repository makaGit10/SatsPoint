import { describe, expect, it } from 'vitest'
import {
  convertirEnSats,
  formaterCompteARebours,
  formaterDate,
  formaterDateHeure,
  formaterDateLongue,
  formaterFCFA,
  formaterHeure,
  formaterNombre,
  formaterSats,
  initiales,
  memeJourDakar,
} from './format'

const FINE = ' '
const INSEC = ' '

describe('montants', () => {
  it('groupe les milliers avec une espace fine insécable', () => {
    expect(formaterNombre(15000)).toBe(`15${FINE}000`)
    expect(formaterNombre(1234567)).toBe(`1${FINE}234${FINE}567`)
    expect(formaterNombre(999)).toBe('999')
    expect(formaterNombre(0)).toBe('0')
    expect(formaterNombre(-2500)).toBe(`-2${FINE}500`)
  })

  it('formate les FCFA', () => {
    expect(formaterFCFA(15000)).toBe(`15${FINE}000${INSEC}FCFA`)
    expect(formaterFCFA(100)).toBe(`100${INSEC}FCFA`)
  })

  it('formate les sats, avec ou sans ≈', () => {
    expect(formaterSats(23450)).toBe(`23${FINE}450${INSEC}sats`)
    expect(formaterSats(23450, { approx: true })).toBe(`≈${INSEC}23${FINE}450${INSEC}sats`)
  })

  it('ne formate jamais une valeur non finie', () => {
    expect(formaterNombre(Number.NaN)).toBe('—')
    expect(formaterNombre(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('convertit en sats arrondis au supérieur', () => {
    // 15 000 FCFA à 64 000 000 XOF/BTC → 23 437,5 → 23 438
    expect(convertirEnSats(15000, 64_000_000)).toBe(23438)
    expect(convertirEnSats(100, 64_000_000)).toBe(157)
    expect(convertirEnSats(100, 0)).toBe(0)
  })
})

describe('dates (Africa/Dakar = UTC+0)', () => {
  const iso = '2026-11-08T14:32:10Z'

  it('date et heure en FR et EN', () => {
    expect(formaterDateHeure(iso, 'fr')).toBe('08/11/2026 14:32')
    expect(formaterDateHeure(iso, 'en')).toBe('11/08/2026 14:32')
  })

  it('reste au fuseau de Dakar quel que soit le fuseau du système', () => {
    // 23:30 UTC → même jour à Dakar
    expect(formaterDateHeure('2026-11-08T23:30:00Z', 'fr')).toBe('08/11/2026 23:30')
    expect(formaterHeure('2026-11-08T00:05:00Z')).toBe('00:05')
  })

  it('date seule, heure seule, date longue', () => {
    expect(formaterDate(iso, 'fr')).toBe('08/11/2026')
    expect(formaterDate(iso, 'en')).toBe('11/08/2026')
    expect(formaterHeure(iso)).toBe('14:32')
    expect(formaterDateLongue(iso, 'fr')).toBe('8 novembre 2026')
    expect(formaterDateLongue(iso, 'en')).toBe('November 8, 2026')
  })

  it('valeur invalide → tiret', () => {
    expect(formaterDateHeure('pas une date')).toBe('—')
  })

  it('compare deux instants au même jour de Dakar', () => {
    expect(memeJourDakar('2026-11-08T00:10:00Z', '2026-11-08T23:50:00Z')).toBe(true)
    expect(memeJourDakar('2026-11-08T23:50:00Z', '2026-11-09T00:10:00Z')).toBe(false)
  })
})

describe('divers', () => {
  it('compte à rebours', () => {
    expect(formaterCompteARebours(299)).toBe('4:59')
    expect(formaterCompteARebours(0)).toBe('0:00')
    expect(formaterCompteARebours(-3)).toBe('0:00')
  })
  it('initiales', () => {
    expect(initiales('Awa Ndiaye')).toBe('AN')
    expect(initiales('moussa')).toBe('M')
  })
})
