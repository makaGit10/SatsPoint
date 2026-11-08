import { cn } from '@/lib/cn'

/**
 * Logo SatsPoint : éclair or (dégradé, masque CSS `marque-eclair`, même tracé que le favicon) sur carré blanc
 * — surface anthracite en thème sombre — et mot-symbole optionnel.
 */
export function Marque({ taille = 'md', sansTexte, className }: { taille?: 'sm' | 'md' | 'lg'; sansTexte?: boolean; className?: string }) {
  const carre = { sm: 'size-7 rounded-md', md: 'size-8 rounded-md', lg: 'size-14 rounded-xl' }[taille]
  const texte = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[taille]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn('inline-flex shrink-0 border border-bordure bg-surface shadow-xs', carre)} aria-hidden="true">
        <span className="marque-eclair size-full" />
      </span>
      {!sansTexte && <span className={cn('font-semibold tracking-tight text-texte', texte)}>SatsPoint</span>}
    </span>
  )
}
