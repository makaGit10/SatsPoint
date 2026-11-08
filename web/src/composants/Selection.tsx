import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface PropsSelection extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  libelle: string
  /** Libellé visible (sinon seulement accessible). */
  libelleVisible?: boolean
  options: readonly { valeur: string; libelle: string }[]
  aide?: ReactNode
  erreur?: ReactNode
  taille?: 'sm' | 'md'
  classeConteneur?: string
}

/** Liste déroulante native (sélecteur système sur mobile, zéro dépendance), habillée comme un champ. */
export function Selection({ libelle, libelleVisible = true, options, aide, erreur, taille = 'md', classeConteneur, className, id, ...reste }: PropsSelection) {
  const idAuto = useId()
  const idChamp = id ?? idAuto
  return (
    <div className={cn('flex flex-col gap-1', classeConteneur)}>
      <label htmlFor={idChamp} className={cn('text-sm font-medium text-texte-2', !libelleVisible && 'sr-only')}>
        {libelle}
      </label>
      <div className="relative">
        <select
          id={idChamp}
          aria-invalid={erreur ? true : undefined}
          className={cn(
            'w-full appearance-none rounded-md border bg-surface pr-8 pl-3 text-texte shadow-xs outline-none transition-[border-color,box-shadow] duration-150',
            'focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-surface-2 disabled:text-texte-3',
            taille === 'md' ? 'h-11 text-base md:h-10' : 'h-9 text-sm md:h-8',
            erreur ? 'border-danger' : 'border-bordure hover:border-bordure-forte',
            className,
          )}
          {...reste}
        >
          {options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-texte-3" aria-hidden="true" />
      </div>
      {erreur ? <p role="alert" className="text-sm text-danger-texte">{erreur}</p> : aide && <p className="text-xs text-texte-3">{aide}</p>}
    </div>
  )
}
