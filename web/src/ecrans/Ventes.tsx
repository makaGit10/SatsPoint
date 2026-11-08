import { Download, ListFilter, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { notifier } from '@/composants/toastStore'
import { PageVide } from './PageVide'

export default function Ventes() {
  const { t } = useTranslation()
  const bientot = (cle: string) => notifier({ type: 'info', titre: t(cle), description: t('commun.bientot') })
  return (
    <PageVide
      prefixe="ventes"
      ecran="ventes"
      icone={<Receipt />}
      rubriques={['ventes', 'paiements']}
      clesRequetes={[['ventes'], ['paiements']]}
      actionsEnTete={
        <>
          <BoutonIcone libelle={t('ventes.filtrer')} icone={<ListFilter />} voix="ventes.filtrer" onClick={() => bientot('ventes.filtrer')} />
          <BoutonIcone libelle={t('ventes.exporter')} icone={<Download />} voix="ventes.exporter" variante="secondaire" onClick={() => bientot('ventes.exporter')} />
        </>
      }
    />
  )
}
