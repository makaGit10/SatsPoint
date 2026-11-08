import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/config'

/** « Mode démo : paiements simulés » — affiché en permanence quand le serveur est en mode simulé. */
export function BandeauDemo() {
  const { t } = useTranslation()
  const { data } = useConfig()
  if (!data?.app.demo) return null
  return (
    <div
      role="status"
      data-bandeau="demo"
      className="flex h-7 shrink-0 items-center justify-center gap-1.5 bg-attente-doux px-3 text-xs font-medium text-attente-texte"
    >
      <FlaskConical size={13} aria-hidden="true" />
      {t('demo.bandeau')}
    </div>
  )
}
