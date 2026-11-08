import { Mic } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'

export default function StudioAudio() {
  const { t } = useTranslation()
  useDonneesEnDirect(['audio', 'audios'], () => void queryClient.invalidateQueries({ queryKey: ['admin', 'audio'] }))
  return (
    <div className="anim-apparition flex flex-col" data-ecran="studio-audio">
      <EnTetePage titre={t('admin.studio.titre')} sousTitre={t('admin.studio.sousTitre')} voix="admin.studio.titre" />
      <EtatVide icone={<Mic />} ton="mm" titre={t('admin.studio.vide.titre')} texte={t('admin.studio.vide.texte')} />
    </div>
  )
}
