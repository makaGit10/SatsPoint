import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { http } from './client'
import type {
  AudioStudio,
  BoutiqueAdmin,
  CleAudio,
  CodePays,
  LangueAdmin,
  LangueAudio,
  MatriceAudio,
  MoyenCatalogue,
  PageBoutiquesAdmin,
  PageJournal,
  PaysAdmin,
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

/** Tailles de page de la console (mêmes défauts que le serveur, CONTRAT_API § 13). */
export const BOUTIQUES_PAR_PAGE = 20
export const JOURNAL_PAR_PAGE = 30

export function useBoutiquesAdmin(filtres: FiltresBoutiquesAdmin, page: number, actif: boolean) {
  return useQuery({
    queryKey: ['admin', 'boutiques', filtres, page],
    queryFn: () => {
      const p = new URLSearchParams()
      if (filtres.q) p.set('q', filtres.q)
      if (filtres.statut) p.set('statut', filtres.statut)
      p.set('page', String(page))
      p.set('par_page', String(BOUTIQUES_PAR_PAGE))
      return http.get<PageBoutiquesAdmin>(`/admin/boutiques?${p}`)
    },
    placeholderData: keepPreviousData,
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

export function useJournalAdmin(filtres: FiltresJournal, page: number, actif: boolean) {
  return useQuery({
    queryKey: ['admin', 'journal', filtres, page],
    queryFn: () => {
      const p = new URLSearchParams()
      for (const [cle, valeur] of Object.entries(filtres)) if (valeur) p.set(cle, valeur)
      p.set('page', String(page))
      p.set('par_page', String(JOURNAL_PAR_PAGE))
      return http.get<PageJournal>(`/admin/journal?${p}`)
    },
    placeholderData: keepPreviousData,
    enabled: actif,
  })
}

// ----- Catalogues : pays, langues, moyens de paiement par pays (CONTRAT_API § 14.2) -----

export function usePaysAdmin(actif = true) {
  return useQuery({ queryKey: ['admin', 'catalogue', 'pays'], queryFn: () => http.get<{ pays: PaysAdmin[] }>('/admin/pays'), select: (r) => r.pays, enabled: actif, staleTime: 30_000 })
}

export function modifierPays(code: CodePays, corps: Partial<Pick<PaysAdmin, 'nom_fr' | 'nom_en' | 'actif'>>) {
  return http.patch<{ pays: PaysAdmin }>(`/admin/pays/${code}`, corps)
}

export function useLanguesAdmin(actif = true) {
  return useQuery({ queryKey: ['admin', 'catalogue', 'langues'], queryFn: () => http.get<{ langues: LangueAdmin[] }>('/admin/langues'), select: (r) => r.langues, enabled: actif, staleTime: 30_000 })
}

export type CorpsLangue = Pick<LangueAdmin, 'nom_local' | 'nom_fr' | 'nom_en' | 'pays'> & { code?: string; actif?: boolean; ordre?: number }

export function creerLangue(corps: CorpsLangue & { code: string }) {
  return http.post<{ langue: LangueAdmin }>('/admin/langues', corps)
}

export function modifierLangue(code: string, corps: Partial<CorpsLangue>) {
  return http.patch<{ langue: LangueAdmin }>(`/admin/langues/${code}`, corps)
}

export function supprimerLangue(code: string) {
  return http.delete<null>(`/admin/langues/${code}`)
}

export function useMoyensAdmin(pays: CodePays | '', actif = true) {
  return useQuery({
    queryKey: ['admin', 'catalogue', 'moyens', pays],
    queryFn: () => http.get<{ moyens: MoyenCatalogue[] }>(`/admin/moyens-paiement${pays ? `?pays=${pays}` : ''}`),
    select: (r) => r.moyens,
    enabled: actif,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export type CorpsMoyen = Pick<MoyenCatalogue, 'nom' | 'couleur' | 'instructions_fr' | 'instructions_en'> & { actif?: boolean; ordre?: number }

export function creerMoyen(corps: CorpsMoyen & Pick<MoyenCatalogue, 'pays' | 'type'>) {
  return http.post<{ moyen: MoyenCatalogue }>('/admin/moyens-paiement', corps)
}

export function modifierMoyen(ulid: string, corps: Partial<CorpsMoyen>) {
  return http.patch<{ moyen: MoyenCatalogue }>(`/admin/moyens-paiement/${ulid}`, corps)
}

export function supprimerMoyen(ulid: string) {
  return http.delete<null>(`/admin/moyens-paiement/${ulid}`)
}
