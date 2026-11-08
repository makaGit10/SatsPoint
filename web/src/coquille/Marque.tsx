import { Zap } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Logo SatsPoint : éclair orange sur carré sombre, et mot-symbole optionnel. */
export function Marque({ taille = 'md', sansTexte, className }: { taille?: 'sm' | 'md' | 'lg'; sansTexte?: boolean; className?: string }) {
  const carre = { sm: 'size-7 rounded-md [&>svg]:size-4', md: 'size-8 rounded-md [&>svg]:size-[18px]', lg: 'size-14 rounded-xl [&>svg]:size-8' }[taille]
  const texte = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[taille]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn('inline-flex shrink-0 items-center justify-center bg-[#15181e] text-accent shadow-xs', carre)} aria-hidden="true">
        <Zap fill="currentColor" strokeWidth={1.5} />
      </span>
      {!sansTexte && <span className={cn('font-semibold tracking-tight text-texte', texte)}>SatsPoint</span>}
    </span>
  )
}
