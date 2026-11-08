export const LONGUEUR_MIN_MOT_DE_PASSE = 12

/** 0 = vide, 1 = trop court, 2 = correct, 3 = solide (longueur d'abord ; la variété aide un peu). */
export function forceMotDePasse(motDePasse: string): 0 | 1 | 2 | 3 {
  if (!motDePasse) return 0
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) return 1
  const familles = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(motDePasse)).length
  return motDePasse.length >= 16 || familles >= 3 ? 3 : 2
}
