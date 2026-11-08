import type { CleAudio, LangueAudio, StatutAudio } from '@/api/types'
import { pertinence } from '@/lib/texte'

export interface FiltresStudio {
  /** Langue de travail (mode rafale, « manquants seulement », colonne mise en avant, vue mobile). */
  langue: LangueAudio
  ecran: string | null
  manquants: boolean
  q: string
}

export function statutDe(cle: CleAudio, langue: LangueAudio): StatutAudio {
  return cle.etats[langue]?.statut ?? 'manquant'
}

/** À enregistrer : rien, ou un fichier en erreur. */
export function aEnregistrer(statut: StatutAudio): boolean {
  return statut === 'manquant' || statut === 'erreur'
}

/** Filtres de la matrice ; l'ordre d'apparition dans l'application est conservé (essentielles d'abord). */
export function filtrerCles(cles: readonly CleAudio[], filtres: FiltresStudio): CleAudio[] {
  const q = filtres.q.trim()
  return [...cles]
    .sort((a, b) => a.ordre - b.ordre)
    .filter((c) => {
      if (filtres.ecran && c.ecran !== filtres.ecran) return false
      if (filtres.manquants && !aEnregistrer(statutDe(c, filtres.langue))) return false
      if (q && Math.max(pertinence(c.cle, q), pertinence(c.texte_fr, q), pertinence(c.texte_en, q)) === 0) return false
      return true
    })
}

/**
 * Prochaine case à enregistrer dans la langue de travail, après `depuis` (en boucle), `depuis` exclue.
 * `null` quand tout est fait.
 */
export function prochaineManquante(cles: readonly CleAudio[], langue: LangueAudio, depuis: string | null): string | null {
  if (cles.length === 0) return null
  const debut = depuis ? cles.findIndex((c) => c.cle === depuis) : -1
  for (let pas = 1; pas <= cles.length; pas++) {
    const c = cles[(debut + pas + cles.length) % cles.length]!
    if (c.cle !== depuis && aEnregistrer(statutDe(c, langue))) return c.cle
  }
  return null
}

/** Clé voisine (← / →), sans boucle. */
export function voisine(cles: readonly CleAudio[], depuis: string | null, sens: 1 | -1): string | null {
  const i = cles.findIndex((c) => c.cle === depuis)
  if (i < 0) return cles[0]?.cle ?? null
  return cles[i + sens]?.cle ?? null
}

/** Brouillons d'une langue (publication en lot). */
export function brouillons(cles: readonly CleAudio[], langue: LangueAudio): number[] {
  return cles.flatMap((c) => {
    const e = c.etats[langue]
    return e?.statut === 'brouillon' && typeof e.id === 'number' ? [e.id] : []
  })
}

/** Formats acceptés au dépôt (contrat § V3.3). */
export const EXTENSIONS_AUDIO = ['mp3', 'wav', 'm4a', 'ogg', 'webm'] as const
export const TAILLE_MAX_AUDIO = 2 * 1024 * 1024

export type RefusFichier = 'format' | 'taille' | 'duree'

export function verifierFichierAudio(fichier: { name: string; size: number; type: string }): RefusFichier | null {
  const extension = fichier.name.split('.').pop()?.toLowerCase() ?? ''
  const typeOk = (EXTENSIONS_AUDIO as readonly string[]).includes(extension) || /^audio\/(mpeg|mp3|wav|x-wav|wave|mp4|x-m4a|m4a|aac|ogg|webm)/.test(fichier.type)
  if (!typeOk) return 'format'
  if (fichier.size > TAILLE_MAX_AUDIO) return 'taille'
  return null
}
