import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PropsCarte extends HTMLAttributes<HTMLDivElement> {
  /** Espacement intérieur. */
  rembourrage?: 'none' | 'sm' | 'md'
  /** Carte cliquable (hover + curseur). */
  interactive?: boolean
}

const REMBOURRAGE = { none: '', sm: 'p-3', md: 'p-4' } as const

/** Surface délimitée, compacte, sans marge excessive. */
export function Carte({ rembourrage = 'md', interactive, className, ...reste }: PropsCarte) {
  return (
    <div
      className={cn(
        'rounded-lg border border-bordure bg-surface shadow-xs',
        REMBOURRAGE[rembourrage],
        interactive && 'cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-bordure-forte hover:shadow-sm',
        className,
      )}
      {...reste}
    />
  )
}

export interface PropsCarteEnTete {
  titre: ReactNode
  sousTitre?: ReactNode
  actions?: ReactNode
  className?: string
}

export function CarteEnTete({ titre, sousTitre, actions, className }: PropsCarteEnTete) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-texte">{titre}</h2>
        {sousTitre && <p className="mt-0.5 text-sm text-texte-3">{sousTitre}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}
