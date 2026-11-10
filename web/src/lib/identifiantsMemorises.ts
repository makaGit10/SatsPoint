import { lireStockage, ecrireStockage } from './stockage'

/**
 * « Se souvenir de moi » : les derniers identifiants de connexion (e-mail ou numéro au format +221…) utilisés
 * sur cet appareil, pour les proposer dès qu'on commence à écrire. JAMAIS de mot de passe ni de jeton :
 * seulement l'identifiant, et uniquement si la case est cochée (décocher l'oublie).
 */
const CLE = 'satspoint.identifiants'
const MAX = 3

export function identifiantsMemorises(): string[] {
  try {
    const brut = JSON.parse(lireStockage(CLE) ?? '[]') as unknown
    return Array.isArray(brut) ? brut.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 254).slice(0, MAX) : []
  } catch {
    return []
  }
}

function ecrire(liste: string[]) {
  ecrireStockage(CLE, liste.length ? JSON.stringify(liste.slice(0, MAX)) : null)
}

/** Mémorise en tête de liste (sans doublon, insensible à la casse). */
export function memoriserIdentifiant(valeur: string) {
  const v = valeur.trim()
  if (!v) return
  ecrire([v, ...identifiantsMemorises().filter((x) => x.toLowerCase() !== v.toLowerCase())])
}

export function oublierIdentifiant(valeur: string) {
  const v = valeur.trim().toLowerCase()
  ecrire(identifiantsMemorises().filter((x) => x.toLowerCase() !== v))
}

const chiffres = (s: string) => s.replace(/\D/g, '')

/**
 * Suggestions pour ce qui est en train d'être tapé : tout si le champ est vide ; sinon celles qui commencent
 * par la saisie (texte) ou dont le numéro national commence par les chiffres tapés (« 77 12 » → +22177123…).
 * La valeur déjà complète n'est pas reproposée.
 */
export function filtrerSuggestions(liste: string[], saisie: string, indicatif: string): string[] {
  const s = saisie.trim().toLowerCase()
  if (!s) return liste
  const tapes = chiffres(s)
  const estNumero = /^[\d\s+().-]+$/.test(s)
  return liste.filter((v) => {
    const l = v.toLowerCase()
    if (l === s) return false
    if (!estNumero) return l.startsWith(s)
    if (!v.startsWith('+') || !tapes) return false
    const complet = chiffres(v)
    const national = complet.startsWith(indicatif) ? complet.slice(indicatif.length) : complet
    return (national.startsWith(tapes) || complet.startsWith(tapes)) && national !== tapes && complet !== tapes
  })
}
