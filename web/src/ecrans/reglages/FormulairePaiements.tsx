import { useMutation } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { modifierBoutique } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import type { BoutiqueDetail } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Champ } from '@/composants/Champ'
import { Interrupteur } from '@/composants/Interrupteur'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { formaterFCFA } from '@/lib/format'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { invaliderBoutique } from './invalider'

const MESSAGE_MAX = 160

/** Carte « Moyens de paiement » : expiration, plafond, moyens actifs, lien Wave, message du reçu. */
export function FormulairePaiements({ boutique }: { boutique: BoutiqueDetail }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const idExpiration = useId()
  const idMessage = useId()
  const r = boutique.reglages

  const [expiration, setExpiration] = useState(r.expiration_facture_min)
  const [montantMax, setMontantMax] = useState(String(r.montant_max_xof))
  const [moyens, setMoyens] = useState(r.moyens)
  const [waveLien, setWaveLien] = useState(r.wave_lien ?? '')
  const [message, setMessage] = useState(r.message_recu ?? '')
  // Saisie en cours seulement si le formulaire a été modifié : un formulaire intact ne bloque pas le temps réel.
  useSaisieEnCours(
    expiration !== r.expiration_facture_min ||
      montantMax !== String(r.montant_max_xof) ||
      JSON.stringify(moyens) !== JSON.stringify(r.moyens) ||
      waveLien !== (r.wave_lien ?? '') ||
      message !== (r.message_recu ?? ''),
  )
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<Record<string, string | undefined>>({})

  const paytechConfigure = boutique.paytech.configure
  const max = Number(montantMax.replace(/\s/g, '')) || 0

  const mutation = useMutation({
    mutationFn: modifierBoutique,
    onSuccess: () => {
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invaliderBoutique()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) {
        const champs = {
          montant_max_xof: e.champ('reglages.montant_max_xof'),
          wave_lien: e.champ('reglages.wave_lien'),
          expiration: e.champ('reglages.expiration_facture_min'),
        }
        setErreursChamps(champs)
        if (e.champ('reglages.moyens')) setErreur(t('reglages.unMoyenRequis'))
        else setErreur(Object.values(champs).some(Boolean) ? null : messageErreur(e))
      } else setErreur(messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: Record<string, string | undefined> = {}
    if (!(max >= 100)) champs.montant_max_xof = t('caisse.minimum', { min: formaterFCFA(100) })
    if (moyens.wave_manuel && !waveLien.trim()) champs.wave_lien = t('auth.champRequis')
    setErreursChamps(champs)
    if (Object.values(champs).some(Boolean)) return
    // Au moins un moyen actif (le serveur refuse aussi) : message clair plutôt qu'un aller-retour.
    if (!moyens.lightning && !moyens.paytech && !moyens.wave_manuel) {
      setErreur(t('reglages.unMoyenRequis'))
      return
    }
    mutation.mutate({
      reglages: {
        expiration_facture_min: expiration,
        montant_max_xof: max,
        moyens,
        wave_lien: waveLien.trim() || null,
        message_recu: message.trim() || null,
      },
    })
  }

  return (
    <Carte rembourrage="sm">
      <CarteEnTete titre={t('reglages.paiements')} className="mb-2" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={idExpiration} className="flex items-baseline justify-between text-sm font-medium text-texte-2">
            <span>{t('reglages.expiration')}</span>
            <span className="text-base font-semibold text-texte tabulaire">{t('reglages.minutes', { count: expiration })}</span>
          </label>
          <input
            id={idExpiration}
            type="range"
            min={2}
            max={15}
            step={1}
            value={expiration}
            onChange={(e) => setExpiration(Number(e.target.value))}
            className="h-11 w-full accent-[var(--accent-trait)] md:h-8"
            aria-describedby={`${idExpiration}-aide`}
          />
          <p id={`${idExpiration}-aide`} className={cn('text-xs', erreursChamps.expiration ? 'text-danger-texte' : 'text-texte-3')}>
            {erreursChamps.expiration ?? t('reglages.expirationAide')}
          </p>
        </div>

        <Champ
          libelle={t('reglages.montantMax')} voix="reglages.montantMax"
          inputMode="numeric"
          pattern="[0-9]*"
          value={montantMax}
          onChange={(e) => setMontantMax(e.target.value.replace(/[^\d]/g, ''))}
          aide={max > 0 ? formaterFCFA(max) : undefined}
          erreur={erreursChamps.montant_max_xof}
        />

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('reglages.moyens')}</p>
          <Interrupteur coche={moyens.lightning} onChange={(v) => setMoyens((m) => ({ ...m, lightning: v }))} libelle={t('reglages.lightning')} voix="reglages.lightning" />
          <Interrupteur
            coche={moyens.paytech && paytechConfigure}
            onChange={(v) => setMoyens((m) => ({ ...m, paytech: v }))}
            libelle={t('reglages.paytech')}
            description={paytechConfigure ? undefined : t('reglages.nonConfigure')}
            desactive={!paytechConfigure}
            voix="reglages.paytech"
          />
          <Interrupteur coche={moyens.wave_manuel} onChange={(v) => setMoyens((m) => ({ ...m, wave_manuel: v }))} libelle={t('reglages.waveManuel')} description={t('reglages.waveManuelAide')} voix="reglages.waveManuel" />
        </div>

        <Champ
          libelle={t('reglages.waveLien')} voix="reglages.waveLien"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://pay.wave.com/m/…"
          value={waveLien}
          onChange={(e) => setWaveLien(e.target.value)}
          aide={t('reglages.waveLienAide')}
          erreur={erreursChamps.wave_lien}
          mentionOptionnel={moyens.wave_manuel ? undefined : t('commun.optionnel')}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor={idMessage} className="flex items-baseline justify-between text-sm font-medium text-texte-2">
            <span>{t('reglages.messageRecu')}</span>
            <span className="text-xs font-normal text-texte-3 tabulaire">
              {message.length}/{MESSAGE_MAX}
            </span>
          </label>
          <textarea
            id={idMessage}
            rows={2}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby={`${idMessage}-aide`}
            className="w-full resize-none rounded-md border border-bordure bg-surface px-3 py-2 text-base text-texte shadow-xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-bordure-forte focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <p id={`${idMessage}-aide`} className="text-xs text-texte-3">
            {t('reglages.messageRecuAide')}
          </p>
        </div>

        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" icone={<Save />} voix="commun.enregistrer" chargement={mutation.isPending} className="self-end">
          {t('commun.enregistrer')}
        </Bouton>
      </form>
    </Carte>
  )
}
