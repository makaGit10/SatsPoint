import { useTranslation } from 'react-i18next'
import { ErreurApi } from '@/api/client'

/** Codes d'erreur du contrat → message utile (ce qui s'est passé + quoi faire), jamais de code à l'écran. */
const CODES: Record<string, string> = {
  COURS_INDISPONIBLE: 'erreurs.coursIndisponible',
  WALLET_INJOIGNABLE: 'erreurs.walletInjoignable',
  SOLDE_INSUFFISANT: 'portefeuille.soldeInsuffisantSimple',
  BUDGET_DEPASSE: 'portefeuille.budgetDepasse',
  DESTINATION_INVALIDE: 'portefeuille.destinationInvalide',
  PAIEMENT_INCERTAIN: 'portefeuille.paiementIncertain',
  MOT_DE_PASSE_INCORRECT: 'portefeuille.motDePasseIncorrect',
  DERNIER_PROPRIETAIRE: 'equipe.dernierProprietaire',
  DEJA_DANS_EQUIPE: 'equipe.dejaDansEquipe',
  DEJA_MEMBRE: 'invitation.dejaMembre',
  INVITATION_EXPIREE: 'invitation.expiree.texte',
  PAIEMENT_TERMINE: 'erreurs.conflit',
  VENTE_DEJA_PAYEE: 'erreurs.conflit',
  VENTE_ANNULEE: 'erreurs.conflit',
  VENTE_NON_ANNULABLE: 'erreurs.conflit',
  BOUTIQUE_SUSPENDUE: 'erreurs.boutiqueSuspendue',
}

/** Traduit une erreur API en message utile (jamais de détail technique à l'écran). */
export function useMessageErreur() {
  const { t } = useTranslation()
  return (erreur: unknown, options: { identifiants?: boolean } = {}): string => {
    if (erreur instanceof ErreurApi) {
      if (erreur.reseau) return t('erreurs.reseau')
      if (erreur.code && CODES[erreur.code]) return t(CODES[erreur.code]!)
      if (erreur.estTropDeTentatives) return t('auth.connexion.tropDeTentatives')
      if (erreur.estValidation) {
        if (options.identifiants) return t('auth.connexion.erreurIdentifiants')
        return erreur.message || t('erreurs.validation')
      }
      // Connexion refusée : le serveur répond 401 (IDENTIFIANTS_INCORRECTS) — message générique, jamais « session expirée ».
      if (erreur.estNonAuthentifie) return options.identifiants ? t('auth.connexion.erreurIdentifiants') : t('erreurs.sessionExpiree')
      if (erreur.estInterdit) return t('erreurs.accesRefuse')
      if (erreur.statut === 409) return t('erreurs.conflit')
    }
    return t('erreurs.inattendue')
  }
}
