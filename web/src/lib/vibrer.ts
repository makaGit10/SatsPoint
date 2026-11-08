/** Retour haptique facultatif (pavé de la caisse, succès). Jamais bloquant. */
export function vibrer(motif: number | number[] = 12) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(motif)
  } catch {
    /* indisponible */
  }
}
