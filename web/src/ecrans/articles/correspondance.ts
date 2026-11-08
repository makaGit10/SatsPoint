import type { ChampImport, Correspondance } from '@/api/types'
import { COULEURS_ARTICLES } from '@/lib/couleursArticles'
import { distance, normaliser } from '@/lib/texte'

/** Champs SatsPoint importables (CONTRAT_API § V3.7), dans l'ordre d'affichage. */
export const CHAMPS_IMPORT: readonly ChampImport[] = ['nom', 'prix_xof', 'categorie', 'sku', 'couleur', 'actif']
/** Sans ces champs, l'import est impossible. */
export const CHAMPS_OBLIGATOIRES: readonly ChampImport[] = ['nom', 'prix_xof']

/** Dictionnaire de synonymes FR / EN (comparés sans accents ni casse). */
export const SYNONYMES: Record<ChampImport, readonly string[]> = {
  nom: ['nom', 'designation', 'libelle', 'article', 'produit', 'intitule', 'name', 'item', 'product', 'title', 'description'],
  prix_xof: ['prix', 'tarif', 'pu', 'prix unitaire', 'prix de vente', 'montant', 'cout', 'fcfa', 'xof', 'price', 'unit price', 'amount', 'cost'],
  categorie: ['categorie', 'famille', 'rayon', 'type', 'groupe', 'category', 'family', 'group', 'department'],
  sku: ['sku', 'reference', 'ref', 'code', 'code article', 'code barre', 'ean', 'barcode', 'id'],
  couleur: ['couleur', 'teinte', 'color', 'colour'],
  actif: ['actif', 'active', 'disponible', 'en vente', 'visible', 'statut', 'etat', 'enabled', 'available', 'status'],
}

/** Similarité 0–1 entre une colonne et un synonyme. */
function similarite(colonne: string, synonyme: string): number {
  if (colonne === synonyme) return 1
  const mots = colonne.split(/[\s_\-./()]+/).filter(Boolean)
  if (mots.includes(synonyme)) return 0.9
  if (synonyme.length >= 4 && colonne.includes(synonyme)) return 0.85
  const d = distance(colonne, synonyme, 3)
  const longueur = Math.max(colonne.length, synonyme.length)
  return d > 3 ? 0 : 1 - d / longueur
}

/** Meilleur champ pour une colonne, avec sa note (0 si rien de convaincant). */
export function suggererChamp(colonne: string): { champ: ChampImport | null; note: number } {
  const c = normaliser(colonne).replace(/[_]+/g, ' ')
  let meilleur: { champ: ChampImport | null; note: number } = { champ: null, note: 0 }
  for (const champ of CHAMPS_IMPORT) {
    for (const [rang, synonyme] of SYNONYMES[champ].entries()) {
      // À égalité, le synonyme le plus courant (en tête de liste) l'emporte : « Nom » avant « Libellé ».
      const note = similarite(c, synonyme) - rang * 0.001
      if (note > meilleur.note) meilleur = { champ, note }
    }
  }
  return meilleur.note >= 0.74 ? meilleur : { champ: null, note: 0 }
}

/** Suggestions pour toutes les colonnes : chaque champ n'est attribué qu'une fois (la colonne la plus proche gagne). */
export function suggererCorrespondance(colonnes: readonly string[]): Correspondance {
  const notes = colonnes.map((colonne) => ({ colonne, ...suggererChamp(colonne) }))
  const resultat: Correspondance = Object.fromEntries(colonnes.map((c) => [c, null]))
  const pris = new Set<ChampImport>()
  for (const n of [...notes].sort((a, b) => b.note - a.note)) {
    if (n.champ && !pris.has(n.champ)) {
      resultat[n.colonne] = n.champ
      pris.add(n.champ)
    }
  }
  return resultat
}

/** Correspondance de départ : suggestions du serveur (doublons écartés), complétées localement si le serveur n'a rien proposé. */
export function correspondanceInitiale(colonnes: readonly string[], suggestions: Correspondance | null | undefined): Correspondance {
  const locale = suggererCorrespondance(colonnes)
  const resultat: Correspondance = {}
  const pris = new Set<ChampImport>()
  for (const colonne of colonnes) {
    const proposee = suggestions?.[colonne]
    const champ = proposee !== undefined ? proposee : locale[colonne] ?? null
    if (champ && CHAMPS_IMPORT.includes(champ) && !pris.has(champ)) {
      resultat[colonne] = champ
      pris.add(champ)
    } else resultat[colonne] = null
  }
  return resultat
}

/** Attribue un champ à une colonne ; si le champ était déjà pris ailleurs, l'autre colonne devient « ignorée ». */
export function attribuer(correspondance: Correspondance, colonne: string, champ: ChampImport | null): Correspondance {
  const resultat: Correspondance = {}
  for (const [c, f] of Object.entries(correspondance)) resultat[c] = champ && f === champ && c !== colonne ? null : f
  resultat[colonne] = champ
  return resultat
}

export interface Validation {
  manquants: ChampImport[]
  valide: boolean
}

export function validerCorrespondance(correspondance: Correspondance): Validation {
  const utilises = new Set(Object.values(correspondance).filter(Boolean))
  const manquants = CHAMPS_OBLIGATOIRES.filter((c) => !utilises.has(c))
  return { manquants, valide: manquants.length === 0 }
}

/** Montant FCFA : « 1 500 », « 1.500 », « 1500 FCFA », « 1 500,00 » → 1500 ; sinon null. */
export function lirePrix(brut: string): number | null {
  let v = brut.replace(/\s| | /g, '').replace(/(fcfa|xof|cfa|f)$/i, '')
  if (!v) return null
  if (/^\d{1,3}([.,]\d{3})+$/.test(v)) v = v.replace(/[.,]/g, '')
  else v = v.replace(/[.,]0+$/, '')
  if (!/^\d+$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : null
}

const VRAI = ['1', 'oui', 'o', 'yes', 'y', 'true', 'vrai', 'x', 'actif', 'active', 'disponible', 'available']
const FAUX = ['0', 'non', 'n', 'no', 'false', 'faux', 'inactif', 'inactive', 'indisponible', 'unavailable']

export function lireBooleen(brut: string): boolean | null {
  const v = normaliser(brut)
  if (!v) return true
  if (VRAI.includes(v)) return true
  if (FAUX.includes(v)) return false
  return null
}

export type ErreurLigne = 'nomManquant' | 'nomTropLong' | 'prixInvalide' | 'skuInvalide' | 'couleurInconnue' | 'actifInvalide'

export interface LigneTransformee {
  valeurs: Partial<Record<ChampImport, string | number | boolean>>
  erreurs: ErreurLigne[]
}

/** Applique la correspondance à une ligne du fichier et la valide comme le serveur (bornes du contrat § 9). */
export function transformerLigne(ligne: readonly string[], colonnes: readonly string[], correspondance: Correspondance): LigneTransformee {
  const valeurs: LigneTransformee['valeurs'] = {}
  const erreurs: ErreurLigne[] = []
  colonnes.forEach((colonne, i) => {
    const champ = correspondance[colonne]
    if (!champ) return
    const brut = (ligne[i] ?? '').trim()
    switch (champ) {
      case 'nom':
        valeurs.nom = brut
        if (!brut) erreurs.push('nomManquant')
        else if (brut.length > 120) erreurs.push('nomTropLong')
        break
      case 'prix_xof': {
        const prix = lirePrix(brut)
        if (prix === null || prix > 50_000_000) erreurs.push('prixInvalide')
        else valeurs.prix_xof = prix
        break
      }
      case 'categorie':
        if (brut) valeurs.categorie = brut.slice(0, 60)
        break
      case 'sku':
        if (brut && !/^[A-Za-z0-9._-]{1,40}$/.test(brut)) erreurs.push('skuInvalide')
        else if (brut) valeurs.sku = brut
        break
      case 'couleur': {
        if (!brut) break
        const c = normaliser(brut)
        const connue = COULEURS_ARTICLES.find((x) => x === c)
        if (connue) valeurs.couleur = connue
        else erreurs.push('couleurInconnue')
        break
      }
      case 'actif': {
        const b = lireBooleen(brut)
        if (b === null) erreurs.push('actifInvalide')
        else valeurs.actif = b
        break
      }
    }
  })
  if (!('nom' in valeurs) && Object.values(correspondance).includes('nom') === false) erreurs.push('nomManquant')
  return { valeurs, erreurs }
}
