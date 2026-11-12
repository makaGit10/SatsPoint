import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

export interface OptionSegment<T extends string> {
  valeur: T
  libelle: ReactNode
  icone?: ReactNode
  /** Clé vocale de l'option. */
  voix?: string
  desactive?: boolean
}

export interface PropsSegment<T extends string> {
  valeur: T
  options: readonly OptionSegment<T>[]
  onChange: (valeur: T) => void
  /** Libellé accessible du groupe. */
  libelle: string
  taille?: 'sm' | 'md'
  className?: string
}

/** Groupe de boutons exclusifs (période, méthode, opérateur…) : compact, accessible (radiogroup). */
export function Segment<T extends string>({ valeur, options, onChange, libelle, taille = 'md', className }: PropsSegment<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={libelle}
      className={cn('verre inline-flex w-full max-w-full items-stretch gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none]', taille === 'md' ? 'h-12 md:h-11' : 'h-10 md:h-9', className)}
    >
      {options.map((o) => {
        const actif = o.valeur === valeur
        return (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={actif}
            disabled={o.desactive}
            onClick={() => onChange(o.valeur)}
            className={cn(
              'relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-45',
              taille === 'md' ? 'px-3 text-sm' : 'px-2 text-xs',
              // Couleur du texte posée d'un seul côté : deux utilitaires de couleur se départageraient par l'ordre du CSS généré.
              actif ? 'bg-inverse text-inverse-texte shadow-sm' : 'text-texte-2 hover:text-texte disabled:hover:text-texte-2',
            )}
          >
            {o.icone && <span className={cn('inline-flex', taille === 'md' ? '[&>svg]:size-[15px]' : '[&>svg]:size-3.5')} aria-hidden="true">{o.icone}</span>}
            {o.libelle}
            {o.voix && <HautParleur cle={o.voix} dansBouton enLigne />}
          </button>
        )
      })}
    </div>
  )
}
