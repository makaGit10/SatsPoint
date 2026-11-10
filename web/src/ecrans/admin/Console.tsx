import { Activity, Languages, LayoutGrid, ScrollText, Smartphone, Store } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CLE_ADMIN } from '@/api/admin'
import { EnTetePage } from '@/composants/EnTetePage'
import { Onglet, OngletContenu, Onglets, OngletsListe } from '@/composants/Onglets'
import { SqueletteListe } from '@/composants/Squelette'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { BoutiquesAdmin } from './console/Boutiques'
import { JournalAdmin } from './console/Journal'
import { SanteAdmin } from './console/Sante'
import { VueEnsemble } from './console/VueEnsemble'

// Catalogues (CONTRAT_API § 14.2) : chargés à la première ouverture de leur onglet.
const LanguesAdmin = lazy(() => import('./console/LanguesAdmin').then((m) => ({ default: m.LanguesAdmin })))
const MoyensAdmin = lazy(() => import('./console/MoyensAdmin').then((m) => ({ default: m.MoyensAdmin })))

const ONGLETS = ['ensemble', 'boutiques', 'langues', 'moyens', 'sante', 'journal'] as const
type NomOnglet = (typeof ONGLETS)[number]
/** Sous 640 px : libellés courts seuls (l'icône est masquée) ; la barre défile d'elle-même si elle déborde. */
const CLASSE_ONGLET = 'flex-none px-2.5 max-sm:[&>span:first-child]:hidden sm:px-3'

/** Console plateforme (super-admin, cahier § 6.16) : aucune donnée d'argent des boutiques n'y apparaît. */
export default function Console() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const brut = params.get('onglet')
  const onglet: NomOnglet = (ONGLETS as readonly string[]).includes(brut ?? '') ? (brut as NomOnglet) : 'ensemble'
  useDonneesEnDirect(['boutiques', 'audio', 'audios', 'journal', 'catalogues'], () => void queryClient.invalidateQueries({ queryKey: CLE_ADMIN }))

  const changer = (valeur: string) => {
    const suivant = new URLSearchParams(params)
    // Chaque onglet a sa propre liste : la page repart de 1.
    suivant.delete('page')
    if (valeur === 'ensemble') suivant.delete('onglet')
    else suivant.set('onglet', valeur)
    setParams(suivant, { replace: true })
  }

  // Sur mobile la barre d'onglets défile : l'onglet actif reste visible (ex. lien direct vers « Moyens de paiement »).
  const liste = useRef<HTMLDivElement>(null)
  useEffect(() => {
    liste.current?.querySelector(`[data-state="active"][id$="-${onglet}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [onglet])

  const attente = <SqueletteListe lignes={5} />

  return (
    <div className="anim-apparition flex flex-col" data-ecran="admin" data-onglet={onglet}>
      <EnTetePage titre={t('admin.titre')} sousTitre={t('admin.sousTitre')} voix="admin.titre" />
      <Onglets value={onglet} onValueChange={changer}>
        <OngletsListe ref={liste} aria-label={t('admin.titre')} className="max-w-full overflow-x-auto [scrollbar-width:none] md:max-w-full">
          <Onglet value="ensemble" icone={<LayoutGrid />} voix="admin.onglets.ensemble" className={CLASSE_ONGLET}>
            <span className="max-sm:sr-only">{t('admin.onglets.ensemble')}</span>
            <span className="sm:hidden" aria-hidden="true">{t('admin.onglets.ensembleCourt')}</span>
          </Onglet>
          <Onglet value="boutiques" icone={<Store />} voix="admin.onglets.boutiques" className={CLASSE_ONGLET}>
            {t('admin.onglets.boutiques')}
          </Onglet>
          <Onglet value="langues" icone={<Languages />} voix="admin.onglets.langues" className={CLASSE_ONGLET}>
            {t('admin.onglets.langues')}
          </Onglet>
          <Onglet value="moyens" icone={<Smartphone />} voix="admin.onglets.moyens" className={CLASSE_ONGLET}>
            <span className="max-sm:sr-only">{t('admin.onglets.moyens')}</span>
            <span className="sm:hidden" aria-hidden="true">{t('admin.onglets.moyensCourt')}</span>
          </Onglet>
          <Onglet value="sante" icone={<Activity />} voix="admin.onglets.sante" className={CLASSE_ONGLET}>
            {t('admin.onglets.sante')}
          </Onglet>
          <Onglet value="journal" icone={<ScrollText />} voix="admin.onglets.journal" className={CLASSE_ONGLET}>
            {t('admin.onglets.journal')}
          </Onglet>
        </OngletsListe>
        <OngletContenu value="ensemble">
          <VueEnsemble actif={onglet === 'ensemble'} />
        </OngletContenu>
        <OngletContenu value="boutiques">
          <BoutiquesAdmin actif={onglet === 'boutiques'} />
        </OngletContenu>
        <OngletContenu value="langues">
          {onglet === 'langues' && (
            <Suspense fallback={attente}>
              <LanguesAdmin actif />
            </Suspense>
          )}
        </OngletContenu>
        <OngletContenu value="moyens">
          {onglet === 'moyens' && (
            <Suspense fallback={attente}>
              <MoyensAdmin actif />
            </Suspense>
          )}
        </OngletContenu>
        <OngletContenu value="sante">
          <SanteAdmin actif={onglet === 'sante'} />
        </OngletContenu>
        <OngletContenu value="journal">
          <JournalAdmin actif={onglet === 'journal'} />
        </OngletContenu>
      </Onglets>
    </div>
  )
}
