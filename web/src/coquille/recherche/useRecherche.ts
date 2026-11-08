import { useEffect, useState } from 'react'
import { ErreurApi } from '@/api/client'
import { rechercher } from '@/api/recherche'
import type { GroupeRecherche } from '@/api/types'

export const DELAI_RECHERCHE = 150
export const LONGUEUR_MIN = 2

export interface EtatRecherche {
  /** Terme auquel correspondent `groupes`. */
  terme: string
  groupes: GroupeRecherche[]
  chargement: boolean
  /** Le serveur est injoignable : seules les pages locales sont proposées. */
  horsLigne: boolean
}

interface Reponse {
  terme: string
  groupes: GroupeRecherche[]
  horsLigne: boolean
}

const VIDE: GroupeRecherche[] = []

/** Recherche en direct : 150 ms après la dernière frappe, la requête précédente est annulée. */
export function useRecherche(terme: string, delai = DELAI_RECHERCHE): EtatRecherche {
  const [reponse, setReponse] = useState<Reponse | null>(null)
  const q = terme.trim()
  const actif = q.length >= LONGUEUR_MIN

  useEffect(() => {
    if (!actif) return
    const controleur = new AbortController()
    const minuterie = setTimeout(() => {
      rechercher(q, controleur.signal)
        .then((r) => setReponse({ terme: q, groupes: r.groupes ?? [], horsLigne: false }))
        .catch((e: unknown) => {
          if (controleur.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
          setReponse({ terme: q, groupes: [], horsLigne: e instanceof ErreurApi ? e.reseau || e.estServeur : true })
        })
    }, delai)
    return () => {
      clearTimeout(minuterie)
      controleur.abort()
    }
  }, [q, actif, delai])

  // Dérivé au rendu. Pendant la frappe, la réponse précédente reste affichée (pas de clignotement) jusqu'à la suivante.
  if (!actif) return { terme: q, groupes: VIDE, chargement: false, horsLigne: false }
  if (!reponse || reponse.terme !== q) return { terme: reponse?.terme ?? '', groupes: reponse?.groupes ?? VIDE, chargement: true, horsLigne: reponse?.horsLigne ?? false }
  return { terme: q, groupes: reponse.groupes, chargement: false, horsLigne: reponse.horsLigne }
}
