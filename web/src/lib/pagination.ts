/** Forme `pagination` des listes paginées côté serveur (CONTRAT_API § 13). */
export interface InfosPagination {
  page: number
  par_page: number
  total: number
  pages: number
}

/** Élément de la rangée de numéros : un numéro de page ou une ellipse (« … »). */
export type ElementPage = number | 'ellipse-debut' | 'ellipse-fin'

/** Nombre de pages (au moins 1, même pour une liste vide). */
export function nombrePages(total: number, parPage: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, parPage)))
}

/** Ramène un numéro de page dans [1, pages] (valeur non entière ou absurde → 1). */
export function bornerPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, pages))
}

/**
 * Numéros compacts : toujours la première et la dernière page, la page courante et ses voisines,
 * des ellipses pour les trous. Longueur constante (7 au plus) pour que la rangée ne « saute » pas.
 * Ex. page 5 / 12 → 1 … 4 5 6 … 12 ; page 2 / 12 → 1 2 3 4 5 … 12.
 */
export function pagesCompactes(page: number, pages: number, voisins = 1): ElementPage[] {
  const total = Math.max(1, pages)
  const courante = bornerPage(page, total)
  const largeur = voisins * 2 + 5 // première, dernière, courante, voisins, deux ellipses
  if (total <= largeur) return Array.from({ length: total }, (_, i) => i + 1)

  // Une ellipse ne cache jamais une seule page : on affiche alors le numéro (2 ou avant-dernière).
  const debutBloc = Math.max(Math.min(courante - voisins, total - voisins * 2 - 2), 3)
  const finBloc = Math.min(Math.max(courante + voisins, voisins * 2 + 3), total - 2)
  const elements: ElementPage[] = [1, debutBloc > 3 ? 'ellipse-debut' : 2]
  for (let p = debutBloc; p <= finBloc; p++) elements.push(p)
  elements.push(finBloc < total - 2 ? 'ellipse-fin' : total - 1, total)
  return elements
}

/** Rang de la première et de la dernière ligne affichées (1-indexés) ; [0, 0] si la liste est vide. */
export function bornesLignes(page: number, parPage: number, total: number): [number, number] {
  if (total <= 0) return [0, 0]
  const debut = (page - 1) * parPage + 1
  if (debut > total) return [0, 0]
  return [debut, Math.min(total, page * parPage)]
}

/** Tranche d'une liste déjà chargée (pagination côté écran). */
export function tranche<T>(elements: readonly T[], page: number, parPage: number): T[] {
  return elements.slice((page - 1) * parPage, page * parPage)
}

/** Lit un numéro de page depuis l'adresse (`?page=3`) : entier ≥ 1, sinon 1. */
export function lirePage(valeur: string | null | undefined): number {
  if (!valeur || !/^\d{1,6}$/.test(valeur)) return 1
  return Math.max(1, Number(valeur))
}
