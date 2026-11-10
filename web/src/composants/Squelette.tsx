import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Bloc de chargement (uniquement au premier affichage ; jamais lors d'un rechargement silencieux). */
export function Squelette({ className, ...reste }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('anim-pulsation rounded-sm bg-surface-3', className)} {...reste} />
}

export function SqueletteTexte({ lignes = 3, className }: { lignes?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lignes }, (_, i) => (
        <Squelette key={i} className={cn('h-3.5', i === lignes - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** Squelette d'une liste (lignes avec avatar + deux textes + montant). */
export function SqueletteListe({ lignes = 4, className }: { lignes?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-bordure verre rounded-xl', className)} aria-hidden="true">
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Squelette className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Squelette className="h-3.5 w-1/2" />
            <Squelette className="h-3 w-1/3" />
          </div>
          <Squelette className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Squelette d'indicateurs (cartes chiffrées). */
export function SqueletteIndicateurs({ nombre = 3, className }: { nombre?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-3', className)} aria-hidden="true">
      {Array.from({ length: nombre }, (_, i) => (
        <div key={i} className="verre rounded-xl p-3">
          <Squelette className="mb-2 h-3 w-20" />
          <Squelette className="h-6 w-28" />
        </div>
      ))}
    </div>
  )
}
