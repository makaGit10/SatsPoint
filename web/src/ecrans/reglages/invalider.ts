import { CLE_BOUTIQUE } from '@/api/boutique'
import { CLE_MOI } from '@/api/moi'
import { queryClient } from '@/lib/queryClient'

/** Après toute modification de la boutique : réglages et session (nom, configuration) sont relus. */
export function invaliderBoutique() {
  void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
  void queryClient.invalidateQueries({ queryKey: CLE_MOI })
}
