import { useTranslation } from 'react-i18next'
import { Champ } from '@/composants/Champ'

/** Note facultative de la vente : chargée au premier toucher sur « Note » (hors du JavaScript du premier écran). */
export default function NoteVente({ valeur, onChange }: { valeur: string; onChange: (valeur: string) => void }) {
  const { t } = useTranslation()
  return (
    <Champ
      libelle={t('caisse.note')}
      voix="caisse.note"
      mentionOptionnel={t('commun.optionnel')}
      placeholder={t('caisse.notePlaceholder')}
      value={valeur}
      maxLength={120}
      onChange={(e) => onChange(e.target.value)}
      classeConteneur=""
      autoFocus
    />
  )
}
