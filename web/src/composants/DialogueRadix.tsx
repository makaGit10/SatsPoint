import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { BoutonIcone } from './BoutonIcone'

export interface PropsDialogueRadix {
  onFermer: () => void
  titre: ReactNode
  description?: ReactNode
  children?: ReactNode
  pied?: ReactNode
  taille?: 'sm' | 'md' | 'lg'
  titreMasque?: boolean
  className?: string
}

const TAILLES = { sm: 'md:max-w-sm', md: 'md:max-w-md', lg: 'md:max-w-2xl' } as const

/** Implémentation Radix de la fenêtre modale, chargée à la première ouverture. */
export default function DialogueRadix({ onFermer, titre, description, children, pied, taille = 'md', titreMasque, className }: PropsDialogueRadix) {
  const { t } = useTranslation()
  return (
    <Dialog.Root open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-apparition fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] w-full flex-col bg-surface shadow-lg outline-none',
            // Mobile : feuille du bas.
            'inset-x-0 bottom-0 rounded-t-xl border-t border-bordure pb-sure anim-glisser-haut',
            // Bureau : centrée.
            'md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:anim-apparition',
            TAILLES[taille],
            className,
          )}
        >
          <div className="flex items-start gap-3 px-4 pt-3 pb-2 md:px-5 md:pt-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className={cn('text-lg font-semibold text-texte', titreMasque && 'sr-only')}>{titre}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-texte-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{titre}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <BoutonIcone libelle={t('commun.fermer')} icone={<X />} taille="sm" sansInfobulle className="-mt-1 -mr-2" />
            </Dialog.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">{children}</div>}
          {pied && <div className="flex flex-wrap justify-end gap-2 border-t border-bordure px-4 py-3 md:px-5">{pied}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
