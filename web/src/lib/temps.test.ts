import { describe, expect, it } from 'vitest'
import { formaterPourcentage, secondesRestantes, tempsRelatif } from './temps'

const MAINTENANT = Date.parse('2026-11-08T12:00:00Z')

describe('temps relatif (clé i18n + paramètre)', () => {
  it('à l’instant, minutes, heures, jours (passé)', () => {
    expect(tempsRelatif('2026-11-08T11:59:40Z', MAINTENANT)).toEqual({ cle: 'temps.aLInstant', count: 0 })
    expect(tempsRelatif('2026-11-08T11:48:00Z', MAINTENANT)).toEqual({ cle: 'temps.minutes', count: 12 })
    expect(tempsRelatif('2026-11-08T09:00:00Z', MAINTENANT)).toEqual({ cle: 'temps.heures', count: 3 })
    expect(tempsRelatif('2026-11-05T12:00:00Z', MAINTENANT)).toEqual({ cle: 'temps.jours', count: 3 })
  })
  it('futur (expiration d’une invitation)', () => {
    expect(tempsRelatif('2026-11-08T12:45:00Z', MAINTENANT)).toEqual({ cle: 'temps.dansMinutes', count: 45 })
    expect(tempsRelatif('2026-11-11T12:00:00Z', MAINTENANT)).toEqual({ cle: 'temps.dansJours', count: 3 })
  })
  it('date invalide → à l’instant (jamais de plantage)', () => {
    expect(tempsRelatif('n’importe quoi', MAINTENANT).cle).toBe('temps.aLInstant')
  })
})

describe('secondes restantes', () => {
  it('compte vers 0 sans jamais passer en négatif', () => {
    expect(secondesRestantes('2026-11-08T12:04:59Z', MAINTENANT)).toBe(299)
    expect(secondesRestantes('2026-11-08T12:00:00Z', MAINTENANT)).toBe(0)
    expect(secondesRestantes('2026-11-08T11:00:00Z', MAINTENANT)).toBe(0)
  })
  it('arrondit au supérieur (4,2 s restantes → 5 affichées)', () => {
    expect(secondesRestantes('2026-11-08T12:00:04.200Z', MAINTENANT)).toBe(5)
  })
  it('sans échéance → null', () => {
    expect(secondesRestantes(null)).toBeNull()
    expect(secondesRestantes('pas une date')).toBeNull()
  })
})

describe('pourcentage', () => {
  it('signe explicite et arrondi', () => {
    expect(formaterPourcentage(12.4)).toBe('+12 %')
    expect(formaterPourcentage(-7.6)).toBe('-8 %')
    expect(formaterPourcentage(0)).toBe('0 %')
  })
})
