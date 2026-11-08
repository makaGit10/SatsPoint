import { CircleAlert, PlugZap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BoutonLien } from '@/composants/Bouton'
import { HautParleur } from '@/voix/HautParleur'

/**
 * Boutique sans aucun moyen de paiement branché (ni portefeuille, ni PayTech, ni lien Wave) :
 * explication + action principale « Brancher un moyen de paiement » à la place d'« Encaisser ».
 * Chargé à la demande : ce cas ne concerne que les boutiques en cours de configuration.
 */
export function BandeauAucunMoyen({ gestion }: { gestion: boolean }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="mb-3 flex items-start gap-2 rounded-md border border-attente/40 bg-attente-doux px-3 py-2 text-sm text-attente-texte md:mb-0" data-bandeau="aucun-moyen">
      <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{t('caisse.aucunMoyen')}</span> {gestion ? t('caisse.aucunMoyenGestion') : t('caisse.aucunMoyenCaissier')}
      </span>
      <HautParleur cle="caisse.aucunMoyen" />
    </div>
  )
}

export function BoutonBrancherMoyen({ vers }: { vers: string }) {
  const { t } = useTranslation()
  return (
    <BoutonLien to={vers} taille="xl" pleineLargeur icone={<PlugZap />} voix="caisse.brancherMoyen" className="mt-3 h-14 text-lg">
      {t('caisse.brancherMoyen')}
    </BoutonLien>
  )
}
