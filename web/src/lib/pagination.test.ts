import { describe, expect, it } from 'vitest'
import { bornerPage, bornesLignes, lirePage, nombrePages, pagesCompactes, tranche } from './pagination'

describe('pagesCompactes', () => {
  it('liste toutes les pages quand il y en a 7 ou moins', () => {
    expect(pagesCompactes(1, 1)).toEqual([1])
    expect(pagesCompactes(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('garde première, dernière, courante et voisines, avec des ellipses (7 éléments au plus)', () => {
    expect(pagesCompactes(1, 12)).toEqual([1, 2, 3, 4, 5, 'ellipse-fin', 12])
    expect(pagesCompactes(5, 12)).toEqual([1, 'ellipse-debut', 4, 5, 6, 'ellipse-fin', 12])
    expect(pagesCompactes(12, 12)).toEqual([1, 'ellipse-debut', 8, 9, 10, 11, 12])
    for (let p = 1; p <= 40; p++) expect(pagesCompactes(p, 40)).toHaveLength(7)
  })

  it("n'utilise jamais d'ellipse pour cacher une seule page", () => {
    expect(pagesCompactes(4, 12)).toEqual([1, 2, 3, 4, 5, 'ellipse-fin', 12])
    expect(pagesCompactes(9, 12)).toEqual([1, 'ellipse-debut', 8, 9, 10, 11, 12])
  })

  it('borne une page hors limites', () => {
    expect(pagesCompactes(99, 9)).toEqual([1, 'ellipse-debut', 5, 6, 7, 8, 9])
    expect(pagesCompactes(-3, 9)).toEqual([1, 2, 3, 4, 5, 'ellipse-fin', 9])
  })
})

describe('outils de pagination', () => {
  it('compte les pages (au moins une) et borne la page', () => {
    expect(nombrePages(0, 20)).toBe(1)
    expect(nombrePages(248, 30)).toBe(9)
    expect(bornerPage(12, 9)).toBe(9)
    expect(bornerPage(0, 9)).toBe(1)
    expect(bornerPage(Number.NaN, 9)).toBe(1)
  })

  it('calcule les rangs affichés (« 31–60 sur 248 »)', () => {
    expect(bornesLignes(2, 30, 248)).toEqual([31, 60])
    expect(bornesLignes(9, 30, 248)).toEqual([241, 248])
    expect(bornesLignes(1, 20, 0)).toEqual([0, 0])
    expect(bornesLignes(10, 30, 248)).toEqual([0, 0])
  })

  it('découpe une liste chargée', () => {
    const liste = Array.from({ length: 45 }, (_, i) => i + 1)
    expect(tranche(liste, 1, 20)).toHaveLength(20)
    expect(tranche(liste, 3, 20)).toEqual([41, 42, 43, 44, 45])
  })

  it("lit la page de l'adresse en refusant tout ce qui n'est pas un entier positif", () => {
    expect(lirePage('3')).toBe(3)
    expect(lirePage(null)).toBe(1)
    expect(lirePage('0')).toBe(1)
    expect(lirePage('-2')).toBe(1)
    expect(lirePage('2.5')).toBe(1)
    expect(lirePage('abc')).toBe(1)
    expect(lirePage('99999999')).toBe(1)
  })
})
