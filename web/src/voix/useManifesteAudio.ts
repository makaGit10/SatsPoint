import { useQuery } from '@tanstack/react-query'
import { CLE_MANIFESTE, chargerManifeste } from '@/api/audio'
import type { LangueAudio, ManifesteAudio } from '@/api/types'
import { queryClient } from '@/lib/queryClient'
import { useVoix } from './store'

const UNE_HEURE = 60 * 60_000

/**
 * Fraîcheur des audios publiés au studio (« disponibles chez tout le monde ») :
 * - signal temps réel `audios` (canal public `plateforme`) → relecture immédiate dans l'appli connectée ;
 * - sans connexion temps réel (écrans publics, visiteurs) : relu au retour sur l'onglet au-delà de 2 minutes ;
 * - chaque relecture revalide auprès du serveur (ETag, 304 léger), jamais l'ancienne copie du navigateur.
 */
const OPTIONS_MANIFESTE = (langue: LangueAudio) => ({
  queryKey: CLE_MANIFESTE(langue),
  queryFn: () => chargerManifeste(langue),
  staleTime: 2 * 60_000,
  gcTime: 24 * UNE_HEURE,
  refetchOnWindowFocus: true,
  retry: 1,
})

/** Manifeste `clé → URL` d'une langue (relu sur signal `audios` et au retour sur l'onglet). */
export function useManifesteAudio(langue: LangueAudio | null) {
  return useQuery({
    ...OPTIONS_MANIFESTE(langue ?? 'fr'),
    enabled: langue !== null,
  })
}

function urlDans(manifeste: ManifesteAudio | undefined, cle: string): string | null {
  const url = manifeste?.audios?.[cle]
  return typeof url === 'string' && url.length > 0 ? url : null
}

/**
 * URL de l'audio d'une clé : langue demandée, puis repli français, sinon `null`.
 * `undefined` tant que le manifeste de la langue demandée se charge : le repli français n'est jamais joué à la place
 * d'un enregistrement qui arrive (la tuile « Wolof » doit dire « Wolof » en wolof).
 * `langueForcee` sert au sélecteur de langue (chaque tuile parle sa propre langue).
 */
export function useUrlAudio(cle: string, langueForcee?: LangueAudio): string | null | undefined {
  const langueStore = useVoix((s) => s.langueAudio)
  const langue = langueForcee ?? langueStore
  const principal = useManifesteAudio(langue)
  const repli = useManifesteAudio(langue && langue !== 'fr' ? 'fr' : null)
  if (!langue) return null
  const propre = urlDans(principal.data, cle)
  if (propre) return propre
  if (principal.isPending) return undefined
  if (langue === 'fr') return null
  return urlDans(repli.data, cle) ?? (repli.isPending ? undefined : null)
}

/** Version hors React (annonces automatiques). */
export async function obtenirUrlAudio(cle: string, langue: LangueAudio): Promise<string | null> {
  try {
    const manifeste = await queryClient.fetchQuery(OPTIONS_MANIFESTE(langue))
    const url = urlDans(manifeste, cle)
    if (url || langue === 'fr') return url
    const repli = await queryClient.fetchQuery(OPTIONS_MANIFESTE('fr'))
    return urlDans(repli, cle)
  } catch {
    return null
  }
}

/** Force la relecture des manifestes (signal temps réel `audios`). */
export function invaliderManifestes() {
  void queryClient.invalidateQueries({ queryKey: ['audio', 'manifeste'] })
}
