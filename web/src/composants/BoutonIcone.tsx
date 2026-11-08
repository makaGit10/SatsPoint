import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { Infobulle } from './Infobulle'

export type VarianteBoutonIcone = 'fantome' | 'secondaire' | 'primaire' | 'danger'
export type TailleBoutonIcone = 'sm' | 'md' | 'lg'

const VARIANTES: Record<VarianteBoutonIcone, string> = {
  fantome: 'text-texte-2 hover:bg-surface-2 hover:text-texte',
  secondaire: 'border border-bordure bg-surface text-texte-2 shadow-xs hover:bg-surface-2 hover:text-texte',
  primaire: 'bg-accent text-sur-accent shadow-xs hover:bg-accent-fort',
  danger: 'text-danger-texte hover:bg-danger-doux',
}

/* Visuel compact ; zone tactile ≥ 44 px garantie par le pseudo-élément. */
const TAILLES: Record<TailleBoutonIcone, string> = {
  sm: 'h-8 w-8 [&>svg]:size-4',
  md: 'h-9 w-9 [&>svg]:size-[18px]',
  lg: 'h-11 w-11 [&>svg]:size-5',
}

export interface PropsBoutonIcone extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Libellé accessible (aria-label) et texte de l'infobulle. */
  libelle: string
  icone: ReactNode
  variante?: VarianteBoutonIcone
  taille?: TailleBoutonIcone
  /** Clé vocale : petit haut-parleur dans le coin. */
  voix?: string
  /** État enfoncé (ex. filtre actif). */
  actif?: boolean
  /** Masque l'infobulle (ex. dans une barre de navigation déjà légendée). */
  sansInfobulle?: boolean
  coteInfobulle?: 'top' | 'bottom' | 'left' | 'right'
}

/** Icône cliquable avec infobulle, libellé accessible et aide vocale. */
export function BoutonIcone({
  libelle,
  icone,
  variante = 'fantome',
  taille = 'md',
  voix,
  actif,
  sansInfobulle,
  coteInfobulle,
  className,
  type = 'button',
  ...reste
}: PropsBoutonIcone) {
  return (
    <Infobulle contenu={libelle} desactivee={sansInfobulle} cote={coteInfobulle}>
      <button
        type={type}
        aria-label={libelle}
        aria-pressed={actif}
        className={cn(
          'zone-tactile relative inline-flex shrink-0 items-center justify-center rounded-md select-none',
          'transition-[background-color,color,transform] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-55',
          VARIANTES[variante],
          TAILLES[taille],
          actif && variante === 'fantome' && 'bg-surface-2 text-texte',
          className,
        )}
        {...reste}
      >
        <span className="inline-flex" aria-hidden="true">
          {icone}
        </span>
        {voix && <HautParleur cle={voix} dansBouton taille={14} />}
      </button>
    </Infobulle>
  )
}
