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
    <div className={cn('flex flex-col gap-1.5', classeConteneur)}>
      <label htmlFor={idChamp} className={cn('text-sm font-semibold text-texte-2', !libelleVisible && 'sr-only')}>
        {libelle}
      </label>
      <div className="relative">
        <select
          id={idChamp}
          aria-invalid={erreur ? true : undefined}
          className={cn(
            'champ-verre w-full appearance-none pr-10 pl-4',
            taille === 'md' ? 'h-13 text-base md:h-12' : 'h-10 rounded-full text-sm md:h-9',
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
        <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-texte-3" aria-hidden="true" />
      </div>
      {erreur ? <p role="alert" className="text-sm text-danger-texte">{erreur}</p> : aide && <p className="text-xs text-texte-3">{aide}</p>}
    </div>
  )
}
