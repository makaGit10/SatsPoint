/** Démarrage guidé : boutique, portefeuille, mobile money (facultatif), paiement test. */
export const NOMBRE_ETAPES_DEMARRAGE = 4

/** Nombre d'étapes faites, à partir de la configuration de la boutique. */
export function etapesFaites(configuration: { wallet: boolean; paytech: boolean; paiement_test: boolean } | null | undefined, aBoutique: boolean, waveLien = false): number {
  if (!aBoutique || !configuration) return 0
  return 1 + Number(configuration.wallet) + Number(configuration.paytech || waveLien) + Number(configuration.paiement_test)
}
