import { useTranslation } from 'react-i18next'
import { ErreurApi } from '@/api/client'

/** Traduit une erreur API en message utile (jamais de détail technique à l'écran). */
export function useMessageErreur() {
  const { t } = useTranslation()
  return (erreur: unknown, options: { identifiants?: boolean } = {}): string => {
    if (erreur instanceof ErreurApi) {
      if (erreur.reseau) return t('erreurs.reseau')
      if (erreur.estTropDeTentatives) return t('auth.connexion.tropDeTentatives')
      if (erreur.estValidation) {
        if (options.identifiants) return t('auth.connexion.erreurIdentifiants')
        return erreur.message || t('erreurs.validation')
      }
      if (erreur.estNonAuthentifie) return t('erreurs.sessionExpiree')
    }
    return t('erreurs.inattendue')
  }
}
