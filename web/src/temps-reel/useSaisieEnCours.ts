import { useEffect } from 'react'

/**
 * « Jamais de rechargement pendant une saisie. »
 * Deux sources : un compteur déclaré par les formulaires (`useSaisieEnCours`) et une heuristique
 * sur l'élément actif (champ de texte non vide, ou champ dans un <form>).
 */
const compteur = { valeur: 0 }

const TYPES_SANS_SAISIE = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'image'])

export function saisieEnCours(): boolean {
  if (compteur.valeur > 0) return true
  if (typeof document === 'undefined') return false
  const actif = document.activeElement as HTMLElement | null
  if (!actif || actif === document.body) return false

  if (actif.isContentEditable) return true
  const balise = actif.tagName
  if (balise === 'TEXTAREA') return (actif as HTMLTextAreaElement).value.length > 0 || actif.closest('form') !== null
  if (balise === 'SELECT') return actif.closest('form') !== null
  if (balise === 'INPUT') {
    const champ = actif as HTMLInputElement
    if (TYPES_SANS_SAISIE.has(champ.type)) return false
    return champ.value.length > 0 || champ.closest('form') !== null
  }
  return false
}

/** À appeler dans un formulaire pour bloquer les rechargements tant qu'il est monté (ou tant que `actif`). */
export function useSaisieEnCours(actif = true) {
  useEffect(() => {
    if (!actif) return
    compteur.valeur += 1
    return () => {
      compteur.valeur -= 1
    }
  }, [actif])
}

/** Réinitialisation (tests). */
export function reinitialiserSaisie() {
  compteur.valeur = 0
}
