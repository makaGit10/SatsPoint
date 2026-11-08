import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Touche de clavier affichée discrètement (raccourcis). */
export function Touche({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-bordure bg-surface px-1 font-sans text-2xs font-medium text-texte-2 shadow-xs', className)}>
      {children}
    </kbd>
  )
}
