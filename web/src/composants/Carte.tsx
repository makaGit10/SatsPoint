import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PropsCarte extends HTMLAttributes<HTMLDivElement> {
  /** Espacement intérieur. */
  rembourrage?: 'none' | 'sm' | 'md'
  /** Carte cliquable (hover + curseur). */
  interactive?: boolean
}

const REMBOURRAGE = { none: '', sm: 'p-4', md: 'p-5 md:p-6' } as const

/** Carte en verre dépoli (direction « Lumière »). */
export function Carte({ rembourrage = 'md', interactive, className, ...reste }: PropsCarte) {
  return (
    <div
      className={cn(
        'verre rounded-xl',
        REMBOURRAGE[rembourrage],
        interactive && 'cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md',
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
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-lg font-bold text-texte">{titre}</h2>
        {sousTitre && <p className="mt-1 text-sm text-texte-3">{sousTitre}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}
