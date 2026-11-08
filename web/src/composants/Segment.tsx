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
      className={cn('inline-flex w-full items-stretch gap-0.5 rounded-md bg-surface-2 p-0.5', taille === 'md' ? 'h-10 md:h-9' : 'h-9 md:h-8', className)}
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
              'relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 font-medium whitespace-nowrap text-texte-2 transition-colors duration-150 hover:text-texte disabled:opacity-45 disabled:hover:text-texte-2',
              taille === 'md' ? 'text-sm' : 'text-xs',
              actif && 'bg-surface text-texte shadow-xs',
            )}
          >
            {o.icone && <span className={cn('inline-flex', taille === 'md' ? '[&>svg]:size-[15px]' : '[&>svg]:size-3.5')} aria-hidden="true">{o.icone}</span>}
            {o.libelle}
            {o.voix && <HautParleur cle={o.voix} dansBouton />}
          </button>
        )
      })}
    </div>
  )
}
