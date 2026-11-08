import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type TonPastille = 'succes' | 'attente' | 'neutre' | 'danger' | 'accent' | 'mm'

const TONS: Record<TonPastille, string> = {
  succes: 'bg-succes-doux text-succes-texte',
  attente: 'bg-attente-doux text-attente-texte',
  neutre: 'bg-neutre-doux text-neutre-texte',
  danger: 'bg-danger-doux text-danger-texte',
  accent: 'bg-accent-doux text-accent-texte',
  mm: 'bg-mm-doux text-mm-texte',
}

const POINTS: Record<TonPastille, string> = {
  succes: 'bg-succes',
  attente: 'bg-attente',
  neutre: 'bg-neutre',
  danger: 'bg-danger',
  accent: 'bg-accent',
  mm: 'bg-mm',
}

export interface PropsPastille extends HTMLAttributes<HTMLSpanElement> {
  ton?: TonPastille
  icone?: ReactNode
  /** Point coloré à gauche (statut). */
  point?: boolean
  /** Point animé (en attente…). */
  pulse?: boolean
  children?: ReactNode
}

/** Étiquette de statut : couleur + icône pour comprendre sans lire. */
export function Pastille({ ton = 'neutre', icone, point, pulse, className, children, ...reste }: PropsPastille) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONS[ton],
        className,
      )}
      {...reste}
    >
      {point && <span className={cn('size-1.5 rounded-full', POINTS[ton], pulse && 'anim-pulsation')} aria-hidden="true" />}
      {icone && (
        <span className="inline-flex [&>svg]:size-3" aria-hidden="true">
          {icone}
        </span>
      )}
      {children}
    </span>
  )
}
