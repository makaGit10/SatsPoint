import { useTranslation } from 'react-i18next'
import { CLE_ADMIN } from '@/api/admin'
import { ErreurApi } from '@/api/client'
import { CLE_CONFIG } from '@/api/config'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { queryClient } from '@/lib/queryClient'

/** Après une écriture : relecture des listes de la console et du catalogue public (écran de langue, studio). */
export function invaliderCatalogue() {
  void queryClient.invalidateQueries({ queryKey: CLE_ADMIN })
  void queryClient.invalidateQueries({ queryKey: CLE_CONFIG })
}

const CODES: Record<string, string> = {
  LANGUE_PROTEGEE: 'admin.langues.protegee',
  LANGUE_UTILISEE: 'admin.langues.utilisee',
  MOYEN_UTILISE: 'admin.moyens.utilise',
  PAYS_PROTEGE: 'admin.moyens.paysProtege',
}

/** Messages des refus métier du catalogue (CONTRAT_API § 14.2), sinon le message générique. */
export function useMessageCatalogue() {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  return (e: unknown) => {
    const cle = e instanceof ErreurApi && e.code ? CODES[e.code] : undefined
    return cle ? t(cle) : messageErreur(e)
  }
}
