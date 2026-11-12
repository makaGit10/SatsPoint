import { useMutation } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Copy, Link2, Unplug, Wallet as IconeWallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_BOUTIQUE } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import { CLE_MOI } from '@/api/moi'
import type { Wallet } from '@/api/types'
import { CLE_TRANSACTIONS, CLE_WALLET, connecterWallet, revoquerWallet } from '@/api/wallet'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EtatVide } from '@/composants/EtatVide'
import { Pastille } from '@/composants/Pastille'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { formaterSats } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { copier } from '@/lib/retours'
import { tempsRelatif } from '@/lib/temps'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { HautParleur } from '@/voix/HautParleur'

function invaliderTout() {
  void queryClient.invalidateQueries({ queryKey: CLE_WALLET })
  void queryClient.invalidateQueries({ queryKey: CLE_TRANSACTIONS })
  void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
  void queryClient.invalidateQueries({ queryKey: CLE_MOI })
}

/** Formulaire « coller le lien Nostr Wallet Connect » (propriétaire). L'URI n'est jamais réaffichée. */
export function FormulaireConnexionWallet({ onConnecte, className }: { onConnecte?: () => void; className?: string }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [uri, setUri] = useState('')
  useSaisieEnCours(uri !== '')
  const [aideOuverte, setAideOuverte] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const connexion = useMutation({
    mutationFn: (u: string) => connecterWallet(u),
    onSuccess: () => {
      setUri('')
      notifier({ type: 'succes', titre: t('portefeuille.connecteOk'), voix: 'portefeuille.connecteOk' })
      invaliderTout()
      onConnecte?.()
    },
    onError: (e) => setErreur(e instanceof ErreurApi && e.estValidation ? (e.champ('uri') ?? messageErreur(e)) : messageErreur(e)),
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const valeur = uri.trim()
    if (!valeur) {
      setErreur(t('auth.champRequis'))
      return
    }
    connexion.mutate(valeur)
  }

  return (
    <form onSubmit={soumettre} noValidate className={cn('flex flex-col gap-3', className)}>
      <Champ
        libelle={t('portefeuille.uri')} voix="portefeuille.uri"
        aide={t('portefeuille.uriAide')}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="nostr+walletconnect://…"
        value={uri}
        onChange={(e) => setUri(e.target.value)}
        erreur={erreur}
      />
      <span className="inline-flex items-center gap-0.5 self-start">
        <button type="button" onClick={() => setAideOuverte((v) => !v)} aria-expanded={aideOuverte} className="inline-flex items-center gap-1 text-sm font-medium text-accent-texte hover:underline">
          {t('portefeuille.quelsPortefeuilles')}
          {aideOuverte ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
        <HautParleur cle="portefeuille.quelsPortefeuilles" />
      </span>
      {aideOuverte && <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-texte-2">{t('portefeuille.aidePortefeuilles')}</p>}
      <Bouton type="submit" icone={<Link2 />} voix="portefeuille.connecter" chargement={connexion.isPending} pleineLargeur className="md:self-start md:w-auto">
        {t('portefeuille.connecter')}
      </Bouton>
    </form>
  )
}

export interface PropsConnexionWallet {
  wallet: Wallet
  proprietaire: boolean
  /** Variante réduite (démarrage guidé) : pas de carte ni de titre. */
  compact?: boolean
  onConnecte?: () => void
}

/** Carte « Connexion du portefeuille » : état, permissions, budget, révocation ; ou formulaire de connexion. */
export function ConnexionWallet({ wallet, proprietaire, compact, onConnecte }: PropsConnexionWallet) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [revocationOuverte, setRevocationOuverte] = useState(false)

  const revocation = useMutation({
    mutationFn: revoquerWallet,
    onSuccess: () => {
      setRevocationOuverte(false)
      notifier({ type: 'info', titre: t('portefeuille.revoque'), voix: 'portefeuille.revoque' })
      // Plus de portefeuille : l'historique n'a plus de sens et sa relecture renverrait 409 WALLET_NON_CONNECTE.
      queryClient.setQueryData<Wallet>(CLE_WALLET, (w) => (w ? { ...w, connecte: false, solde: null } : w))
      queryClient.removeQueries({ queryKey: CLE_TRANSACTIONS })
      void queryClient.invalidateQueries({ queryKey: CLE_WALLET })
      void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
      void queryClient.invalidateQueries({ queryKey: CLE_MOI })
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  const copierAdresse = async () => {
    if (!wallet.lud16) return
    const ok = await copier(wallet.lud16)
    notifier({ type: ok ? 'succes' : 'erreur', titre: ok ? t('commun.copie') : t('paiement.copieImpossible') })
  }

  const verifie = wallet.verifie_le ? tempsRelatif(wallet.verifie_le) : null

  const contenu = wallet.connecte ? (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-texte-3">{t('portefeuille.alias')}</dt>
        <dd className="truncate text-right font-medium text-texte">{wallet.alias ?? '—'}</dd>
        <dt className="text-texte-3">{t('portefeuille.adresse')}</dt>
        <dd className="flex items-center justify-end gap-1 text-texte">
          <span className="truncate">{wallet.lud16 ?? '—'}</span>
          {wallet.lud16 && <BoutonIcone taille="sm" libelle={t('commun.copier')} icone={<Copy />} voix="commun.copier" onClick={() => void copierAdresse()} />}
        </dd>
        <dt className="text-texte-3">{t('portefeuille.budget')}</dt>
        <dd className="text-right font-medium text-texte tabulaire">{wallet.budget_sats !== null ? formaterSats(wallet.budget_sats) : '—'}</dd>
        {verifie && (
          <>
            <dt className="text-texte-3">{t('portefeuille.connecte')}</dt>
            <dd className="text-right text-texte">{t('portefeuille.verifieLe', { quand: t(verifie.cle, { count: verifie.count }) })}</dd>
          </>
        )}
      </dl>
      {wallet.permissions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('portefeuille.permissions')}</p>
          <ul className="flex flex-wrap gap-1" aria-label={t('portefeuille.permissions')}>
            {wallet.permissions.map((p) => (
              <li key={p}>
                <Pastille ton="neutre" className="font-mono">
                  {p}
                </Pastille>
              </li>
            ))}
          </ul>
        </div>
      )}
      {proprietaire && (
        <div className="flex justify-end border-t border-bordure pt-2">
          <Bouton variante="fantome" taille="sm" icone={<Unplug />} voix="portefeuille.revoquer" className="text-danger-texte hover:bg-danger-doux" onClick={() => setRevocationOuverte(true)}>
            {t('portefeuille.revoquer')}
          </Bouton>
        </div>
      )}
    </div>
  ) : proprietaire ? (
    <div className="flex flex-col gap-3">
      {!compact && <p className="text-sm text-texte-2">{t('portefeuille.vide.texte')}</p>}
      <FormulaireConnexionWallet onConnecte={onConnecte} />
    </div>
  ) : (
    <EtatVide ton="neutre" icone={<IconeWallet />} titre={t('portefeuille.vide.titre')} texte={t('portefeuille.vide.texte')} className="py-6" />
  )

  return (
    <>
      {compact ? (
        contenu
      ) : (
        <Carte rembourrage="sm">
          <CarteEnTete
            titre={t('portefeuille.connexion')}
            className="mb-2"
            actions={<Pastille ton={wallet.connecte ? 'succes' : 'neutre'} point>{t(wallet.connecte ? 'portefeuille.connecte' : 'portefeuille.nonConnecte')}</Pastille>}
          />
          {contenu}
        </Carte>
      )}
      <Dialogue
        ouvert={revocationOuverte}
        onOuvertChange={setRevocationOuverte}
        titre={t('portefeuille.revoquerTitre')} voix="portefeuille.revoquerTitre"
        description={t('portefeuille.revoquerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setRevocationOuverte(false)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<Unplug />} voix="portefeuille.revoquer" chargement={revocation.isPending} onClick={() => revocation.mutate()}>
              {t('portefeuille.revoquer')}
            </Bouton>
          </>
        }
      />
    </>
  )
}
