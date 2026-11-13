import type { HTMLAttributes } from 'react'
import type { VenteCourte } from '@/api/types'
import { IconeMethode, PastilleAlerte, PastilleStatutVente } from '@/composants/Statuts'
import { cn } from '@/lib/cn'
import { formaterFCFA, formaterHeure } from '@/lib/format'

export interface PropsLigneVente {
  vente: VenteCourte
  onOuvrir: (vente: VenteCourte) => void
  /** Masque le caissier (ex. écran d'un caissier qui ne voit que ses ventes). */
  sansCaissier?: boolean
  /** Rendu dense d'une seule ligne (dernières ventes du tableau de bord), même sur bureau. */
  compacte?: boolean
  className?: string
}

/**
 * Ligne compacte d'une vente (liste des ventes, dernières ventes du tableau de bord) :
 * icône du moyen, n° + heure, caissier, statut, montant. Toute la ligne est cliquable.
 */
export function LigneVente({ vente, onOuvrir, sansCaissier, compacte, className }: PropsLigneVente) {
  const methode = vente.methode_reussie ?? vente.methode_en_cours ?? null
  return (
    <li className={className}>
      <button
        type="button"
        onClick={() => onOuvrir(vente)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-2 active:bg-surface-2',
          !compacte && 'md:grid md:grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(96px,auto)] md:items-center md:gap-3',
        )}
      >
        <IconeMethode methode={methode} taille={14} pleine />
        <span className="min-w-0 flex-1 md:flex-none">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-medium whitespace-nowrap text-texte tabulaire">{vente.numero}</span>
            <span className="text-xs text-texte-3 tabulaire">{formaterHeure(vente.cree_le)}</span>{' '}
          </span>
          {!sansCaissier && <span className={cn('block truncate text-xs text-texte-3', !compacte && 'md:hidden')}>{vente.caissier.nom}</span>}
        </span>
        {!compacte && (!sansCaissier ? <span className="hidden min-w-0 truncate text-sm text-texte-2 md:block">{vente.caissier.nom}</span> : <span className="hidden md:block" />)}
        <span className="flex shrink-0 items-center gap-1">
          {vente.alerte && !compacte && (
            <span className="hidden md:inline-flex">
              <PastilleAlerte alerte={vente.alerte} />
            </span>
          )}
          <span className={cn('inline-flex', !compacte && 'md:hidden')}>
            {/* Nom de la ligne = son contenu (WCAG 2.5.3) ; la pastille sans texte porte le statut en toutes lettres (aria-label). */}
            <PastilleStatutVente statut={vente.statut} sansTexte />
          </span>
          {!compacte && (
            <span className="hidden md:inline-flex">
              <PastilleStatutVente statut={vente.statut} />
            </span>
          )}
        </span>
        <span className="shrink-0 text-right text-base font-semibold text-texte tabulaire">{formaterFCFA(vente.montant_xof)}</span>
      </button>
    </li>
  )
}

/** Conteneur de lignes (bordure, séparateurs). `compacte` : liste imbriquée dans une carte, sans bordure propre. */
export function ListeVentes({ children, className, compacte, ...reste }: HTMLAttributes<HTMLUListElement> & { compacte?: boolean }) {
  return (
    <ul className={cn('divide-y divide-bordure overflow-hidden', compacte ? '-mx-3 [&>li>button]:px-3' : 'verre rounded-xl', className)} {...reste}>
      {children}
    </ul>
  )
}
