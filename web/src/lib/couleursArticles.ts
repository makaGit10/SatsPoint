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

export function estCouleurArticle(v: unknown): v is CouleurArticle {
  return typeof v === 'string' && (COULEURS_ARTICLES as readonly string[]).includes(v)
}

export function classesTuile(couleur: string): string {
  return CLASSES[estCouleurArticle(couleur) ? couleur : 'gris']
}

export function classePointCouleur(couleur: string): string {
  return PASTILLES[estCouleurArticle(couleur) ? couleur : 'gris']
}
