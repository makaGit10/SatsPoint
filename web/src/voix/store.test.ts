import { afterEach, describe, expect, it } from 'vitest'
import { CLES_STOCKAGE } from '@/lib/stockage'
import { estLangueAudio, estLangueLocale, useVoix } from './store'

describe('store voix : langues dynamiques (CONTRAT_API § 14)', () => {
  afterEach(() => {
    window.localStorage.clear()
    useVoix.setState({ langueAudio: null, pays: null, activee: false })
  })

  it('accepte tout code de langue valide, refuse le reste', () => {
    for (const ok of ['wo', 'fr', 'bm', 'dyu', 'ff-ml']) expect(estLangueAudio(ok)).toBe(true)
    for (const ko of [null, undefined, 3, '', 'WO', 'x', '../fr', 'wo/../../']) expect(estLangueAudio(ko)).toBe(false)
  })

  it('toute langue autre que le français est « locale » (aide vocale active par défaut)', () => {
    expect(estLangueLocale('wo')).toBe(true)
    expect(estLangueLocale('bm')).toBe(true)
    expect(estLangueLocale('fr')).toBe(false)
    expect(estLangueLocale(null)).toBe(false)
  })

  it('mémorise la langue et le pays de l’appareil', () => {
    useVoix.getState().definirLangue('dyu')
    useVoix.getState().definirPays('CI')
    expect(useVoix.getState().langueAudio).toBe('dyu')
    expect(useVoix.getState().pays).toBe('CI')
    expect(window.localStorage.getItem(CLES_STOCKAGE.langueAudio)).toBe('dyu')
    expect(window.localStorage.getItem(CLES_STOCKAGE.pays)).toBe('CI')
  })
})
