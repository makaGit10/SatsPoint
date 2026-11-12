import { http } from './client'
import type { Article } from './types'

/** Écritures sur les articles (écran Articles et formulaire) : hors du JavaScript de la caisse. */
export type CorpsArticle = Omit<Article, 'ulid' | 'position' | 'photo_url' | 'voix_url'>

/** Fichiers joints à la création (CONTRAT_API § 15) : photo réduite par le front, nom dit à voix haute. */
export interface MediasNouvelArticle {
  photo?: Blob | null
  voix?: Blob | null
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
}

function extension(blob: Blob, defaut: string): string {
  return EXTENSIONS[blob.type.split(';')[0] ?? ''] ?? defaut
}

/**
 * POST /articles : JSON, ou multipart si une photo ou un nom vocal accompagne la création (tout ou rien côté serveur).
 * Le serveur vérifie le type réel et ré-encode ; l'extension envoyée n'est qu'indicative.
 */
export function creerArticle(corps: CorpsArticle, medias: MediasNouvelArticle = {}) {
  if (!medias.photo && !medias.voix) return http.post<{ article: Article }>('/articles', corps)
  const formulaire = new FormData()
  for (const [cle, valeur] of Object.entries(corps)) {
    if (valeur === null || valeur === undefined) continue
    formulaire.append(cle, typeof valeur === 'boolean' ? (valeur ? '1' : '0') : String(valeur))
  }
  if (medias.photo) formulaire.append('photo', medias.photo, `photo.${extension(medias.photo, 'jpg')}`)
  if (medias.voix) formulaire.append('voix', medias.voix, `voix.${extension(medias.voix, 'wav')}`)
  return http.post<{ article: Article }>('/articles', formulaire)
}

export function modifierArticle(ulid: string, corps: Partial<CorpsArticle>) {
  return http.patch<{ article: Article }>(`/articles/${ulid}`, corps)
}

export function supprimerArticle(ulid: string) {
  return http.delete<null>(`/articles/${ulid}`)
}

export function ordonnerArticles(ulids: string[]) {
  return http.post<null>('/articles/ordre', { ulids })
}

function envoyerFichier(ulid: string, type: 'photo' | 'voix', fichier: Blob) {
  const formulaire = new FormData()
  formulaire.append('fichier', fichier, `${type}.${extension(fichier, type === 'photo' ? 'jpg' : 'wav')}`)
  return http.post<{ article: Article }>(`/articles/${ulid}/${type}`, formulaire)
}

/** POST /articles/{ulid}/photo → { article } (photo ré-encodée en WebP 512 px, métadonnées retirées). */
export const envoyerPhotoArticle = (ulid: string, photo: Blob) => envoyerFichier(ulid, 'photo', photo)
/** POST /articles/{ulid}/voix → { article } (nom dit à voix haute, ré-encodé en MP3). */
export const envoyerVoixArticle = (ulid: string, voix: Blob) => envoyerFichier(ulid, 'voix', voix)
export const supprimerPhotoArticle = (ulid: string) => http.delete<{ article: Article }>(`/articles/${ulid}/photo`)
export const supprimerVoixArticle = (ulid: string) => http.delete<{ article: Article }>(`/articles/${ulid}/voix`)
