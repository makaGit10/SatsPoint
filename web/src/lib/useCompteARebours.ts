import { useEffect, useState } from 'react'
import { secondesRestantes } from './temps'

/**
 * Compte à rebours jusqu'à une échéance ISO : secondes restantes recalculées à chaque seconde à partir de l'horloge
 * (aucune dérive), `0` une fois dépassée, `null` sans échéance. La valeur est dérivée au rendu ; l'effet ne fait que cadencer.
 */
export function useCompteARebours(expireLe: string | null | undefined): number | null {
  const [, setTic] = useState(0)

  useEffect(() => {
    if (!expireLe || secondesRestantes(expireLe) === 0) return
    const id = setInterval(() => {
      setTic((n) => n + 1)
      if (secondesRestantes(expireLe) === 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [expireLe])

  return secondesRestantes(expireLe)
}
