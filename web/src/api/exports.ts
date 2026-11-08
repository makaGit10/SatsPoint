import { telecharger } from './telechargement'

export type FormatExport = 'csv' | 'xlsx' | 'pdf'

const jour = () => new Date().toISOString().slice(0, 10)

/** Export des articles (CSV, Excel) — propriétaire / gérant. */
export function exporterArticles(format: Exclude<FormatExport, 'pdf'>) {
  return telecharger(`/exports/articles?format=${format}`, `articles-${jour()}.${format}`)
}
