/** Couleurs des tuiles d'articles : jetons `--tuile-*` (clair / sombre), jamais de couleur en dur. */
export const COULEURS_ARTICLES = ['orange', 'rouge', 'jaune', 'vert', 'bleu', 'violet', 'brun', 'gris'] as const
export type CouleurArticle = (typeof COULEURS_ARTICLES)[number]

const CLASSES: Record<CouleurArticle, string> = {
  orange: 'bg-tuile-orange text-tuile-orange-texte',
  rouge: 'bg-tuile-rouge text-tuile-rouge-texte',
  jaune: 'bg-tuile-jaune text-tuile-jaune-texte',
  vert: 'bg-tuile-vert text-tuile-vert-texte',
  bleu: 'bg-tuile-bleu text-tuile-bleu-texte',
  violet: 'bg-tuile-violet text-tuile-violet-texte',
  brun: 'bg-tuile-brun text-tuile-brun-texte',
  gris: 'bg-tuile-gris text-tuile-gris-texte',
}

const PASTILLES: Record<CouleurArticle, string> = {
  orange: 'bg-tuile-orange-texte',
  rouge: 'bg-tuile-rouge-texte',
  jaune: 'bg-tuile-jaune-texte',
  vert: 'bg-tuile-vert-texte',
  bleu: 'bg-tuile-bleu-texte',
  violet: 'bg-tuile-violet-texte',
  brun: 'bg-tuile-brun-texte',
  gris: 'bg-tuile-gris-texte',
}

/**
 * Valeur échangée avec l'API : `#RRGGBB` (CONTRAT_API § 9). L'affichage reste sur les jetons du thème :
 * chaque couleur de la palette a une valeur de référence, et une couleur quelconque (import, données
 * existantes) est rattachée à la teinte de la palette la plus proche.
 */
export const HEX_ARTICLES: Record<CouleurArticle, string> = {
  orange: '#EA580C',
  rouge: '#DC2626',
  jaune: '#CA8A04',
  vert: '#16A34A',
  bleu: '#0284C7',
  violet: '#7C3AED',
  brun: '#92400E',
  gris: '#6B7280',
}

export function estCouleurArticle(v: unknown): v is CouleurArticle {
  return typeof v === 'string' && (COULEURS_ARTICLES as readonly string[]).includes(v)
}

function rvb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Couleur de la palette pour une valeur reçue (`#RRGGBB` ou nom de la palette) ; gris si illisible. */
export function couleurDepuis(valeur: string | null | undefined): CouleurArticle {
  if (!valeur) return 'gris'
  if (estCouleurArticle(valeur)) return valeur
  const cible = rvb(valeur)
  if (!cible) return 'gris'
  let meilleure: CouleurArticle = 'gris'
  let distance = Number.POSITIVE_INFINITY
  for (const nom of COULEURS_ARTICLES) {
    const [r, v, b] = rvb(HEX_ARTICLES[nom])!
    const d = (r - cible[0]) ** 2 + (v - cible[1]) ** 2 + (b - cible[2]) ** 2
    if (d < distance) {
      distance = d
      meilleure = nom
    }
  }
  return meilleure
}

/** Valeur à envoyer à l'API pour une couleur de la palette. */
export function versHex(couleur: CouleurArticle): string {
  return HEX_ARTICLES[couleur]
}

export function classesTuile(couleur: string): string {
  return CLASSES[couleurDepuis(couleur)]
}

export function classePointCouleur(couleur: string): string {
  return PASTILLES[couleurDepuis(couleur)]
}
