import type { FiltresVentes, Periode } from '@/api/types'

export const PERIODES: Periode[] = ['aujourdhui', 'hier', '7j', '30j', 'perso']

/** Code de période → clé i18n (`7j` → `periodes.j7`). */
export const CLE_PERIODE: Record<Periode, string> = {
  aujourdhui: 'periodes.aujourdhui',
  hier: 'periodes.hier',
  '7j': 'periodes.j7',
  '30j': 'periodes.j30',
  perso: 'periodes.perso',
}

export const FILTRES_DEFAUT: FiltresVentes = { periode: 'aujourdhui' }

/** Des filtres sont-ils posés (période autre qu'aujourd'hui, statut, moyen, caissier ou recherche) ? */
export function filtresActifs(f: FiltresVentes): boolean {
  return (f.periode ?? 'aujourdhui') !== 'aujourdhui' || Boolean(f.statut || f.methode || f.caissier || f.q)
}
