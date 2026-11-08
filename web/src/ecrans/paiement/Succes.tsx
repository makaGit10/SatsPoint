import { Check, Copy, MessageCircle, MessageSquare, Plus, Send, Share2, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AlerteVente, MethodePaiement, Operateur } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Dialogue } from '@/composants/Dialogue'
import { libelleMethode } from '@/lib/methodes'
import { notifier } from '@/composants/toastStore'
import { cn } from '@/lib/cn'
import { formaterFCFA, formaterSats } from '@/lib/format'
import { copier, lienSms, lienWhatsApp, partager, peutPartager } from '@/lib/retours'
import { HautParleur } from '@/voix/HautParleur'

export interface PropsSucces {
  montant: number
  sats: number | null
  methode: MethodePaiement | null
  operateur: Operateur | null
  numero: string
  boutique: string
  /** Chemin relatif du reçu (`/r/{jeton}`), `null` tant qu'il n'est pas prêt. */
  recuUrl: string | null
  alerte: AlerteVente | null
  /** Paiement test du démarrage guidé : message « Votre caisse est prête ». */
  test?: boolean
  onNouvelleVente: () => void
}

function ChoixPartage({ icone, libelle, href, onClick, voix }: { icone: ReactNode; libelle: string; href?: string; onClick?: () => void; voix: string }) {
  const classes = 'flex h-12 w-full items-center gap-3 rounded-lg border border-bordure bg-surface px-3 text-left text-base font-medium text-texte transition-colors hover:bg-surface-2'
  const contenu = (
    <>
      <span className="inline-flex size-8 items-center justify-center rounded-md bg-succes-doux text-succes-texte [&>svg]:size-4" aria-hidden="true">
        {icone}
      </span>
      <span className="flex-1">{libelle}</span>
    </>
  )
  return (
    <li className="relative">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
          {contenu}
        </a>
      ) : (
        <button type="button" onClick={onClick} className={classes}>
          {contenu}
        </button>
      )}
      <span className="absolute top-1/2 right-2 -translate-y-1/2">
        <HautParleur cle={voix} />
      </span>
    </li>
  )
}

/** Écran de succès plein écran : vert, grande coche, montant, reçu à envoyer, nouvelle vente. */
export function Succes({ montant, sats, methode, operateur, numero, boutique, recuUrl, alerte, test, onNouvelleVente }: PropsSucces) {
  const { t } = useTranslation()
  const [partageOuvert, setPartageOuvert] = useState(false)
  const lien = recuUrl ? `${window.location.origin}${recuUrl}` : null
  const texte = lien ? t('succes.messageRecu', { boutique, montant: formaterFCFA(montant), lien }) : ''

  const copierLien = async () => {
    if (!lien) return
    const ok = await copier(lien)
    notifier({ type: ok ? 'succes' : 'erreur', titre: ok ? t('succes.lienCopie') : t('paiement.copieImpossible') })
    if (ok) setPartageOuvert(false)
  }

  return (
    <div className="anim-apparition fixed inset-0 z-40 flex flex-col bg-succes text-white" data-ecran="succes" role="status" aria-live="assertive">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-sure text-center">
        <span className="anim-coche inline-flex size-24 items-center justify-center rounded-full bg-white text-succes shadow-lg md:size-28" aria-hidden="true">
          <Check size={56} strokeWidth={3} />
        </span>
        <h1 className="mt-6 flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          {test ? t('succes.testTermine') : t('succes.titre')}
          <HautParleur cle="paiement.recu" taille={16} className="text-white hover:text-white" />
        </h1>
        {test && <p className="mt-1 text-base text-white/85">{t('succes.testTermineTexte')}</p>}
        <p className="mt-4 text-5xl font-semibold tracking-tight tabulaire md:text-6xl">{formaterFCFA(montant)}</p>
        <p className="mt-2 text-base text-white/85 tabulaire">
          {sats !== null && `${formaterSats(sats)} · `}
          {t('succes.par', { methode: libelleMethode(t, methode, operateur) })}
        </p>
        <p className="mt-1 text-sm text-white/70 tabulaire">{t('succes.vente', { numero })}</p>

        {alerte && (
          <div role="alert" className="mt-5 flex max-w-sm items-start gap-2 rounded-lg bg-white/15 px-3 py-2 text-left text-sm">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{alerte === 'trop_percu' ? t('succes.tropPercu', { montant: formaterFCFA(montant) }) : t('succes.payeeApresAnnulation')}</span>
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-2 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
        <Bouton
          taille="lg"
          pleineLargeur
          icone={<Send />}
          voix="succes.envoyerRecu"
          disabled={!lien}
          onClick={() => setPartageOuvert(true)}
          className={cn('border border-white/40 bg-white/15 text-white hover:bg-white/25', !lien && 'opacity-70')}
        >
          {lien ? t('succes.envoyerRecu') : t('succes.recuIndisponible')}
        </Bouton>
        <Bouton taille="lg" pleineLargeur icone={<Plus />} voix="succes.nouvelleVente" onClick={onNouvelleVente} className="bg-white text-succes-texte hover:bg-white/90">
          {test ? t('demarrage.allerCaisse') : t('succes.nouvelleVente')}
        </Bouton>
      </div>

      <Dialogue ouvert={partageOuvert} onOuvertChange={setPartageOuvert} titre={t('succes.envoyerRecu')} description={lien ?? undefined} taille="sm">
        <ul className="flex flex-col gap-1.5 pb-1">
          <ChoixPartage icone={<MessageCircle />} libelle={t('succes.whatsapp')} href={lienWhatsApp(texte)} voix="succes.whatsapp" />
          <ChoixPartage icone={<MessageSquare />} libelle={t('succes.sms')} href={lienSms(texte)} voix="succes.sms" />
          <ChoixPartage icone={<Copy />} libelle={t('succes.copierLien')} onClick={() => void copierLien()} voix="succes.copierLien" />
          {peutPartager() && (
            <ChoixPartage
              icone={<Share2 />}
              libelle={t('succes.partager')}
              voix="succes.partager"
              onClick={() => void partager({ title: t('recu.titre'), text: texte, url: lien ?? undefined }).then((ok) => ok && setPartageOuvert(false))}
            />
          )}
        </ul>
      </Dialogue>
    </div>
  )
}
