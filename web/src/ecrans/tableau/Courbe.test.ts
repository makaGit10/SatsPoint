import { describe, expect, it } from 'vitest'
import { cheminCourbe, libelleJour } from './trace'

describe('cheminCourbe', () => {
  it('répartit les points sur la largeur et met le maximum en haut', () => {
    const trace = cheminCourbe(
      [
        { jour: '2026-11-06', montant_xof: 0, nombre: 0 },
        { jour: '2026-11-07', montant_xof: 50_000, nombre: 3 },
        { jour: '2026-11-08', montant_xof: 100_000, nombre: 5 },
      ],
      300,
      100,
    )
    expect(trace.maximum).toBe(100_000)
    expect(trace.points.map(([x]) => x)).toEqual([0, 150, 300])
    // 0 → sur la base ; max → marge haute (6 px) ; moitié → à mi-chemin.
    expect(trace.points[0]![1]).toBe(100)
    expect(trace.points[2]![1]).toBe(6)
    expect(trace.points[1]![1]).toBe(53)
    expect(trace.ligne).toBe('M0 100 L150 53 L300 6')
    expect(trace.aire).toBe('M0 100 L150 53 L300 6 L300 100 L0 100 Z')
  })

  it('centre un point unique et reste sur la base quand tout est à zéro', () => {
    expect(cheminCourbe([{ jour: '2026-11-08', montant_xof: 1000, nombre: 1 }], 200, 80).points).toEqual([[100, 6]])
    const plat = cheminCourbe(
      [
        { jour: '2026-11-07', montant_xof: 0, nombre: 0 },
        { jour: '2026-11-08', montant_xof: 0, nombre: 0 },
      ],
      200,
      80,
    )
    expect(plat.maximum).toBe(0)
    expect(plat.points.every(([, y]) => y === 80)).toBe(true)
  })

  it('renvoie des chemins vides sans point', () => {
    expect(cheminCourbe([], 100, 50)).toEqual({ points: [], ligne: '', aire: '', maximum: 0 })
  })
})

describe('libelleJour', () => {
  it('abrège le jour de la semaine selon la langue, ou donne le jour du mois', () => {
    expect(libelleJour('2026-11-08', 'fr', true).toLowerCase()).toBe('dim')
    expect(libelleJour('2026-11-08', 'en', true)).toBe('Sun')
    expect(libelleJour('2026-11-08', 'fr', false)).toBe('8')
  })
})
