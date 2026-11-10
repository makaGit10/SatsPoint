import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Wallet } from '@/api/types'
import { CLE_TRANSACTIONS, CLE_WALLET, TRANSACTIONS_PAR_PAGE, useTransactionsWallet, useWallet } from '@/api/wallet'
import { peut, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { Carte } from '@/composants/Carte'
import { EnTetePage } from '@/composants/EnTetePage'
import { Pastille } from '@/composants/Pastille'
import { Squelette } from '@/composants/Squelette'
import { formaterFCFA, formaterSats } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { usePageUrl } from '@/lib/usePagination'
import { tempsRelatif } from '@/lib/temps'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { ConnexionWallet } from './portefeuille/ConnexionWallet'
import { Envoyer } from './portefeuille/Envoyer'
import { Historique } from './portefeuille/Historique'
import { Recevoir } from './portefeuille/Recevoir'

/** Portefeuille Lightning du commerçant : solde, recevoir, envoyer (propriétaire), historique, connexion NWC. */
export default function Portefeuille() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const proprietaire = peut(utilisateur, ['proprietaire'])
  const nomBoutique = utilisateur?.boutique?.nom ?? t('app.nom')

  const { data: wallet, isPending } = useWallet()
  const connecte = Boolean(wallet?.connecte)
  const { page, allerA, reinitialiser } = usePageUrl()
  const transactions = useTransactionsWallet(connecte, page)
  // Sans total connu : une page vide au-delà de la première (historique raccourci, autre appareil) ramène au début.
  const pageVide = connecte && page > 1 && transactions.data?.transactions.length === 0
  useEffect(() => {
    if (pageVide) reinitialiser()
  }, [pageVide, reinitialiser])

  useDonneesEnDirect(['wallet', 'parametres'], () => {
    void queryClient.invalidateQueries({ queryKey: CLE_WALLET })
    // L'historique n'existe que si un portefeuille est connecté (sinon 409 WALLET_NON_CONNECTE).
    if (queryClient.getQueryData<Wallet>(CLE_WALLET)?.connecte) void queryClient.invalidateQueries({ queryKey: CLE_TRANSACTIONS })
  })

  const [recevoirOuvert, setRecevoirOuvert] = useState(false)
  const [envoyerOuvert, setEnvoyerOuvert] = useState(false)

  const verifie = wallet?.verifie_le ? tempsRelatif(wallet.verifie_le) : null

  return (
    <div className="anim-apparition flex flex-col gap-3" data-ecran="portefeuille">
      <EnTetePage titre={t('portefeuille.titre')} voix="portefeuille.titre" />

      <Carte className="flex flex-col gap-4" rembourrage="md">
        {isPending || !wallet ? (
          <div className="flex flex-col items-center gap-2 py-2" data-chargement="solde" aria-busy="true">
            <Squelette className="h-3 w-16" />
            <Squelette className="h-10 w-48" />
            <Squelette className="h-4 w-28" />
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium tracking-wide text-texte-3 uppercase">{t('portefeuille.solde')}</p>
              <Pastille ton={connecte ? 'succes' : 'neutre'} point>
                {t(connecte ? 'portefeuille.connecte' : 'portefeuille.nonConnecte')}
              </Pastille>
            </div>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-texte tabulaire md:text-5xl">{wallet.solde ? formaterSats(wallet.solde.sats) : '—'}</p>
            <p className="mt-1 text-base text-texte-2 tabulaire">{wallet.solde ? formaterFCFA(wallet.solde.xof) : t('portefeuille.vide.titre')}</p>
            {verifie && connecte && <p className="mt-0.5 text-xs text-texte-3">{t('portefeuille.verifieLe', { quand: t(verifie.cle, { count: verifie.count }) })}</p>}
          </div>
        )}
        <div className="flex gap-2">
          <Bouton taille="lg" icone={<ArrowDownLeft />} voix="portefeuille.recevoir" disabled={!connecte} onClick={() => setRecevoirOuvert(true)} className="flex-1">
            {t('portefeuille.recevoir')}
          </Bouton>
          {proprietaire && (
            <Bouton taille="lg" variante="secondaire" icone={<ArrowUpRight />} voix="portefeuille.envoyer" disabled={!connecte} onClick={() => setEnvoyerOuvert(true)} className="flex-1">
              {t('portefeuille.envoyer')}
            </Bouton>
          )}
        </div>
        {!proprietaire && <p className="-mt-2 text-center text-xs text-texte-3">{t('portefeuille.proprietaireSeulement')}</p>}
      </Carte>

      <div className="grid gap-3 md:grid-cols-2 md:items-start [&>*]:min-w-0">
        <Historique
          transactions={connecte ? transactions.data?.transactions : []}
          chargement={connecte && transactions.isPending}
          page={page}
          parPage={TRANSACTIONS_PAR_PAGE}
          suivante={transactions.data?.suivante ?? false}
          onPage={connecte ? allerA : undefined}
          rechargement={transactions.isPlaceholderData}
        />
        {wallet && <ConnexionWallet wallet={wallet} proprietaire={proprietaire} />}
      </div>

      <Recevoir ouvert={recevoirOuvert} onFermer={() => setRecevoirOuvert(false)} boutique={nomBoutique} />
      {proprietaire && <Envoyer ouvert={envoyerOuvert} onFermer={() => setEnvoyerOuvert(false)} />}
    </div>
  )
}
