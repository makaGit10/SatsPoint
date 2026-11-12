import type { TFunction } from 'i18next'
import type { Article } from '@/api/types'

/**
 * Libellé lisible d'un article : son nom écrit, sinon le nom de son pictogramme (« Pain », « Thé, ataya »),
 * sinon « Article ». Sert aux lignes de vente et aux libellés accessibles des articles sans nom écrit.
 */
export function libelleArticle(article: Pick<Article, 'nom' | 'pictogramme'>, t: TFunction): string {
  const nom = article.nom?.trim()
  if (nom) return nom
  const defaut = t('caisse.article')
  return article.pictogramme ? t(`pictos.${article.pictogramme}`, { defaultValue: defaut }) : defaut
}
