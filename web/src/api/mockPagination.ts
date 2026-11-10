/**
 * Pagination du mode démo, identique au serveur (CONTRAT_API § 13) :
 * 1 ≤ page ≤ 10 000, 10 ≤ par_page ≤ 100 (sinon 422), page au-delà de la dernière → liste vide, pagination exacte.
 */
export interface LecturePagination {
  page: number
  parPage: number
}

function invalide(errors: Record<string, string[]>): Response {
  return new Response(JSON.stringify({ message: 'Les données envoyées sont invalides.', errors }), { status: 422, headers: { 'Content-Type': 'application/json' } })
}

export function lirePagination(params: URLSearchParams, parPageDefaut: number): LecturePagination | { erreur: Response } {
  const entier = (nom: string, defaut: number) => {
    const v = params.get(nom)
    return v === null ? defaut : /^\d+$/.test(v) ? Number(v) : Number.NaN
  }
  const page = entier('page', 1)
  const parPage = entier('par_page', parPageDefaut)
  const errors: Record<string, string[]> = {}
  if (!(page >= 1 && page <= 10_000)) errors.page = ['La page doit être un entier entre 1 et 10 000.']
  if (!(parPage >= 10 && parPage <= 100)) errors.par_page = ['Le nombre par page doit être un entier entre 10 et 100.']
  return Object.keys(errors).length ? { erreur: invalide(errors) } : { page, parPage }
}

export function paginer<T>(liste: readonly T[], { page, parPage }: LecturePagination) {
  return {
    elements: liste.slice((page - 1) * parPage, page * parPage),
    pagination: { page, par_page: parPage, total: liste.length, pages: Math.max(1, Math.ceil(liste.length / parPage)) },
  }
}
