import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TransactionWallet } from '@/api/types'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { EtatVide } from '@/composants/EtatVide'
import { SqueletteListe } from '@/composants/Squelette'
import { cn } from '@/lib/cn'
import { formaterSats } from '@/lib/format'
import { tempsRelatif } from '@/lib/temps'

/** Historique compact des mouvements du portefeuille (entrées / sorties). */
export function Historique({ transactions, chargement }: { transactions: TransactionWallet[] | undefined; chargement: boolean }) {
  const { t } = useTranslation()
  return (
    <Carte rembourrage="sm">
      <CarteEnTete titre={t('portefeuille.historique')} className="mb-2" />
      {chargement ? (
        <div data-chargement="historique" aria-busy="true">
          <SqueletteListe lignes={4} />
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <EtatVide ton="neutre" icone={<History />} titre={t('portefeuille.aucuneTransaction')} className="py-6" />
      ) : (
        <ul className="divide-y divide-bordure" aria-label={t('portefeuille.historique')}>
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
    </Carte>
  )
}
