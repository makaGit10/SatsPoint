import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { Article } from './types'

export const CLE_ARTICLES = ['articles'] as const

export type CorpsArticle = Omit<Article, 'ulid' | 'position'>

export function useArticles(actif = true) {
  return useQuery({
    queryKey: CLE_ARTICLES,
    queryFn: () => http.get<{ articles: Article[] }>('/articles'),
    enabled: actif,
    select: (r) => [...r.articles].sort((a, b) => a.position - b.position),
  })
}

export function creerArticle(corps: CorpsArticle) {
  return http.post<{ article: Article }>('/articles', corps)
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
