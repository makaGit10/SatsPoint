import { useMutation } from '@tanstack/react-query'
import { Link2, Phone, Save } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { configurerMoyenPays, useMoyensPays } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import type { MoyenBoutique } from '@/api/types'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Champ } from '@/composants/Champ'
import { Interrupteur } from '@/composants/Interrupteur'
import { SqueletteTexte } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { classesCouleur, instructionsMoyen } from '@/lib/couleursMoyens'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { HautParleur } from '@/voix/HautParleur'
import { invaliderBoutique } from './invalider'

/**
 * Carte « Moyens de paiement du pays » (CONTRAT_API § 14.3) : chaque moyen du catalogue de son pays s'active avec
 * SON numéro ou SON lien marchand. Le client paie ; le propriétaire ou le gérant confirme la réception à la main.
 * Au Sénégal sans moyen supplémentaire au catalogue, la carte n'apparaît pas (PayTech et Wave direct suffisent).
 */
export function FormulaireMoyensPays() {
  const { t } = useTranslation()
  const { data, isPending } = useMoyensPays()

  if (isPending) return <SqueletteTexte lignes={3} />
  if (!data || (data.moyens.length === 0 && data.pays === 'SN')) return null

  return (
    <Carte rembourrage="sm" data-moyens-pays>
      <CarteEnTete titre={t('reglages.moyensPays.titre')} actions={<HautParleur cle="reglages.moyensPays.titre" />} className="mb-1" />
      <p className="mb-3 text-xs text-texte-3">{t('reglages.moyensPays.aide')}</p>
      {data.moyens.length === 0 ? (
        <p className="text-sm text-texte-2">{t('reglages.moyensPays.vide')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bordure">
          {data.moyens.map((m) => (
            <LigneMoyen key={`${m.ulid}|${m.valeur ?? ''}|${m.active}`} moyen={m} />
          ))}
        </ul>
      )}
    </Carte>
  )
}

function LigneMoyen({ moyen }: { moyen: MoyenBoutique }) {
  const { t, i18n } = useTranslation()
  const messageErreur = useMessageErreur()
  const [valeur, setValeur] = useState(moyen.valeur ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  // Activation demandée sans numéro / lien encore saisi : le champ s'ouvre, l'enregistrement active le moyen.
  const [activation, setActivation] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  const modifie = valeur.trim() !== (moyen.valeur ?? '')
  useSaisieEnCours(modifie || activation)
  const couleur = classesCouleur(moyen.couleur)
  const numero = moyen.type === 'numero'
  const coche = moyen.active || activation
  // Champ visible quand le moyen est actif, déjà renseigné ou en cours d'activation : la carte reste compacte.
  const deplie = coche || Boolean(moyen.valeur)

  const mutation = useMutation({
    mutationFn: (corps: { active: boolean; valeur: string | null }) => configurerMoyenPays(moyen.ulid, corps),
    onSuccess: () => {
      setActivation(false)
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invaliderBoutique()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) setErreur(e.champ('valeur') ?? messageErreur(e))
      else setErreur(messageErreur(e))
    },
  })

  const envoyer = (active: boolean) => {
    setErreur(null)
    const propre = valeur.trim()
    if (active && !propre) {
      setActivation(true)
      setTimeout(() => champ.current?.focus(), 0)
      return
    }
    if (!active) setActivation(false)
    if (!active && !moyen.active) return
    mutation.mutate({ active, valeur: propre || null })
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-moyen={moyen.nom}>
      <Interrupteur
        coche={coche}
        onChange={envoyer}
        desactive={mutation.isPending}
        voix="reglages.moyensPays.activer"
        libelle={
          <span className="flex items-center gap-2">
            <span className={cn('size-2.5 shrink-0 rounded-full', couleur.pastille)} aria-hidden="true" />
            {moyen.nom}
          </span>
        }
        description={instructionsMoyen(moyen, i18n.language) ?? undefined}
      />
      {deplie && (
        <form
          className="flex items-start gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            envoyer(coche)
          }}
        >
          <Champ
            ref={champ}
            libelle={numero ? t('reglages.moyensPays.numero') : t('reglages.moyensPays.lien')}
            voix={numero ? 'reglages.moyensPays.numero' : 'reglages.moyensPays.lien'}
            icone={numero ? <Phone /> : <Link2 />}
            type={numero ? 'tel' : 'url'}
            inputMode={numero ? 'tel' : 'url'}
            autoComplete="off"
            spellCheck={false}
            placeholder={numero ? '+225 07 00 00 00 00' : 'https://…'}
            value={valeur}
            maxLength={300}
            onChange={(e) => setValeur(e.target.value)}
            aide={activation ? t('reglages.moyensPays.valeurRequise') : numero ? t('reglages.moyensPays.numeroAide') : t('reglages.moyensPays.lienAide')}
            erreur={erreur ?? undefined}
            classeConteneur="min-w-0 flex-1"
          />
          <BoutonIcone
            type="submit"
            libelle={t('commun.enregistrer')}
            icone={<Save />}
            voix="commun.enregistrer"
            variante={activation ? 'primaire' : 'secondaire'}
            disabled={!(modifie || activation) || mutation.isPending}
            className="mt-[1.85rem]"
          />
        </form>
      )}
    </li>
  )
}
