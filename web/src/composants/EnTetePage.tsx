import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

export interface PropsEnTetePage {
  titre: ReactNode
  sousTitre?: ReactNode
  actions?: ReactNode
  /** Clé vocale du titre. */
  voix?: string
  className?: string
}

/** Grand titre de page + actions à droite. */
export function EnTetePage({ titre, sousTitre, actions, voix, className }: PropsEnTetePage) {
  return (
    <header className={cn('mb-5 flex items-start justify-between gap-3 md:mb-6', className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl text-texte md:text-3xl">
          <span className="truncate">{titre}</span>
          {voix && <HautParleur cle={voix} />}
        </h1>
        {sousTitre && <p className="mt-1.5 text-base text-texte-3">{sousTitre}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}
