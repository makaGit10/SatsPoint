import { useMutation } from '@tanstack/react-query'
import { Clock, Copy, QrCode as IconeQr, Share2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReponseRecevoir } from '@/api/types'
import { recevoir } from '@/api/wallet'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { QrCode } from '@/composants/QrCode'
import { Segment } from '@/composants/Segment'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { contenuQrLightning } from '@/lib/methodes'
import { cn } from '@/lib/cn'
import { formaterCompteARebours, formaterFCFA, formaterSats } from '@/lib/format'
import { copier, partager, peutPartager } from '@/lib/retours'
import { useCompteARebours } from '@/lib/useCompteARebours'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'

type Unite = 'xof' | 'sats'

function Demande({ demande, boutique }: { demande: ReponseRecevoir; boutique: string }) {
  const { t } = useTranslation()
  const secondes = useCompteARebours(demande.expire_le)
  const copierFacture = async () => {
    const ok = await copier(demande.bolt11)
    notifier({ type: ok ? 'succes' : 'erreur', titre: ok ? t('paiement.copie') : t('paiement.copieImpossible') })
  }
  return (
    <div className="flex flex-col items-center gap-3 pb-1">
      <QrCode valeur={contenuQrLightning(demande.bolt11)} libelle={t('portefeuille.demandeAria')} taille={232} />
      <div className="text-center">
        <p className="text-2xl font-semibold text-texte tabulaire">{formaterSats(demande.montant_sats)}</p>
        <p className="text-sm text-texte-2 tabulaire">{formaterFCFA(demande.montant_xof)}</p>
      </div>
      {secondes !== null && (
        <span className={cn('inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-sm font-semibold text-texte tabulaire', secondes <= 30 && 'bg-danger-doux text-danger-texte')}>
          <Clock size={13} aria-hidden="true" />
          <span className="sr-only">{t('paiement.expireDans')} </span>
          {formaterCompteARebours(secondes)}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <BoutonIcone libelle={t('paiement.copier')} icone={<Copy />} voix="paiement.copier" variante="secondaire" taille="lg" onClick={() => void copierFacture()} />
        {peutPartager() && (
          <BoutonIcone
            libelle={t('paiement.partager')}
            icone={<Share2 />}
            voix="paiement.partager"
            variante="secondaire"
            taille="lg"
            onClick={() => void partager({ title: t('portefeuille.recevoirTitre'), text: `${boutique} · ${formaterSats(demande.montant_sats)}\n${demande.bolt11}` })}
          />
        )}
      </div>
    </div>
  )
}

/** Recevoir : montant en FCFA ou en sats → demande Lightning (QR, copier, partager, compte à rebours). */
export function Recevoir({ ouvert, onFermer, boutique }: { ouvert: boolean; onFermer: () => void; boutique: string }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours(ouvert)
  const [unite, setUnite] = useState<Unite>('xof')
  const [montant, setMontant] = useState('')
  const [description, setDescription] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [demande, setDemande] = useState<ReponseRecevoir | null>(null)

  const creation = useMutation({
    mutationFn: recevoir,
    onSuccess: (d) => setDemande(d),
    onError: (e) => setErreur(messageErreur(e)),
  })

  const fermer = () => {
    setDemande(null)
    setMontant('')
    setDescription('')
    setErreur(null)
    onFermer()
  }

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const valeur = Number(montant.replace(/\s/g, ''))
    if (!Number.isInteger(valeur) || valeur <= 0) {
      setErreur(t('auth.champRequis'))
      return
    }
    creation.mutate({
      ...(unite === 'xof' ? { montant_xof: valeur } : { montant_sats: valeur }),
      ...(description.trim() ? { description: description.trim() } : {}),
    })
  }

  return (
    <Dialogue ouvert={ouvert} onOuvertChange={(o) => !o && fermer()} titre={t('portefeuille.recevoirTitre')} taille="sm">
      {demande ? (
        <Demande demande={demande} boutique={boutique} />
      ) : (
        <form onSubmit={soumettre} noValidate className="flex flex-col gap-3 pb-1">
          <Segment<Unite>
            libelle={t('portefeuille.montant')}
            valeur={unite}
            onChange={setUnite}
            options={[
              { valeur: 'xof', libelle: 'FCFA' },
              { valeur: 'sats', libelle: 'sats' },
            ]}
          />
          <Champ
            libelle={unite === 'xof' ? t('portefeuille.montantFcfa') : t('portefeuille.montantSats')}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
          />
          <Champ libelle={t('portefeuille.description')} mentionOptionnel={t('commun.optionnel')} maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
          <ErreurFormulaire message={erreur} />
          <Bouton type="submit" icone={<IconeQr />} voix="portefeuille.generer" chargement={creation.isPending} pleineLargeur>
            {t('portefeuille.generer')}
          </Bouton>
        </form>
      )}
    </Dialogue>
  )
}
