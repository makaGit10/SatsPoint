import { cn } from '@/lib/cn'

export type VarianteBouton = 'primaire' | 'secondaire' | 'fantome' | 'danger' | 'mm'
export type TailleBouton = 'sm' | 'md' | 'lg' | 'xl'

const VARIANTES: Record<VarianteBouton, string> = {
  primaire: 'fond-or text-sur-accent font-bold',
  secondaire: 'verre-fort text-texte hover:bg-surface',
  fantome: 'text-texte-2 hover:bg-accent-doux hover:text-texte',
  danger: 'bg-danger text-white shadow-sm hover:brightness-105',
  mm: 'bg-mm text-white ombre-mm hover:brightness-105',
}

/* Hauteurs : ≥ 44 px au doigt (mobile), plus compactes au pointeur (bureau). */
const TAILLES: Record<TailleBouton, string> = {
  sm: 'h-10 px-4 text-sm gap-1.5 md:h-9',
  md: 'h-12 px-5 text-base gap-2 md:h-11',
  lg: 'h-14 px-6 text-lg gap-2 md:h-12',
  xl: 'h-16 px-7 text-lg gap-2.5',
}

export const TAILLES_ICONE_BOUTON: Record<TailleBouton, number> = { sm: 16, md: 18, lg: 20, xl: 22 }

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
    'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap select-none',
    'transition-[background-color,color,box-shadow,transform,filter] duration-150 ease-sortie',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55',
    VARIANTES[variante],
    TAILLES[taille],
    pleineLargeur && 'w-full',
    className,
  )
}
