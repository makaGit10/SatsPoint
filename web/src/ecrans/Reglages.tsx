import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_BOUTIQUE, useBoutique } from '@/api/boutique'
import { peut, useAuth } from '@/auth/store'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { EnTetePage } from '@/composants/EnTetePage'
import { SqueletteTexte } from '@/composants/Squelette'
import { SqueletteEcran } from '@/coquille/SqueletteEcran'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { FormulaireBoutique } from './reglages/FormulaireBoutique'
import { FormulairePaiements } from './reglages/FormulairePaiements'
import { FormulairePaytech } from './reglages/FormulairePaytech'

const PanneauPreferences = lazy(() => import('@/coquille/Preferences').then((m) => ({ default: m.PanneauPreferences })))

/** Réglages : boutique, moyens de paiement, PayTech (propriétaire), préférences personnelles. */
export default function Reglages() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const proprietaire = peut(utilisateur, ['proprietaire'])
  const { data: boutique, isPending } = useBoutique()

  useDonneesEnDirect(['parametres'], () => void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE }))

  return (
    <div className="anim-apparition flex flex-col" data-ecran="reglages">
      <EnTetePage titre={t('reglages.titre')} voix="reglages.titre" />
      {isPending || !boutique ? (
        <SqueletteEcran />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <div className="flex flex-col gap-3">
            <FormulaireBoutique key={`${boutique.nom}|${boutique.telephone ?? ''}|${boutique.ville}`} boutique={boutique} />
            <FormulairePaytech key={`${boutique.paytech.configure}|${boutique.paytech.environnement}`} boutique={boutique} proprietaire={proprietaire} />
          </div>
          <div className="flex flex-col gap-3">
            <FormulairePaiements key={`${JSON.stringify(boutique.reglages)}|${boutique.paytech.configure}`} boutique={boutique} />
            <Carte rembourrage="sm">
              <CarteEnTete titre={t('reglages.preferences')} className="mb-2" />
              <Suspense fallback={<SqueletteTexte lignes={4} />}>
                <PanneauPreferences />
              </Suspense>
            </Carte>
          </div>
        </div>
      )}
    </div>
  )
}
