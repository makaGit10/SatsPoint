import { cn } from '@/lib/cn'

/**
 * Fichier du logo : SEUL endroit à changer pour remplacer le logo (SVG ou PNG carré, fond transparent).
 * Après remplacement : `node scripts/generer-icones.mjs` régénère favicon et icônes PWA à partir du même fichier.
 */
export const FICHIER_LOGO = '/logo.svg'

/** Logo SatsPoint (fichier `public/logo.svg`) et mot-symbole optionnel. */
export function Marque({ taille = 'md', sansTexte, className }: { taille?: 'sm' | 'md' | 'lg'; sansTexte?: boolean; className?: string }) {
  const logo = { sm: 'size-9', md: 'size-10', lg: 'size-16' }[taille]
  const texte = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' }[taille]
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src={FICHIER_LOGO}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn('ombre-logo shrink-0 select-none', logo)}
      />
      {!sansTexte && <span className={cn('titre-serre text-texte', texte)}>SatsPoint</span>}
    </span>
  )
}
