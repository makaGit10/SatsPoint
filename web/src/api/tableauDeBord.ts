import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { Periode, TableauDeBord } from './types'

export const CLE_TABLEAU = ['tableau-de-bord'] as const
export type PeriodeTableau = Exclude<Periode, 'perso'>
export const PERIODES_TABLEAU: PeriodeTableau[] = ['aujourdhui', 'hier', '7j', '30j']

export function chargerTableauDeBord(periode: PeriodeTableau) {
  return http.get<TableauDeBord>(`/tableau-de-bord?periode=${periode}`)
}

export function useTableauDeBord(periode: PeriodeTableau) {
  return useQuery({
    queryKey: [...CLE_TABLEAU, periode],
    queryFn: () => chargerTableauDeBord(periode),
    placeholderData: (precedent) => precedent,
  })
}
