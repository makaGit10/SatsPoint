import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { ApercuEnvoi, ReponseRecevoir, ResultatEnvoi, TransactionWallet, Wallet } from './types'

export const CLE_WALLET = ['wallet'] as const
export const CLE_TRANSACTIONS = ['wallet', 'transactions'] as const

export function useWallet(actif = true) {
  return useQuery({ queryKey: CLE_WALLET, queryFn: () => http.get<Wallet>('/wallet'), enabled: actif })
}

export const TRANSACTIONS_PAR_PAGE = 10

/**
 * Historique paginé. La passerelle (NWC) ne donne pas de total : on demande une ligne de plus
 * (`limite = par_page + 1`, `decalage`) pour savoir s'il existe une page suivante (CONTRAT_API § 13).
 */
export function useTransactionsWallet(actif: boolean, page: number, parPage = TRANSACTIONS_PAR_PAGE) {
  return useQuery({
    queryKey: [...CLE_TRANSACTIONS, page, parPage],
    queryFn: () => http.get<{ transactions: TransactionWallet[] }>(`/wallet/transactions?limite=${parPage + 1}&decalage=${(page - 1) * parPage}`),
    enabled: actif,
    placeholderData: keepPreviousData,
    select: (r) => ({ transactions: r.transactions.slice(0, parPage), suivante: r.transactions.length > parPage }),
  })
}

export function recevoir(corps: { montant_xof?: number; montant_sats?: number; description?: string }) {
  return http.post<ReponseRecevoir>('/wallet/recevoir', corps)
}

export function apercuEnvoi(destination: string, montant_sats?: number) {
  return http.post<ApercuEnvoi>('/wallet/envoyer/apercu', montant_sats ? { destination, montant_sats } : { destination })
}

export function envoyer(corps: { destination: string; montant_sats?: number; password: string }) {
  return http.post<ResultatEnvoi>('/wallet/envoyer', corps)
}

export function connecterWallet(uri: string) {
  return http.put<Pick<Wallet, 'connecte' | 'alias' | 'lud16' | 'permissions' | 'budget_sats'>>('/boutique/wallet', { uri })
}

export function revoquerWallet() {
  return http.delete<null>('/boutique/wallet')
}
