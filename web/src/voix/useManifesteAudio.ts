import { useQuery } from '@tanstack/react-query'
import { CLE_MANIFESTE, chargerManifeste } from '@/api/audio'
import type { LangueAudio, ManifesteAudio } from '@/api/types'
import { queryClient } from '@/lib/queryClient'
import { useVoix } from './store'

const UNE_HEURE = 60 * 60_000

const OPTIONS_MANIFESTE = (langue: LangueAudio) => ({
  queryKey: CLE_MANIFESTE(langue),
  queryFn: () => chargerManifeste(langue),
  staleTime: UNE_HEURE,
  gcTime: 24 * UNE_HEURE,
  retry: 1,
})

/** Manifeste `clé → URL` d'une langue, mis en cache longtemps (relu sur signal `audios`). */
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
 * URL de l'audio d'une clé : langue demandée, puis repli français, sinon `null` (haut-parleur masqué).
 * `langueForcee` sert au sélecteur de langue (chaque tuile parle sa propre langue).
 */
export function useUrlAudio(cle: string, langueForcee?: LangueAudio): string | null {
  const langueStore = useVoix((s) => s.langueAudio)
  const langue = langueForcee ?? langueStore
  const principal = useManifesteAudio(langue)
  const repli = useManifesteAudio(langue && langue !== 'fr' ? 'fr' : null)
  if (!langue) return null
  return urlDans(principal.data, cle) ?? (langue !== 'fr' ? urlDans(repli.data, cle) : null)
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
