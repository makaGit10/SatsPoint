/** Saisie du pavé numérique (fonctions pures, testables). */

export const DELAI_APPUI_LONG = 500
/** 9 chiffres maximum (999 999 999 FCFA) : bien au-delà de tout plafond de boutique. */
export const LONGUEUR_MAX = 9
export const TOUCHES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'effacer'] as const
export type Touche = (typeof TOUCHES)[number]

/** Ajoute des chiffres à une saisie (pas de zéro en tête, longueur bornée). */
export function ajouterChiffres(valeur: string, chiffres: string): string {
  if (valeur === '' && /^0+$/.test(chiffres)) return ''
  return (valeur + chiffres).slice(0, LONGUEUR_MAX)
}
