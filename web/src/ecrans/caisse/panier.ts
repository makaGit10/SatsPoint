import type { Article } from '@/api/types'

export interface LignePanier {
  article: Article
  quantite: number
}

export function totalPanier(panier: LignePanier[]): number {
  return panier.reduce((s, l) => s + l.article.prix_xof * l.quantite, 0)
}

export function ajouterAuPanier(panier: LignePanier[], article: Article): LignePanier[] {
  const existante = panier.find((l) => l.article.ulid === article.ulid)
  if (!existante) return [...panier, { article, quantite: 1 }]
  return panier.map((l) => (l === existante ? { ...l, quantite: l.quantite + 1 } : l))
}

export function changerQuantite(panier: LignePanier[], ulid: string, delta: number): LignePanier[] {
  return panier.map((l) => (l.article.ulid === ulid ? { ...l, quantite: l.quantite + delta } : l)).filter((l) => l.quantite > 0)
}
