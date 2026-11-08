import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

export interface PropsInfobulle {
  contenu: ReactNode
  cote?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
  /** Désactive l'infobulle (ex. libellé déjà visible). */
  desactivee?: boolean
}

type Implementation = ComponentType<{ contenu: ReactNode; cote?: PropsInfobulle['cote']; children: ReactNode }>

let implementation: Implementation | null = null
let chargement: Promise<Implementation> | null = null
const abonnes = new Set<(impl: Implementation) => void>()

/** Les infobulles n'existent qu'au pointeur fin (souris) : sur tactile, rien n'est chargé. */
function pointeurFin() {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
}

function chargerImplementation() {
  chargement ??= import('./InfobulleRadix').then((m) => {
    implementation = m.default
    for (const notifier of abonnes) notifier(implementation)
    abonnes.clear()
    return implementation
  })
  return chargement
}

/**
 * Infobulle légère : rend l'enfant tel quel, puis — au repos du navigateur et seulement avec une souris —
 * charge l'implémentation Radix. Le JavaScript initial n'en paie pas le coût.
 */
export function Infobulle({ contenu, cote = 'bottom', children, desactivee }: PropsInfobulle) {
  const [Impl, setImpl] = useState<Implementation | null>(() => implementation)

  useEffect(() => {
    if (Impl || desactivee || !pointeurFin()) return
    let actif = true
    const recevoir = (impl: Implementation) => {
      if (actif) setImpl(() => impl)
    }
    abonnes.add(recevoir)
    const planifier = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 800))
    const id = planifier(() => void chargerImplementation())
    return () => {
      actif = false
      abonnes.delete(recevoir)
      ;(window.cancelIdleCallback ?? window.clearTimeout)(id as number)
    }
  }, [Impl, desactivee])

  if (desactivee || !contenu || !Impl) return <>{children}</>
  return (
    <Impl contenu={contenu} cote={cote}>
      {children}
    </Impl>
  )
}
