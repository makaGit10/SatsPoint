import { CircleAlert } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

export interface PropsChamp extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  libelle: string
  /** Clé vocale du libellé : petit haut-parleur à côté (l'audio dit à quoi sert la case). */
  voix?: string
  /** Texte d'aide sous le champ. */
  aide?: ReactNode
  /** Message d'erreur (remplace l'aide, passe le champ en rouge). */
  erreur?: ReactNode
  /** Icône à gauche. */
  icone?: ReactNode
  /** Élément à droite (ex. bouton afficher le mot de passe). */
  suffixe?: ReactNode
  /** Élément interactif à gauche (ex. indicatif du pays) ; remplace l'icône. */
  prefixe?: ReactNode
  /** Mention « facultatif » à droite du libellé. */
  mentionOptionnel?: string
  classeConteneur?: string
}

/** Champ de saisie avec libellé, aide et erreur accessibles. */
export const Champ = forwardRef<HTMLInputElement, PropsChamp>(function Champ(
  { libelle, voix, aide, erreur, icone, suffixe, prefixe, mentionOptionnel, classeConteneur, className, id, ...reste },
  ref,
) {
  const idAuto = useId()
  const idChamp = id ?? idAuto
  const idAide = `${idChamp}-aide`
  const idErreur = `${idChamp}-erreur`
  const decrit = [erreur ? idErreur : null, aide ? idAide : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', classeConteneur)}>
      <label htmlFor={idChamp} className="flex items-baseline justify-between text-sm font-semibold text-texte-2">
        <span className="inline-flex items-center gap-0.5">
          {libelle}
          {voix && <HautParleur cle={voix} className="-my-2" />}
        </span>
        {mentionOptionnel && <span className="text-xs font-normal text-texte-3">{mentionOptionnel}</span>}
      </label>
      <div className="relative flex items-center">
        {prefixe && <span className="absolute inset-y-0 left-0 z-[2] inline-flex items-center">{prefixe}</span>}
        {icone && !prefixe && (
          <span className="pointer-events-none absolute left-4 z-[2] inline-flex text-texte-3 [&>svg]:size-[18px]" aria-hidden="true">
            {icone}
          </span>
        )}
        <input
          ref={ref}
          id={idChamp}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={decrit}
          className={cn(
            'champ-verre h-13 w-full px-4 text-base md:h-12',
            icone && !prefixe && 'pl-11',
            prefixe && 'pl-[4.75rem]',
            suffixe && 'pr-12',
            className,
          )}
          {...reste}
        />
        {suffixe && <span className="absolute right-1.5 z-[2] inline-flex items-center">{suffixe}</span>}
      </div>
      {erreur ? (
        <p id={idErreur} role="alert" className="flex items-start gap-1 text-sm text-danger-texte">
          <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{erreur}</span>
        </p>
      ) : (
        aide && (
          <p id={idAide} className="text-xs text-texte-3">
            {aide}
          </p>
        )
      )}
    </div>
  )
})
