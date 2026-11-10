import { ChevronRight, Smartphone, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MethodePaiement, MoyenBoutique, Operateur } from '@/api/types'
import { Dialogue } from '@/composants/Dialogue'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { cn } from '@/lib/cn'
import { classesCouleur } from '@/lib/couleursMoyens'
import { formaterFCFA, formaterSats } from '@/lib/format'
import { OPERATEURS } from '@/lib/methodes'
import { HautParleur } from '@/voix/HautParleur'

export interface MoyensDisponibles {
  lightning: boolean
  /** Raison d'indisponibilité du bitcoin (cours, portefeuille), affichée sous l'option désactivée. */
  lightningRaison: string | null
  paytech: boolean
  wave_manuel: boolean
  /** Moyens du pays activés par la boutique (CONTRAT_API § 14.3). */
  pays: MoyenBoutique[]
}

export interface PropsChoixMethode {
  ouvert: boolean
  onFermer: () => void
  montant: number
  sats: number | null
  moyens: MoyensDisponibles
  enCours: boolean
  erreur: string | null
  onChoisir: (methode: MethodePaiement, operateur?: Operateur, moyen?: string) => void
}

function Option({ icone, titre, detail, onClick, desactive, ton, voix, raison }: { icone: ReactNode; titre: string; detail?: string; onClick: () => void; desactive?: boolean; ton: 'accent' | 'mm' | string; voix: string; raison?: string | null }) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={desactive}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 verre rounded-xl px-3 py-2 text-left transition-[border-color,background-color] duration-150',
          'hover:border-bordure-forte hover:bg-surface-2 active:scale-[0.99] disabled:opacity-55',
        )}
      >
        <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-md [&>svg]:size-5', ton === 'accent' ? 'bg-accent-doux text-accent-texte' : ton === 'mm' ? 'bg-mm-doux text-mm-texte' : classesCouleur(ton).doux)} aria-hidden="true">
          {icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-texte">{titre}</span>
          {(raison ?? detail) && <span className={cn('block truncate text-xs', raison ? 'text-danger-texte' : 'text-texte-3')}>{raison ?? detail}</span>}
        </span>
        <ChevronRight size={16} className="shrink-0 text-texte-3" aria-hidden="true" />
      </button>
      <span className="absolute top-1/2 right-8 -translate-y-1/2">
        <HautParleur cle={voix} />
      </span>
    </li>
  )
}

/** Feuille « Comment le client paie-t-il ? » : un geste = une demande de paiement. */
export function ChoixMethode({ ouvert, onFermer, montant, sats, moyens, enCours, erreur, onChoisir }: PropsChoixMethode) {
  const { t } = useTranslation()
  return (
    <Dialogue ouvert={ouvert} onOuvertChange={(o) => !o && onFermer()} titre={t('caisse.choisirMethode')} description={formaterFCFA(montant)} taille="sm">
      <div className={cn('flex flex-col gap-3 pb-1', enCours && 'pointer-events-none opacity-60')} aria-busy={enCours || undefined}>
        <ul className="flex flex-col gap-1.5" aria-label={t('caisse.choisirMethode')}>
          <Option
            icone={<Zap />}
            ton="accent"
            titre={t('methodes.lightning')}
            detail={sats ? formaterSats(sats, { approx: true }) : undefined}
            raison={moyens.lightning ? null : moyens.lightningRaison}
            desactive={!moyens.lightning}
            voix="caisse.lightning"
            onClick={() => onChoisir('lightning')}
          />
          {moyens.paytech &&
            OPERATEURS.map((op) => (
              <Option key={op} icone={<Smartphone />} ton="mm" titre={t(`operateurs.${op}`)} detail={t('methodes.paytech')} voix="caisse.mobileMoney" onClick={() => onChoisir('paytech', op)} />
            ))}
          {moyens.wave_manuel && (
            <Option icone={<Smartphone />} ton="mm" titre={t('methodes.wave_manuel')} detail={t('reglages.waveManuelAide')} voix="caisse.mobileMoney" onClick={() => onChoisir('wave_manuel')} />
          )}
          {moyens.pays.map((m) => (
            <Option key={m.ulid} icone={<Smartphone />} ton={m.couleur} titre={m.nom} detail={t('reglages.waveManuelAide')} voix="caisse.mobileMoney" onClick={() => onChoisir('moyen_pays', undefined, m.ulid)} />
          ))}
        </ul>
        <ErreurFormulaire message={erreur} />
      </div>
    </Dialogue>
  )
}
