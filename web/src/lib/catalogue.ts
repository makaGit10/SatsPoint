import type { CodePays, LanguePublique, PaysPublic } from '@/api/types'

/**
 * Catalogue pays / langues côté front (CONTRAT_API § 14.1). La source est `GET /config` ; ces valeurs de repli
 * (Sénégal + langues de départ) servent avant la réponse et hors ligne : le comportement pour le Sénégal reste identique.
 */
export const PAYS_DEFAUT: CodePays = 'SN'

/** Motif d'un code de langue (le serveur fait foi). */
export const MOTIF_CODE_LANGUE = /^[a-z]{2,8}(-[a-z]{2,3})?$/

export const PAYS_REPLI: PaysPublic[] = [{ code: 'SN', nom_fr: 'Sénégal', nom_en: 'Senegal', indicatif: '+221' }]

export const LANGUES_REPLI: LanguePublique[] = [
  { code: 'wo', nom_local: 'Wolof', nom_fr: 'Wolof', nom_en: 'Wolof', pays: ['SN'], ordre: 1 },
  { code: 'srr', nom_local: 'Seereer', nom_fr: 'Sérère', nom_en: 'Serer', pays: ['SN'], ordre: 2 },
  { code: 'ff', nom_local: 'Pulaar', nom_fr: 'Pulaar', nom_en: 'Pulaar', pays: ['SN'], ordre: 3 },
  { code: 'dyo', nom_local: 'Joola', nom_fr: 'Diola', nom_en: 'Jola', pays: ['SN'], ordre: 4 },
  { code: 'fr', nom_local: 'Français', nom_fr: 'Français', nom_en: 'French', pays: [], ordre: 100 },
]

export function estCodePays(valeur: unknown, pays: readonly PaysPublic[]): valeur is CodePays {
  return typeof valeur === 'string' && pays.some((p) => p.code === valeur)
}

/** Langues locales d'un pays (sans le français), dans l'ordre du catalogue. */
export function languesDuPays(langues: readonly LanguePublique[], pays: CodePays): LanguePublique[] {
  return langues.filter((l) => l.code !== 'fr' && l.pays.includes(pays)).sort((a, b) => a.ordre - b.ordre)
}

/** Langues proposées pour un pays : ses langues locales puis le français (et toute langue « tous pays »). */
export function languesProposees(langues: readonly LanguePublique[], pays: CodePays): LanguePublique[] {
  const locales = languesDuPays(langues, pays)
  const communes = langues.filter((l) => l.pays.length === 0).sort((a, b) => a.ordre - b.ordre)
  return [...locales, ...communes]
}

/**
 * Pays déduit de la langue du navigateur (`fr-CI` → Côte d'Ivoire) s'il est au catalogue, sinon le Sénégal.
 * Seule la région compte : la langue seule (`fr`) ne dit rien du pays.
 */
export function deduirePays(langueNavigateur: string | undefined | null, pays: readonly PaysPublic[]): CodePays {
  const region = (langueNavigateur ?? '').split(/[-_]/)[1]?.toUpperCase()
  return region && estCodePays(region, pays) ? region : PAYS_DEFAUT
}

export function nomPays(p: PaysPublic | undefined, locale: string): string {
  if (!p) return ''
  return locale.startsWith('en') ? p.nom_en : p.nom_fr
}

/** Nom d'une langue dans la langue de l'interface (le nom local est affiché à côté par les écrans). */
export function nomLangue(l: LanguePublique | undefined, locale: string): string {
  if (!l) return ''
  return locale.startsWith('en') ? l.nom_en : l.nom_fr
}
