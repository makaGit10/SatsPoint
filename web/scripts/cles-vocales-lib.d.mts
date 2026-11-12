export interface EntreeRegistre {
  cle: string
  ecran: string
  contexte: string
  texte_fr: string
  texte_en: string
  essentielle: boolean
}
export interface FichierSource {
  chemin: string
  contenu: string
}
export const ECRANS: Array<{ motif: string; ecran: string; libelle: string; essentielle: boolean }>
export const CODES_LANGUE: string[]
export const COMPOSANTS_ACTION: string[]
export function sansCommentaires(source: string): string
export function balisesJsx(code: string): Array<{ nom: string; debut: number; fin: number; attributs: string }>
export function occurrencesFichier(chemin: string, source: string): Array<{ cle: string; index: number; type: string; ligne: number }>
export function ecranPour(chemin: string): { motif: string; ecran: string; libelle: string; essentielle: boolean; rang: number }
export function aplatir(objet: unknown, prefixe?: string, resultat?: Map<string, string>): Map<string, string>
export function construireRegistre(
  fichiers: FichierSource[],
  fr: unknown,
  en: unknown,
): { registre: EntreeRegistre[]; manquantes: Array<{ cle: string; fichier: string; ligne: number; fr: boolean; en: boolean }> }
export function boutonsSansVoix(fichiers: FichierSource[]): Array<{ fichier: string; ligne: number; composant: string }>
export function serialiser(registre: EntreeRegistre[]): string
export const PREFIXE_GUIDE: string
export const FICHIERS_AUTRE_CHANTIER: string[]
export const ELEMENTS_BRUTS: string[]
export interface ExceptionElementBrut {
  fichier: string
  motif: RegExp
  raison: string
}
export const EXCEPTIONS_ELEMENTS_BRUTS: ExceptionElementBrut[]
export function elementsBrutsSansVoix(fichiers: FichierSource[], exceptions?: ExceptionElementBrut[]): Array<{ fichier: string; ligne: number; element: string }>
