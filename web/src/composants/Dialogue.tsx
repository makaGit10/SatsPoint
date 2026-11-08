import { lazy, Suspense, type ReactNode } from 'react'

const DialogueRadix = lazy(() => import('./DialogueRadix'))

export interface PropsDialogue {
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
  titre: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Boutons d'action en bas. */
  pied?: ReactNode
  taille?: 'sm' | 'md' | 'lg'
  /** Masque visuellement le titre (reste lu par les lecteurs d'écran). */
  titreMasque?: boolean
  className?: string
}

/**
 * Fenêtre modale : feuille du bas sur mobile, centrée sur bureau.
 * L'implémentation (Radix Dialog) n'est chargée qu'à la première ouverture : rien dans le JavaScript initial.
 */
export function Dialogue({ ouvert, onOuvertChange, ...reste }: PropsDialogue) {
  if (!ouvert) return null
  return (
    <Suspense fallback={null}>
      <DialogueRadix onFermer={() => onOuvertChange(false)} {...reste} />
    </Suspense>
  )
}
