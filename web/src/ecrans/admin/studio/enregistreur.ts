/**
 * Machine d'état de l'enregistrement au micro (studio audio, cahier § 6.13) :
 * repos → demande (autorisation du micro) → décompte 3-2-1 → enregistrement (vumètre, arrêt auto à 15 s) → prêt
 * (réécouter / refaire / valider). Refus du micro → `refuse` (le dépôt de fichier reste possible).
 * Pure : les effets (MediaRecorder, AnalyserNode, minuteries) sont dans `useEnregistreur`.
 */
export const DUREE_MAX_MS = 15_000
export const DUREE_MIN_MS = 300
export const DECOMPTE = 3

export type PhaseEnregistreur = 'repos' | 'demande' | 'decompte' | 'enregistrement' | 'pret' | 'refuse' | 'indisponible' | 'erreur'
export type ErreurEnregistreur = 'tropCourt' | 'enregistrement'

export interface EtatEnregistreur {
  phase: PhaseEnregistreur
  decompte: number
  dureeMs: number
  /** Niveau sonore 0–1 (vumètre). */
  niveau: number
  /** Derniers niveaux (barres du vumètre). */
  historique: number[]
  blob: Blob | null
  url: string | null
  erreur: ErreurEnregistreur | null
}

export type ActionEnregistreur =
  | { type: 'demander' }
  | { type: 'microPret' }
  | { type: 'microRefuse' }
  | { type: 'microIndisponible' }
  | { type: 'ticDecompte' }
  | { type: 'ticEnregistrement'; dureeMs: number; niveau: number }
  | { type: 'termine'; blob: Blob; url: string; dureeMs: number }
  | { type: 'echec'; erreur: ErreurEnregistreur }
  | { type: 'annuler' }

export const NOMBRE_BARRES = 24

export const ETAT_INITIAL: EtatEnregistreur = {
  phase: 'repos',
  decompte: DECOMPTE,
  dureeMs: 0,
  niveau: 0,
  historique: [],
  blob: null,
  url: null,
  erreur: null,
}

export function reduireEnregistreur(etat: EtatEnregistreur, action: ActionEnregistreur): EtatEnregistreur {
  switch (action.type) {
    case 'demander':
      if (etat.phase === 'demande' || etat.phase === 'decompte' || etat.phase === 'enregistrement') return etat
      return { ...ETAT_INITIAL, phase: 'demande' }
    case 'microPret':
      if (etat.phase !== 'demande') return etat
      return { ...etat, phase: 'decompte', decompte: DECOMPTE }
    case 'microRefuse':
      return { ...ETAT_INITIAL, phase: 'refuse' }
    case 'microIndisponible':
      return { ...ETAT_INITIAL, phase: 'indisponible' }
    case 'ticDecompte':
      if (etat.phase !== 'decompte') return etat
      return etat.decompte > 1 ? { ...etat, decompte: etat.decompte - 1 } : { ...etat, phase: 'enregistrement', decompte: 0, dureeMs: 0 }
    case 'ticEnregistrement':
      if (etat.phase !== 'enregistrement') return etat
      return {
        ...etat,
        dureeMs: Math.min(DUREE_MAX_MS, action.dureeMs),
        niveau: action.niveau,
        historique: [...etat.historique, action.niveau].slice(-NOMBRE_BARRES),
      }
    case 'termine':
      if (action.dureeMs < DUREE_MIN_MS) return { ...ETAT_INITIAL, phase: 'erreur', erreur: 'tropCourt' }
      return { ...etat, phase: 'pret', blob: action.blob, url: action.url, dureeMs: Math.min(DUREE_MAX_MS, action.dureeMs), niveau: 0 }
    case 'echec':
      return { ...ETAT_INITIAL, phase: 'erreur', erreur: action.erreur }
    case 'annuler':
      return { ...ETAT_INITIAL }
  }
}

/** « 0:04 » */
export function formaterDuree(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
