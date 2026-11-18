import { describe, expect, it } from 'vitest'
import { prixDepuisTexte } from './prixParle'

describe('prix dit à voix haute', () => {
  it.each([
    ['100 francs', 100],
    ['100 F', 100],
    ['200', 200],
    ['1500 francs CFA', 1500],
    ['1 500 F', 1500],
    ['2.500', 2500],
    ['cent francs', 100],
    ['deux cents', 200],
    ['deux cent cinquante francs', 250],
    ['mille', 1000],
    ['mille cinq cents', 1500],
    ['deux mille cinq cents francs', 2500],
    ['quinze mille', 15000],
    ['soixante-dix', 70],
    ['quatre-vingt-dix', 90],
    ['quatre-vingts', 80],
    ['trois cent mille', 300000],
    ['un million', 1000000],
    ['2 mille', 2000],
    ['C’est 750 francs', 750],
  ])('« %s » → %d', (texte, attendu) => {
    expect(prixDepuisTexte(texte)).toBe(attendu)
  })

  it("ne devine jamais : rien d'exploitable → null", () => {
    expect(prixDepuisTexte('bonjour')).toBeNull()
    expect(prixDepuisTexte('')).toBeNull()
    expect(prixDepuisTexte('zéro')).toBeNull()
  })
})
