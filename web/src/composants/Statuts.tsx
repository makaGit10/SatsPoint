import { Ban, CircleCheck, Clock, Smartphone, TriangleAlert, XCircle, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AlerteVente, MethodePaiement, StatutPaiement, StatutVente } from '@/api/types'
import { cn } from '@/lib/cn'
import { Pastille, type TonPastille } from './Pastille'

const STATUTS_VENTE: Record<StatutVente, { ton: TonPastille; icone: ReactNode; pulse?: boolean }> = {
  payee: { ton: 'succes', icone: <CircleCheck /> },
  en_attente: { ton: 'attente', icone: <Clock />, pulse: true },
  annulee: { ton: 'neutre', icone: <XCircle /> },
  expiree: { ton: 'neutre', icone: <Ban /> },
}

const STATUTS_PAIEMENT: Record<StatutPaiement, { ton: TonPastille; icone: ReactNode; pulse?: boolean }> = {
  reussi: { ton: 'succes', icone: <CircleCheck /> },
  en_attente: { ton: 'attente', icone: <Clock />, pulse: true },
  annule: { ton: 'neutre', icone: <XCircle /> },
  expire: { ton: 'neutre', icone: <Ban /> },
  echoue: { ton: 'danger', icone: <TriangleAlert /> },
}

/** Statut d'une vente : couleur + icône (comprendre sans lire). */
export function PastilleStatutVente({ statut, className, sansTexte }: { statut: StatutVente; className?: string; sansTexte?: boolean }) {
  const { t } = useTranslation()
  const s = STATUTS_VENTE[statut]
  return (
    <Pastille ton={s.ton} icone={s.icone} point={s.pulse && !sansTexte} pulse={s.pulse} className={cn(sansTexte && 'px-1.5', className)} aria-label={sansTexte ? t(`statuts.${statut}`) : undefined}>
      {!sansTexte && t(`statuts.${statut}`)}
    </Pastille>
  )
}

export function PastilleStatutPaiement({ statut, className }: { statut: StatutPaiement; className?: string }) {
  const { t } = useTranslation()
  const s = STATUTS_PAIEMENT[statut]
  return (
    <Pastille ton={s.ton} icone={s.icone} point={s.pulse} pulse={s.pulse} className={className}>
      {t(`statutsPaiement.${statut}`)}
    </Pastille>
  )
}

export function PastilleAlerte({ alerte, className }: { alerte: AlerteVente; className?: string }) {
  const { t } = useTranslation()
  return (
    <Pastille ton="danger" icone={<TriangleAlert />} className={className}>
      {t(alerte === 'trop_percu' ? 'ventes.tropPercu' : 'ventes.payeeApresAnnulation')}
    </Pastille>
  )
}

/** Icône du moyen de paiement : éclair orange (bitcoin) ou téléphone bleu (mobile money). */
export function IconeMethode({ methode, taille = 16, className, pleine }: { methode: MethodePaiement | null; taille?: number; className?: string; pleine?: boolean }) {
  const { t } = useTranslation()
  // Gabarit vide de la même taille : les lignes restent alignées sans moyen (vente expirée / annulée sans tentative).
  if (!methode) return <span className={cn('inline-block shrink-0', className)} style={{ width: pleine ? taille * 2 : taille, height: pleine ? taille * 2 : taille }} aria-hidden="true" />
  const lightning = methode === 'lightning'
  const Icone = lightning ? Zap : Smartphone
  return (
    <span
      role="img"
      aria-label={t(`methodes.${methode}`)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        pleine ? (lightning ? 'bg-accent-doux text-accent-texte' : 'bg-mm-doux text-mm-texte') : lightning ? 'text-accent' : 'text-mm',
        className,
      )}
      style={pleine ? { width: taille * 2, height: taille * 2 } : undefined}
    >
      <Icone size={taille} fill={lightning && !pleine ? 'currentColor' : 'none'} strokeWidth={lightning ? 1.75 : 2} />
    </span>
  )
}
