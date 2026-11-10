import type { CouleurMoyen } from '@/api/types'

/** Liste fermée des couleurs d'accent d'un moyen de paiement (CONTRAT_API § 14.2), dans l'ordre du sélecteur. */
export const COULEURS_MOYEN: readonly CouleurMoyen[] = ['ciel', 'bleu', 'orange', 'jaune', 'vert', 'rouge', 'violet', 'gris']

/**
 * Classes par couleur (chaînes complètes : Tailwind ne voit que le texte littéral).
 * `pastille` = point plein ; `doux` = fond léger + texte lisible (AA) en clair et en sombre.
 */
export const CLASSES_COULEUR: Record<CouleurMoyen, { pastille: string; doux: string }> = {
  ciel: { pastille: 'bg-sky-500', doux: 'bg-sky-500/12 text-sky-800 dark:text-sky-300' },
  bleu: { pastille: 'bg-blue-600', doux: 'bg-blue-600/12 text-blue-800 dark:text-blue-300' },
  orange: { pastille: 'bg-orange-500', doux: 'bg-orange-500/14 text-orange-800 dark:text-orange-300' },
  jaune: { pastille: 'bg-yellow-400', doux: 'bg-yellow-400/20 text-yellow-900 dark:text-yellow-200' },
  vert: { pastille: 'bg-emerald-600', doux: 'bg-emerald-600/12 text-emerald-800 dark:text-emerald-300' },
  rouge: { pastille: 'bg-red-600', doux: 'bg-red-600/12 text-red-800 dark:text-red-300' },
  violet: { pastille: 'bg-violet-600', doux: 'bg-violet-600/12 text-violet-800 dark:text-violet-300' },
  gris: { pastille: 'bg-zinc-500', doux: 'bg-zinc-500/14 text-zinc-800 dark:text-zinc-300' },
}

export function classesCouleur(couleur: string | null | undefined) {
  return CLASSES_COULEUR[(couleur ?? 'gris') as CouleurMoyen] ?? CLASSES_COULEUR.gris
}

/** Instructions du moyen dans la langue de l'interface (repli sur l'autre langue). */
export function instructionsMoyen(m: { instructions_fr: string | null; instructions_en: string | null }, locale: string): string | null {
  return (locale.startsWith('en') ? (m.instructions_en ?? m.instructions_fr) : (m.instructions_fr ?? m.instructions_en)) || null
}

/** Numéro marchand lisible : « +2250708091011 » → « +225 07 08 09 10 11 » (indicatif UEMOA à 3 chiffres, puis par deux). */
export function formaterNumeroMarchand(valeur: string): string {
  const brut = valeur.replace(/[\s.-]/g, '')
  const m = /^\+(\d{3})(\d{4,12})$/.exec(brut)
  if (!m) return brut
  return `+${m[1]} ${m[2]!.replace(/(\d{2})(?=\d)/g, '$1 ')}`
}
