import { Package, Plus, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth, peut } from '@/auth/store'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { notifier } from '@/composants/toastStore'
import { PageVide } from './PageVide'

export default function Articles() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const peutGerer = peut(utilisateur, ['proprietaire', 'gerant'])
  return (
    <PageVide
      prefixe="articles"
      ecran="articles"
      icone={<Package />}
      ton="neutre"
      action={peutGerer ? 'articles.ajouter' : undefined}
      iconeAction={<Plus />}
      rubriques={['articles']}
      clesRequetes={[['articles']]}
      actionsEnTete={
        peutGerer && (
          <BoutonIcone
            libelle={t('articles.importer')}
            icone={<Upload />}
            voix="articles.importer"
            variante="secondaire"
            onClick={() => notifier({ type: 'info', titre: t('articles.importer'), description: t('commun.bientot') })}
          />
        )
      }
    />
  )
}
