import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TransactionWallet } from '@/api/types'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { EtatVide } from '@/composants/EtatVide'
import { Pagination } from '@/composants/Pagination'
import { SqueletteListe } from '@/composants/Squelette'
import { cn } from '@/lib/cn'
import { formaterSats } from '@/lib/format'
import { tempsRelatif } from '@/lib/temps'

export interface PropsHistorique {
  transactions: TransactionWallet[] | undefined
  chargement: boolean
  /** Pagination sans total (la passerelle ne le donne pas) : page courante et existence d'une suivante. */
  page?: number
  parPage?: number
  suivante?: boolean
  onPage?: (page: number) => void
  /** Page suivante en cours de chargement (la page affichée reste visible). */
  rechargement?: boolean
}

/** Historique compact des mouvements du portefeuille (entrées / sorties), paginé. */
export function Historique({ transactions, chargement, page = 1, parPage = 10, suivante = false, onPage, rechargement }: PropsHistorique) {
  const { t } = useTranslation()
  const haut = useRef<HTMLDivElement>(null)
  return (
    <Carte rembourrage="sm">
      <div ref={haut} aria-hidden="true" />
      <CarteEnTete titre={t('portefeuille.historique')} className="mb-2" />
      {chargement ? (
        <div data-chargement="historique" aria-busy="true">
          <SqueletteListe lignes={4} />
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <EtatVide ton="neutre" icone={<History />} titre={t('portefeuille.aucuneTransaction')} className="py-6" />
      ) : (
        <ul className={cn('divide-y divide-bordure transition-opacity duration-150', rechargement && 'opacity-70')} aria-label={t('portefeuille.historique')}>
          {transactions.map((tx, i) => {
            const entrante = tx.type === 'entrante'
            const quand = tempsRelatif(tx.regle_le ?? tx.cree_le)
            return (
              <li key={`${tx.cree_le}-${i}`} className="flex items-center gap-3 py-2">
                <span
                  className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full', entrante ? 'bg-succes-doux text-succes-texte' : 'bg-neutre-doux text-neutre-texte')}
                  aria-label={t(entrante ? 'portefeuille.entrante' : 'portefeuille.sortante')}
                  role="img"
                >
                  {entrante ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texte">{tx.description || t(entrante ? 'portefeuille.entrante' : 'portefeuille.sortante')}</p>
                  <p className="text-xs text-texte-3">{t(quand.cle, { count: quand.count })}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('text-sm font-semibold tabulaire', entrante ? 'text-succes-texte' : 'text-texte')}>
                    {entrante ? '+' : '−'}
                    {formaterSats(tx.montant_sats)}
                  </p>
                  {tx.frais_sats > 0 && <p className="text-xs text-texte-3 tabulaire">−{formaterSats(tx.frais_sats)}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {onPage && !chargement && (
        <Pagination page={page} parPage={parPage} suivante={suivante} onChange={onPage} ancre={haut} libelle={t('portefeuille.historique')} chargement={rechargement} className="mt-2" />
      )}
    </Carte>
  )
}
