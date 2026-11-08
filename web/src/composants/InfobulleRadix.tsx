import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

/** Implémentation Radix de l'infobulle, chargée à la demande (pointeur fin uniquement). */
export default function InfobulleRadix({ contenu, cote = 'bottom', children }: { contenu: ReactNode; cote?: 'top' | 'bottom' | 'left' | 'right'; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={cote}
            sideOffset={6}
            collisionPadding={8}
            className="anim-apparition z-50 max-w-60 rounded-sm bg-inverse px-2 py-1 text-xs font-medium text-inverse-texte shadow-md select-none"
          >
            {contenu}
            <Tooltip.Arrow className="fill-inverse" width={8} height={4} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
