import { Suspense, lazy, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
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
import { useGuideVocal } from '@/voix/guide'

const PanneauPreferences = lazy(() => import('@/coquille/Preferences').then((m) => ({ default: m.PanneauPreferences })))
// Moyens de paiement du pays (CONTRAT_API § 14.3) : chargés à la demande.
const FormulaireMoyensPays = lazy(() => import('./reglages/FormulaireMoyensPays').then((m) => ({ default: m.FormulaireMoyensPays })))

/** Réglages : boutique (et pays), moyens de paiement, moyens du pays, PayTech (propriétaire), préférences personnelles. */
export default function Reglages() {
  const { t, i18n } = useTranslation()
  useGuideVocal('guide.reglages')
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const proprietaire = peut(utilisateur, ['proprietaire'])
  const { data: boutique, isPending } = useBoutique()

  // Lien direct vers une section (recherche globale : `/reglages#paytech`).
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash || !boutique) return
    const id = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    return () => clearTimeout(id)
  }, [hash, boutique])

  useDonneesEnDirect(['parametres'], () => void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE }))

  return (
    <div className="anim-apparition flex flex-col" data-ecran="reglages">
      <EnTetePage titre={t('reglages.titre')} voix="reglages.titre" />
      {isPending || !boutique ? (
        <SqueletteEcran />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <div className="flex flex-col gap-3">
            <div id="boutique" className="scroll-mt-20">
              <FormulaireBoutique key={`${boutique.nom}|${boutique.telephone ?? ''}|${boutique.ville}|${boutique.pays ?? ''}`} boutique={boutique} proprietaire={proprietaire} />
            </div>
            <div id="paytech" className="scroll-mt-20">
              <FormulairePaytech key={`${boutique.paytech.configure}|${boutique.paytech.environnement}`} boutique={boutique} proprietaire={proprietaire} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div id="paiements" className="scroll-mt-20">
              <FormulairePaiements key={`${JSON.stringify(boutique.reglages)}|${boutique.paytech.configure}`} boutique={boutique} />
            </div>
            <div id="moyens-pays" className="scroll-mt-20">
              <Suspense fallback={null}>
                <FormulaireMoyensPays />
              </Suspense>
            </div>
            <Carte rembourrage="sm" id="preferences" className="scroll-mt-20">
              <CarteEnTete titre={t('reglages.preferences')} className="mb-2" />
              <Suspense fallback={<SqueletteTexte lignes={4} />}>
                <PanneauPreferences pays={boutique.pays} />
              </Suspense>
            </Carte>
          </div>
        </div>
      )}
    </div>
  )
}
