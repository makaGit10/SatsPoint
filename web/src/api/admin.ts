import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { http } from './client'
import type {
  AudioStudio,
  BoutiqueAdmin,
  CleAudio,
  LangueAudio,
  MatriceAudio,
  PageBoutiquesAdmin,
  PageJournal,
  SanteAdmin,
  StatistiquesAdmin,
} from './types'

// ----- Studio audio (CONTRAT_API § V3.3) -----

export const CLE_MATRICE = ['admin', 'audio', 'matrice'] as const

/**
 * Case affichée = la version en préparation si elle existe (`nouvelle_version`), sinon la version courante ;
 * l'URL publiée reste disponible dans `url_publiee`.
 */
export function normaliserMatrice(matrice: MatriceAudio): MatriceAudio {
  return {
    ...matrice,
    cles: matrice.cles.map((c) => ({
      ...c,
      etats: Object.fromEntries(
        Object.entries(c.etats).map(([langue, e]) => {
          const nv = e?.nouvelle_version
          if (!e || !nv) return [langue, e]
          return [langue, { ...e, statut: nv.statut, id: nv.id, url: nv.url ?? null, duree_ms: nv.duree_ms ?? null, mis_a_jour_le: nv.mis_a_jour_le ?? e.mis_a_jour_le, url_publiee: e.url ?? null }]
        }),
      ) as CleAudio['etats'],
    })),
  }
}

/** Matrice complète (les filtres sont appliqués à l'écran : bascule instantanée, une seule requête). */
export function useMatriceAudio() {
  return useQuery({
    queryKey: CLE_MATRICE,
    queryFn: () => http.get<MatriceAudio>('/admin/audio/matrice'),
    select: normaliserMatrice,
    staleTime: 30_000,
  })
}

export function deposerAudio(cle: string, langue: LangueAudio, fichier: Blob, nom = 'enregistrement.webm') {
  const corps = new FormData()
  corps.set('cle', cle)
  corps.set('langue', langue)
  corps.set('fichier', fichier, nom)
  return http.post<{ audio: AudioStudio }>('/admin/audio', corps)
}

export function publierAudios(corps: { ids: number[] } | { cle: string; langue: LangueAudio }) {
  return http.post<{ publies: number }>('/admin/audio/publier', corps)
}

export function supprimerAudio(id: number) {
  return http.delete<null>(`/admin/audio/${id}`)
}

// ----- Console plateforme (CONTRAT_API § V3.5) -----

export const CLE_ADMIN = ['admin'] as const

export function useStatistiquesAdmin() {
  return useQuery({ queryKey: ['admin', 'statistiques'], queryFn: () => http.get<StatistiquesAdmin>('/admin/statistiques'), staleTime: 60_000 })
}

export function useSanteAdmin(actif: boolean) {
  return useQuery({
    queryKey: ['admin', 'sante'],
    queryFn: () => http.get<SanteAdmin>('/admin/sante'),
    enabled: actif,
    refetchInterval: actif ? 30_000 : false,
  })
}

export interface FiltresBoutiquesAdmin {
  q?: string
  statut?: BoutiqueAdmin['statut']
}

export function useBoutiquesAdmin(filtres: FiltresBoutiquesAdmin, actif: boolean) {
  return useInfiniteQuery({
    queryKey: ['admin', 'boutiques', filtres],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams()
      if (filtres.q) p.set('q', filtres.q)
      if (filtres.statut) p.set('statut', filtres.statut)
      if (pageParam) p.set('curseur', pageParam)
      return http.get<PageBoutiquesAdmin>(`/admin/boutiques?${p}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (derniere) => derniere.curseur_suivant,
    placeholderData: (precedent) => precedent,
    enabled: actif,
  })
}

export function changerStatutBoutique(ulid: string, statut: BoutiqueAdmin['statut']) {
  return http.patch<{ boutique: BoutiqueAdmin }>(`/admin/boutiques/${ulid}`, { statut })
}

export interface FiltresJournal {
  action?: string
  du?: string
  au?: string
}

export function useJournalAdmin(filtres: FiltresJournal, actif: boolean) {
  return useInfiniteQuery({
    queryKey: ['admin', 'journal', filtres],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams()
      for (const [cle, valeur] of Object.entries(filtres)) if (valeur) p.set(cle, valeur)
      if (pageParam) p.set('curseur', pageParam)
      return http.get<PageJournal>(`/admin/journal?${p}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (derniere) => derniere.curseur_suivant,
    placeholderData: (precedent) => precedent,
    enabled: actif,
  })
}
