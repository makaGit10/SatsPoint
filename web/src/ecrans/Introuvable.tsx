import { Compass, Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BoutonLien } from '@/composants/Bouton'
import { EtatVide } from '@/composants/EtatVide'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'

export default function Introuvable() {
  const { t } = useTranslation()
  return (
    <MiseEnPageInvite ecran="introuvable">
      <EtatVide
        ton="neutre"
        icone={<Compass />}
        titre={t('introuvable.titre')}
        texte={t('introuvable.texte')}
        action={
          <BoutonLien to="/" icone={<Home />} voix="introuvable.retour">
            {t('introuvable.retour')}
          </BoutonLien>
        }
      />
    </MiseEnPageInvite>
  )
}
