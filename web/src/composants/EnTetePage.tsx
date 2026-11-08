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

/** Titre de page compact + actions à droite. */
export function EnTetePage({ titre, sousTitre, actions, voix, className }: PropsEnTetePage) {
  return (
    <header className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight text-texte">
          <span className="truncate">{titre}</span>
          {voix && <HautParleur cle={voix} />}
        </h1>
        {sousTitre && <p className="mt-0.5 text-sm text-texte-3">{sousTitre}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}
