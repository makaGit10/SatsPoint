import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PropsEtatVide {
  icone: ReactNode
  titre: ReactNode
  texte?: ReactNode
  /** Action principale (un seul bouton de préférence). */
  action?: ReactNode
  ton?: 'accent' | 'mm' | 'neutre' | 'succes'
  className?: string
}

const TONS = {
  accent: 'bg-accent-doux text-accent-texte',
  mm: 'bg-mm-doux text-mm-texte',
  neutre: 'bg-neutre-doux text-neutre-texte',
  succes: 'bg-succes-doux text-succes-texte',
} as const

/** État vide soigné : icône, titre court, phrase utile, une action. */
export function EtatVide({ icone, titre, texte, action, ton = 'accent', className }: PropsEtatVide) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-bordure-forte bg-surface px-5 py-8 text-center md:py-10',
        className,
      )}
    >
      <span className={cn('mb-3 inline-flex size-12 items-center justify-center rounded-full [&>svg]:size-6', TONS[ton])} aria-hidden="true">
        {icone}
      </span>
      <h2 className="text-lg font-semibold text-texte">{titre}</h2>
      {texte && <p className="mt-1 max-w-sm text-sm text-texte-2">{texte}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
