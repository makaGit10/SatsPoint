import { http } from './client'
import type { ChampImport, Correspondance, ImportAnalyse, ImportEtat, ModeImport } from './types'

export const cleImport = (ulid: string) => ['imports', ulid] as const

export function analyserImport(fichier: File) {
  const corps = new FormData()
  corps.set('type', 'articles')
  corps.set('fichier', fichier, fichier.name)
  return http.post<{ import: ImportAnalyse; champs: ChampImport[] }>('/imports/analyser', corps)
}

export function executerImport(ulid: string, correspondance: Correspondance, mode: ModeImport) {
  return http.post<{ import: ImportEtat }>(`/imports/${ulid}/executer`, { correspondance, mode })
}

export function lireImport(ulid: string) {
  return http.get<{ import: ImportEtat }>(`/imports/${ulid}`)
}
