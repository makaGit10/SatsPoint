import { cn } from '@/lib/cn'

export type VarianteBouton = 'primaire' | 'secondaire' | 'fantome' | 'danger' | 'mm'
export type TailleBouton = 'sm' | 'md' | 'lg' | 'xl'

const VARIANTES: Record<VarianteBouton, string> = {
  primaire: 'bg-accent text-sur-accent shadow-xs hover:bg-accent-fort',
  secondaire: 'border border-bordure bg-surface text-texte shadow-xs hover:bg-surface-2',
  fantome: 'text-texte-2 hover:bg-surface-2 hover:text-texte',
  danger: 'bg-danger text-white shadow-xs hover:brightness-105',
  mm: 'bg-mm text-white shadow-xs hover:brightness-105',
}

/* Hauteurs : ≥ 44 px au doigt (mobile), plus compactes au pointeur (bureau). */
const TAILLES: Record<TailleBouton, string> = {
  sm: 'h-9 px-2.5 text-sm gap-1.5 md:h-8',
  md: 'h-11 px-3.5 text-base gap-2 md:h-9',
  lg: 'h-12 px-4 text-lg gap-2 md:h-11',
  xl: 'h-16 px-5 text-xl gap-2.5',
}

export const TAILLES_ICONE_BOUTON: Record<TailleBouton, number> = { sm: 15, md: 17, lg: 18, xl: 22 }

/** Classes partagées entre <Bouton> et <BoutonLien>. */
export function classesBouton({
  variante = 'primaire',
  taille = 'md',
  pleineLargeur = false,
  className,
}: {
  variante?: VarianteBouton
  taille?: TailleBouton
  pleineLargeur?: boolean
  className?: string
}) {
  return cn(
    'relative inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
    'transition-[background-color,color,box-shadow,transform,filter] duration-150 ease-sortie',
    'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55',
    VARIANTES[variante],
    TAILLES[taille],
    pleineLargeur && 'w-full',
    className,
  )
}
