import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { Article } from './types'

export const CLE_ARTICLES = ['articles'] as const

export function useArticles(actif = true) {
  return useQuery({
    queryKey: CLE_ARTICLES,
    queryFn: () => http.get<{ articles: Article[] }>('/articles'),
    enabled: actif,
    select: (r) => [...r.articles].sort((a, b) => a.position - b.position),
  })
}
