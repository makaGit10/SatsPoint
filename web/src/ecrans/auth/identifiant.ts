/**
 * Champ « Téléphone ou e-mail » : détection automatique du type, indicatif (Sénégal +221 par défaut),
 * formatage du numéro à la saisie (`77 123 45 67`) et valeur envoyée au serveur (E.164 ou e-mail).
 * Le serveur reste seul juge (normalisation et validation côté API) ; ceci n'est qu'une aide à la saisie.
 */

export interface Indicatif {
  /** Indicatif sans « + ». */
  code: string
  /** Code ISO du pays (nom affiché via Intl.DisplayNames, dans la langue de l'interface). */
  region: string
  /** Le « 0 » initial d'un numéro national ne fait pas partie du numéro international (France, Belgique, Maroc). */
  zeroInitial?: boolean
}

export const INDICATIF_PAR_DEFAUT = '221'

export const INDICATIFS: Indicatif[] = [
  { code: '221', region: 'SN' },
  { code: '225', region: 'CI' },
  { code: '223', region: 'ML' },
  { code: '224', region: 'GN' },
  { code: '226', region: 'BF' },
  { code: '220', region: 'GM' },
  { code: '222', region: 'MR' },
  { code: '227', region: 'NE' },
  { code: '228', region: 'TG' },
  { code: '229', region: 'BJ' },
  { code: '245', region: 'GW' },
  { code: '237', region: 'CM' },
  { code: '212', region: 'MA', zeroInitial: true },
  { code: '33', region: 'FR', zeroInitial: true },
  { code: '32', region: 'BE', zeroInitial: true },
  { code: '39', region: 'IT' },
  { code: '34', region: 'ES' },
  { code: '44', region: 'GB', zeroInitial: true },
  { code: '1', region: 'US' },
]

/** Les indicatifs sont sans préfixe commun (norme E.164) : le premier qui correspond est le bon. */
const PAR_LONGUEUR = [...INDICATIFS].sort((a, b) => b.code.length - a.code.length)

export type SaisieIdentifiant =
  | { mode: 'vide'; indicatif: string }
  | { mode: 'telephone'; indicatif: string; chiffres: string }
  | { mode: 'texte'; indicatif: string; texte: string }

export const SAISIE_VIDE: SaisieIdentifiant = { mode: 'vide', indicatif: INDICATIF_PAR_DEFAUT }

const MAX_CHIFFRES = 15

/** Interprète ce que la personne vient de taper (en gardant l'indicatif choisi). */
export function analyserSaisie(brut: string, indicatif: string): SaisieIdentifiant {
  if (!brut.trim()) return { mode: 'vide', indicatif }
  // Une lettre ou un « @ » : e-mail (ou texte libre), laissé tel quel.
  if (/[^\d\s+().-]/.test(brut)) return { mode: 'texte', indicatif, texte: brut }
  const compact = brut.replace(/[\s().-]/g, '')
  if (/^(\+|00)/.test(compact)) {
    const reste = compact.replace(/^(\+|00)/, '')
    if (!/^\d*$/.test(reste)) return { mode: 'texte', indicatif, texte: brut }
    const trouve = PAR_LONGUEUR.find((i) => reste.startsWith(i.code))
    if (trouve) return { mode: 'telephone', indicatif: trouve.code, chiffres: reste.slice(trouve.code.length).slice(0, MAX_CHIFFRES) }
    return { mode: 'texte', indicatif, texte: brut.trimStart() }
  }
  if (!/^\d+$/.test(compact)) return { mode: 'texte', indicatif, texte: brut }
  let chiffres = compact
  // « 221 77 123 45 67 » tapé sans « + » alors que +221 est déjà choisi.
  if (indicatif === '221' && /^221[37]\d{8}$/.test(chiffres)) chiffres = chiffres.slice(3)
  return { mode: 'telephone', indicatif, chiffres: chiffres.slice(0, MAX_CHIFFRES) }
}

/** `771234567` → `77 123 45 67` (Sénégal) ; ailleurs, groupes de deux chiffres. */
export function formaterChiffres(chiffres: string, indicatif: string): string {
  const groupes: string[] = []
  if (indicatif === '221') {
    const tailles = [2, 3, 2, 2]
    let i = 0
    for (const n of tailles) {
      if (i >= chiffres.length) break
      groupes.push(chiffres.slice(i, i + n))
      i += n
    }
    if (i < chiffres.length) groupes.push(chiffres.slice(i))
    return groupes.join(' ')
  }
  for (let i = 0; i < chiffres.length; i += 2) groupes.push(chiffres.slice(i, i + 2))
  return groupes.join(' ')
}

/** Texte affiché dans le champ. */
export function texteAffiche(saisie: SaisieIdentifiant): string {
  if (saisie.mode === 'vide') return ''
  if (saisie.mode === 'texte') return saisie.texte
  return formaterChiffres(saisie.chiffres, saisie.indicatif)
}

/** Valeur envoyée à l'API : `+221771234567` ou l'e-mail tel quel (sans espaces autour). */
export function valeurIdentifiant(saisie: SaisieIdentifiant): string {
  if (saisie.mode === 'vide') return ''
  if (saisie.mode === 'texte') return saisie.texte.trim()
  const pays = INDICATIFS.find((i) => i.code === saisie.indicatif)
  const chiffres = pays?.zeroInitial ? saisie.chiffres.replace(/^0/, '') : saisie.chiffres
  return `+${saisie.indicatif}${chiffres}`
}

export type ErreurIdentifiant = 'vide' | 'telephoneSenegal' | 'telephoneInvalide' | 'emailInvalide' | 'invalide'

/** Contrôle de forme (aide immédiate) ; le serveur valide de toute façon. */
export function verifierIdentifiant(saisie: SaisieIdentifiant): ErreurIdentifiant | null {
  if (saisie.mode === 'vide') return 'vide'
  if (saisie.mode === 'telephone') {
    if (saisie.indicatif === '221') return /^[37]\d{8}$/.test(saisie.chiffres) ? null : 'telephoneSenegal'
    return saisie.chiffres.length >= 6 && saisie.chiffres.length <= 14 ? null : 'telephoneInvalide'
  }
  const texte = saisie.texte.trim()
  if (texte.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texte) ? null : 'emailInvalide'
  if (/^\+\d{8,15}$/.test(texte.replace(/[\s().-]/g, ''))) return null
  return 'invalide'
}

/** Position du curseur après reformatage : juste après le même nombre de chiffres qu'avant. */
export function positionApresChiffres(texte: string, nombreChiffres: number): number {
  if (nombreChiffres <= 0) return 0
  let vus = 0
  for (let i = 0; i < texte.length; i++) {
    if (/\d/.test(texte[i]!)) vus += 1
    if (vus === nombreChiffres) return i + 1
  }
  return texte.length
}
