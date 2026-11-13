import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from './HautParleur'

/**
 * Texte d'explication suivi de son haut-parleur (clé vocale `voix`, relevée par le registre) : toute consigne
 * écrite peut aussi s'écouter, enregistrée au studio dans chaque langue.
 */
export function TexteLu({ voix, children, className, as: Balise = 'p' }: { voix: string; children: ReactNode; className?: string; as?: 'p' | 'span' | 'h2' }) {
  return (
    <Balise className={cn('flex items-start gap-1', className)}>
      <span className="min-w-0 flex-1">{children}</span>
      <HautParleur cle={voix} className="-my-1.5 -mr-1.5" />
    </Balise>
  )
}
