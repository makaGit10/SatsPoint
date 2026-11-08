import { Activity, LayoutGrid, ScrollText, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CLE_ADMIN } from '@/api/admin'
import { EnTetePage } from '@/composants/EnTetePage'
import { Onglet, OngletContenu, Onglets, OngletsListe } from '@/composants/Onglets'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { BoutiquesAdmin } from './console/Boutiques'
import { JournalAdmin } from './console/Journal'
import { SanteAdmin } from './console/Sante'
import { VueEnsemble } from './console/VueEnsemble'

const ONGLETS = ['ensemble', 'boutiques', 'sante', 'journal'] as const
type NomOnglet = (typeof ONGLETS)[number]
/** Sous 640 px : libellés seuls (l'icône est masquée) pour que les 4 onglets tiennent sans défilement. */
const CLASSE_ONGLET = 'px-2 max-sm:[&>span:first-child]:hidden sm:px-3'

/** Console plateforme (super-admin, cahier § 6.16) : aucune donnée d'argent des boutiques n'y apparaît. */
export default function Console() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const brut = params.get('onglet')
  const onglet: NomOnglet = (ONGLETS as readonly string[]).includes(brut ?? '') ? (brut as NomOnglet) : 'ensemble'
  useDonneesEnDirect(['boutiques', 'audio', 'audios', 'journal'], () => void queryClient.invalidateQueries({ queryKey: CLE_ADMIN }))

  const changer = (valeur: string) => {
    const suivant = new URLSearchParams(params)
    if (valeur === 'ensemble') suivant.delete('onglet')
    else suivant.set('onglet', valeur)
    setParams(suivant, { replace: true })
  }

  return (
    <div className="anim-apparition flex flex-col" data-ecran="admin" data-onglet={onglet}>
      <EnTetePage titre={t('admin.titre')} sousTitre={t('admin.sousTitre')} voix="admin.titre" />
      <Onglets value={onglet} onValueChange={changer}>
        <OngletsListe aria-label={t('admin.titre')}>
          <Onglet value="ensemble" icone={<LayoutGrid />} voix="admin.onglets.ensemble" className={CLASSE_ONGLET}>
            <span className="max-sm:sr-only">{t('admin.onglets.ensemble')}</span>
            <span className="sm:hidden" aria-hidden="true">{t('admin.onglets.ensembleCourt')}</span>
          </Onglet>
          <Onglet value="boutiques" icone={<Store />} voix="admin.onglets.boutiques" className={CLASSE_ONGLET}>
            {t('admin.onglets.boutiques')}
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
