/**
 * Pont de navigation utilisable hors des composants (client API, temps réel).
 * Le routeur enregistre sa fonction `navigate` au montage.
 */
type Navigateur = (vers: string, options?: { replace?: boolean }) => void

let navigateur: Navigateur | null = null

export function definirNavigateur(fn: Navigateur | null) {
  navigateur = fn
}

export function allerVers(vers: string, options?: { replace?: boolean }) {
  if (navigateur) navigateur(vers, options)
  else if (typeof window !== 'undefined') window.location.assign(vers)
}

export function cheminCourant(): string {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}`
}

/** Chemins accessibles sans session (aucune redirection sur 401). */
const PREFIXES_PUBLICS = ['/langue', '/accueil', '/connexion', '/inscription', '/mot-de-passe', '/r/']

export function estCheminPublic(chemin: string): boolean {
  const sansRequete = chemin.split('?')[0] ?? chemin
  return sansRequete === '/' || PREFIXES_PUBLICS.some((p) => sansRequete === p || sansRequete.startsWith(p))
}
