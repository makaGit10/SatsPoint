import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { BoutonIcone, type VarianteBoutonIcone } from './BoutonIcone'

export interface ElementMenu {
  id: string
  libelle: string
  /** Précision sous le libellé (ex. « lisible par Excel »). */
  detail?: string
  icone?: ReactNode
  /** Clé vocale. */
  voix: string
  onChoisir: () => void
  desactive?: boolean
}

export interface PropsMenu {
  /** Libellé accessible du bouton (et infobulle). */
  libelle: string
  icone: ReactNode
  /** Clé vocale du bouton. */
  voix: string
  elements: readonly ElementMenu[]
  variante?: VarianteBoutonIcone
  /** Titre affiché en tête de menu. */
  titre?: string
  occupe?: boolean
  alignement?: 'gauche' | 'droite'
}

/** Menu déroulant léger (sans dépendance) : bouton icône → liste d'actions ; clavier ↑ ↓ Entrée Échap, clic extérieur. */
export function Menu({ libelle, icone, voix, elements, variante = 'secondaire', titre, occupe, alignement = 'droite' }: PropsMenu) {
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const racine = useRef<HTMLDivElement>(null)
  const liste = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!ouvert) return
    const surClic = (e: PointerEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('pointerdown', surClic)
    return () => document.removeEventListener('pointerdown', surClic)
  }, [ouvert])

  useEffect(() => {
    if (ouvert) liste.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[actif]?.focus()
  }, [ouvert, actif])

  const fermer = () => {
    setOuvert(false)
    racine.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus()
  }

  const surTouche = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      fermer()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + elements.length) % elements.length)
    } else if (e.key === 'Tab') setOuvert(false)
  }

  return (
    <div ref={racine} className="relative" onKeyDown={ouvert ? surTouche : undefined}>
      <BoutonIcone
        libelle={libelle}
        icone={icone}
        voix={voix}
        variante={variante}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? id : undefined}
        disabled={occupe}
        className={cn(occupe && 'animate-pulse')}
        onClick={() => {
          setActif(0)
          setOuvert((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !ouvert) {
            e.preventDefault()
            setActif(0)
            setOuvert(true)
          }
        }}
      />
      {ouvert && (
        <div
          ref={liste}
          id={id}
          role="menu"
          aria-label={titre ?? libelle}
          className={cn('anim-apparition verre-fort absolute top-full z-40 mt-2 w-60 rounded-xl p-1.5 shadow-lg', alignement === 'droite' ? 'right-0' : 'left-0')}
        >
          {titre && <p className="px-2 pt-1 pb-1.5 text-2xs font-semibold tracking-wide text-texte-3 uppercase">{titre}</p>}
          {elements.map((el, i) => (
            <div key={el.id} className="flex items-center rounded-md hover:bg-accent-doux focus-within:bg-accent-doux">
              <button
                type="button"
                role="menuitem"
                tabIndex={i === actif ? 0 : -1}
                disabled={el.desactive}
                onMouseEnter={() => setActif(i)}
                onClick={() => {
                  setOuvert(false)
                  el.onChoisir()
                }}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-texte outline-none disabled:opacity-50"
              >
                {el.icone && (
                  <span className="inline-flex shrink-0 text-texte-2 [&>svg]:size-4" aria-hidden="true">
                    {el.icone}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{el.libelle}</span>
                  {el.detail && <span className="block truncate text-xs text-texte-3">{el.detail}</span>}
                </span>
              </button>
              <HautParleur cle={el.voix} className="mr-0.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
