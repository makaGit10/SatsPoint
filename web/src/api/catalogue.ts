import { LANGUES_REPLI, PAYS_REPLI, deduirePays } from '@/lib/catalogue'
import { useVoix } from '@/voix/store'
import { useConfig } from './config'
import type { CodePays } from './types'

/** Pays et langues actifs (CONTRAT_API § 14.1), lus dans `GET /config`, avec repli Sénégal avant la réponse ou hors ligne. */
export function useCatalogue() {
  const { data } = useConfig()
  return {
    pays: data?.pays?.length ? data.pays : PAYS_REPLI,
    langues: data?.langues?.length ? data.langues : LANGUES_REPLI,
  }
}

/** Pays de l'appareil : celui choisi, sinon déduit de la langue du navigateur (repli Sénégal). */
export function usePaysCourant(): CodePays {
  const { pays } = useCatalogue()
  const choisi = useVoix((s) => s.pays)
  if (choisi && pays.some((p) => p.code === choisi)) return choisi
  return deduirePays(typeof navigator === 'undefined' ? null : navigator.language, pays)
}
