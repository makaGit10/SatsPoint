import { describe, expect, it } from 'vitest'
import type { Article } from '@/api/types'
import { convertirEnSats, formaterFCFA, formaterSats } from '@/lib/format'
import { ajouterAuPanier, changerQuantite, totalPanier } from './panier'
import { ajouterChiffres, LONGUEUR_MAX } from './saisie'

describe('saisie du pavé', () => {
  it('refuse les zéros en tête (0 et 000)', () => {
    expect(ajouterChiffres('', '0')).toBe('')
    expect(ajouterChiffres('', '000')).toBe('')
    expect(ajouterChiffres('1', '000')).toBe('1000')
    expect(ajouterChiffres('15', '000')).toBe('15000')
  })
  it('borne la longueur', () => {
    expect(ajouterChiffres('999999999', '9')).toHaveLength(LONGUEUR_MAX)
    expect(ajouterChiffres('12345678', '000')).toBe('123456780')
  })
  it('affichage et conversion en direct : 15 000 FCFA → ≈ 23 438 sats à 64 M', () => {
    const montant = Number(ajouterChiffres('15', '000'))
    expect(formaterFCFA(montant)).toBe('15 000 FCFA')
    expect(formaterSats(convertirEnSats(montant, 64_000_000), { approx: true })).toBe('≈ 23 438 sats')
  })
  it('arrondit toujours au sat supérieur (le commerçant reçoit au moins le prix)', () => {
    // 100 FCFA à 64 000 001 → 156,2499… → 157
    expect(convertirEnSats(100, 64_000_001)).toBe(157)
    // Exact : 640 FCFA à 64 000 000 → 1 000 sats pile
    expect(convertirEnSats(640, 64_000_000)).toBe(1000)
  })
})

const article = (ulid: string, prix: number): Article => ({ ulid, nom: ulid, prix_xof: prix, categorie: null, couleur: 'orange', sku: null, actif: true, position: 0 })

describe('panier', () => {
  it('ajoute, incrémente, retire', () => {
    let p = ajouterAuPanier([], article('A', 500))
    p = ajouterAuPanier(p, article('A', 500))
    p = ajouterAuPanier(p, article('B', 2500))
    expect(p.map((l) => [l.article.ulid, l.quantite])).toEqual([
      ['A', 2],
      ['B', 1],
    ])
    expect(totalPanier(p)).toBe(3500)
    p = changerQuantite(p, 'A', -2)
    expect(p.map((l) => l.article.ulid)).toEqual(['B'])
  })
})
