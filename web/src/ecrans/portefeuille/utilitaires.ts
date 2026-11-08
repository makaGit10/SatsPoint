/** Retire le préfixe `lightning:` (QR des portefeuilles) et les espaces. */
export function nettoyerCodeScanne(brut: string): string {
  return brut.trim().replace(/^lightning:/i, '')
}

/** Estimation des frais Lightning : ≈ 0,3 %, 1 sat minimum (le portefeuille fait foi). */
export function estimerFrais(sats: number): number {
  return Math.max(1, Math.round(sats * 0.003))
}
