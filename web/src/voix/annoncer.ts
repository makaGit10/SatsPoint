import { lire } from './lecteur'
import { useVoix } from './store'
import { obtenirUrlAudio } from './useManifesteAudio'

/**
 * Annonce automatique (« Paiement reçu », « Facture expirée »…) : lue seulement si l'aide vocale
 * est activée et qu'un audio existe pour la clé (langue choisie, puis français).
 */
export async function annoncer(cle: string): Promise<boolean> {
  const { activee, langueAudio } = useVoix.getState()
  if (!activee || !langueAudio) return false
  const url = await obtenirUrlAudio(cle, langueAudio)
  if (!url) return false
  lire(url, cle)
  return true
}
