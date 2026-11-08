import { describe, expect, it } from 'vitest'
import { attribuer, correspondanceInitiale, lireBooleen, lirePrix, suggererChamp, suggererCorrespondance, transformerLigne, validerCorrespondance } from './correspondance'

describe('suggestions de correspondance (synonymes FR / EN + similarité)', () => {
  it.each([
    ['Désignation', 'nom'],
    ['Libellé', 'nom'],
    ['Name', 'nom'],
    ['Nom du produit', 'nom'],
    ['Tarif', 'prix_xof'],
    ['Price', 'prix_xof'],
    ['PU', 'prix_xof'],
    ['Prix unitaire', 'prix_xof'],
    ['Prix de vnte', 'prix_xof'],
    ['Famille', 'categorie'],
    ['Category', 'categorie'],
    ['Réf.', 'sku'],
    ['Code article', 'sku'],
    ['Couleur', 'couleur'],
    ['Disponible', 'actif'],
  ])('« %s » → %s', (colonne, champ) => {
    expect(suggererChamp(colonne).champ).toBe(champ)
  })

  it('ne propose rien pour une colonne sans rapport', () => {
    expect(suggererChamp('Stock').champ).toBeNull()
    expect(suggererChamp('Fournisseur').champ).toBeNull()
  })

  it("n'attribue chaque champ qu'une fois : la colonne la plus proche gagne", () => {
    expect(suggererCorrespondance(['Libellé', 'Nom', 'PU', 'Stock'])).toEqual({ Libellé: null, Nom: 'nom', PU: 'prix_xof', Stock: null })
  })
})

describe('correspondance de départ et modifications', () => {
  it('reprend les suggestions du serveur, écarte les doublons et complète localement', () => {
    const c = correspondanceInitiale(['Désignation', 'Article', 'Tarif', 'Famille'], { Désignation: 'nom', Article: 'nom', Tarif: null })
    // Tarif : le serveur dit « ignorer » explicitement → respecté ; Famille : absent du serveur → suggestion locale.
    expect(c).toEqual({ Désignation: 'nom', Article: null, Tarif: null, Famille: 'categorie' })
  })

  it('attribuer un champ déjà pris libère l’autre colonne', () => {
    const c = attribuer({ A: 'nom', B: null, C: 'prix_xof' }, 'B', 'nom')
    expect(c).toEqual({ A: null, B: 'nom', C: 'prix_xof' })
    expect(attribuer(c, 'C', null)).toEqual({ A: null, B: 'nom', C: null })
  })

  it('exige le nom et le prix', () => {
    expect(validerCorrespondance({ A: 'nom', B: 'categorie' })).toEqual({ valide: false, manquants: ['prix_xof'] })
    expect(validerCorrespondance({ A: 'nom', B: 'prix_xof' }).valide).toBe(true)
  })
})

describe('transformation et validation des lignes (aperçu)', () => {
  it('lit les prix FCFA écrits de différentes façons', () => {
    expect(lirePrix('1 500')).toBe(1500)
    expect(lirePrix('1.500')).toBe(1500)
    expect(lirePrix('15 000 FCFA')).toBe(15000)
    expect(lirePrix('2500,00')).toBe(2500)
    expect(lirePrix('12,5')).toBeNull()
    expect(lirePrix('abc')).toBeNull()
  })

  it('lit oui / non / yes / no', () => {
    expect(lireBooleen('Oui')).toBe(true)
    expect(lireBooleen('no')).toBe(false)
    expect(lireBooleen('')).toBe(true)
    expect(lireBooleen('peut-être')).toBeNull()
  })

  it('applique la correspondance et signale les erreurs ligne par ligne', () => {
    const colonnes = ['Désignation', 'PU', 'Réf.', 'Stock']
    const c = { Désignation: 'nom', PU: 'prix_xof', 'Réf.': 'sku', Stock: null } as const
    expect(transformerLigne(['Bazin riche', '15 000', 'BZ-003', '12'], colonnes, c)).toEqual({ valeurs: { nom: 'Bazin riche', prix_xof: 15000, sku: 'BZ-003' }, erreurs: [] })
    expect(transformerLigne(['', 'gratuit', 'réf avec espace', '1'], colonnes, c).erreurs).toEqual(['nomManquant', 'prixInvalide', 'skuInvalide'])
  })
})
