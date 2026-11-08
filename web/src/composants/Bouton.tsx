import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { HautParleur } from '@/voix/HautParleur'
import { classesBouton, TAILLES_ICONE_BOUTON, type TailleBouton, type VarianteBouton } from './classesBouton'

export interface PropsBouton extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variante?: VarianteBouton
  taille?: TailleBouton
  /** Affiche un indicateur et désactive le bouton. */
  chargement?: boolean
  /** Clé vocale : affiche un petit haut-parleur dans le coin si un audio existe. */
  voix?: string
  icone?: ReactNode
  iconeDroite?: ReactNode
  pleineLargeur?: boolean
  children?: ReactNode
}

function Icone({ enfant, taille }: { enfant: ReactNode; taille: TailleBouton }) {
  if (!enfant) return null
  return (
    <span className="inline-flex shrink-0 [&>svg]:size-[1em]" style={{ fontSize: TAILLES_ICONE_BOUTON[taille] }} aria-hidden="true">
      {enfant}
    </span>
  )
}

export function Bouton({
  variante = 'primaire',
  taille = 'md',
  chargement = false,
  voix,
  icone,
  iconeDroite,
  pleineLargeur,
  className,
  children,
  disabled,
  type = 'button',
  ...reste
}: PropsBouton) {
  return (
    <button
      type={type}
      disabled={disabled || chargement}
      aria-busy={chargement || undefined}
      className={classesBouton({ variante, taille, pleineLargeur, className })}
      {...reste}
    >
      {chargement ? <Loader2 size={TAILLES_ICONE_BOUTON[taille]} className="animate-spin" aria-hidden="true" /> : <Icone enfant={icone} taille={taille} />}
      {children}
      <Icone enfant={iconeDroite} taille={taille} />
      {voix && <HautParleur cle={voix} dansBouton taille={14} />}
    </button>
  )
}

export interface PropsBoutonLien extends LinkProps {
  variante?: VarianteBouton
  taille?: TailleBouton
  pleineLargeur?: boolean
  voix?: string
  icone?: ReactNode
  iconeDroite?: ReactNode
}

/** Lien de navigation habillé en bouton (sémantique <a> conservée). */
export function BoutonLien({ variante = 'primaire', taille = 'md', pleineLargeur, voix, icone, iconeDroite, className, children, ...reste }: PropsBoutonLien) {
  return (
    <Link className={classesBouton({ variante, taille, pleineLargeur, className })} {...reste}>
      <Icone enfant={icone} taille={taille} />
      {children}
      <Icone enfant={iconeDroite} taille={taille} />
      {voix && <HautParleur cle={voix} dansBouton taille={14} />}
    </Link>
  )
}
