export interface PointCourbe {
  jour: string
  montant_xof: number
  nombre: number
}

export interface Trace {
  /** Coordonnées des points `[x, y]` dans le repère SVG. */
  points: Array<[number, number]>
  /** Chemin de la ligne (polyline). */
  ligne: string
  /** Chemin de l'aire sous la ligne (fermé sur la base). */
  aire: string
  maximum: number
}

export const MARGE_HAUT = 6

/**
 * Calcule la trace d'une série (pure, testable) : x réparti sur la largeur, y proportionnel au maximum.
 * Un seul point → il est centré ; aucun point → chemins vides.
 */
export function cheminCourbe(points: readonly PointCourbe[], largeur: number, hauteur: number): Trace {
  if (points.length === 0) return { points: [], ligne: '', aire: '', maximum: 0 }
  const maximum = Math.max(0, ...points.map((p) => p.montant_xof))
  const utile = hauteur - MARGE_HAUT
  const coordonnees: Array<[number, number]> = points.map((p, i) => {
    const x = points.length === 1 ? largeur / 2 : (i / (points.length - 1)) * largeur
    const y = maximum === 0 ? hauteur : hauteur - (p.montant_xof / maximum) * utile
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
  })
  const ligne = coordonnees.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const premier = coordonnees[0]!
  const dernier = coordonnees[coordonnees.length - 1]!
  const aire = `${ligne} L${dernier[0]} ${hauteur} L${premier[0]} ${hauteur} Z`
  return { points: coordonnees, ligne, aire, maximum }
}

/** Libellé court d'un jour `YYYY-MM-DD` : jour de la semaine abrégé (≤ 7 points) ou jour du mois. */
export function libelleJour(jour: string, locale: 'fr' | 'en', court: boolean): string {
  const date = new Date(`${jour}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return jour
  if (court) {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', '').slice(0, 3)
  }
  return String(date.getUTCDate())
}
