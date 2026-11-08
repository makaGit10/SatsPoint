import { useQuery } from '@tanstack/react-query'
import { http } from './client'
import type { ApercuEnvoi, ReponseRecevoir, ResultatEnvoi, TransactionWallet, Wallet } from './types'

export const CLE_WALLET = ['wallet'] as const
export const CLE_TRANSACTIONS = ['wallet', 'transactions'] as const

export function useWallet(actif = true) {
  return useQuery({ queryKey: CLE_WALLET, queryFn: () => http.get<Wallet>('/wallet'), enabled: actif })
}

export function useTransactionsWallet(actif = true, limite = 30) {
  return useQuery({
    queryKey: [...CLE_TRANSACTIONS, limite],
    queryFn: () => http.get<{ transactions: TransactionWallet[] }>(`/wallet/transactions?limite=${limite}`),
    enabled: actif,
    select: (r) => r.transactions,
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
