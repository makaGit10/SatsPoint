import { Delete } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { vibrer } from '@/lib/vibrer'
import { ajouterChiffres, DELAI_APPUI_LONG, TOUCHES, type Touche } from './saisie'


export interface PropsPave {
  valeur: string
  onChange: (valeur: string) => void
  desactive?: boolean
  className?: string
}

/**
 * Pavé numérique de la caisse : touches ≥ 64 px, `000`, ⌫ (appui long = tout effacer),
 * retour haptique sur chaque touche quand l'appareil le permet.
 */
export function Pave({ valeur, onChange, desactive, className }: PropsPave) {
  const { t } = useTranslation()
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appuiLongFait = useRef(false)

  const taper = (touche: Touche) => {
    vibrer(10)
    if (touche === 'effacer') {
      if (appuiLongFait.current) {
        appuiLongFait.current = false
        return
      }
      onChange(valeur.slice(0, -1))
      return
    }
    onChange(ajouterChiffres(valeur, touche))
  }

  const debutAppui = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    appuiLongFait.current = false
    minuterie.current = setTimeout(() => {
      appuiLongFait.current = true
      vibrer([30, 40, 30])
      onChange('')
    }, DELAI_APPUI_LONG)
  }
  const finAppui = () => {
    if (minuterie.current) clearTimeout(minuterie.current)
    minuterie.current = null
  }

  return (
    <div role="group" aria-label={t('caisse.pave')} className={cn('grid grid-cols-3 gap-2.5', className)} data-pave>
      {TOUCHES.map((touche) => {
        const effacer = touche === 'effacer'
        return (
          <button
            key={touche}
            type="button"
            disabled={desactive}
            aria-label={effacer ? `${t('caisse.effacer')} — ${t('caisse.toutEffacerAide')}` : t('caisse.touche', { valeur: touche })}
            onClick={() => taper(touche)}
            onPointerDown={effacer ? debutAppui : undefined}
            onPointerUp={effacer ? finAppui : undefined}
            onPointerLeave={effacer ? finAppui : undefined}
            onPointerCancel={effacer ? finAppui : undefined}
            onContextMenu={effacer ? (e) => e.preventDefault() : undefined}
            className={cn(
              'flex h-16 items-center justify-center rounded-full border text-2xl font-bold select-none tabulaire md:h-[3.75rem]',
              'transition-[background-color,transform,border-color] duration-100 active:scale-[0.97] disabled:opacity-45',
              'touch-manipulation',
              effacer
                ? 'border-transparent bg-accent-doux text-accent-texte hover:brightness-95 active:brightness-90'
                : 'border-verre-bordure bg-verre text-texte shadow-xs backdrop-blur-md hover:bg-surface active:bg-surface',
              touche === '000' && 'text-xl',
            )}
          >
            {effacer ? <Delete size={26} strokeWidth={1.75} aria-hidden="true" /> : touche}
          </button>
        )
      })}
    </div>
  )
}
