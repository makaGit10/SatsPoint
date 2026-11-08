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
      className="flex h-7 shrink-0 items-center justify-center gap-1.5 border-b border-bordure bg-surface-2 px-3 text-xs font-medium text-texte-2"
    >
      <FlaskConical size={13} className="text-accent-texte" aria-hidden="true" />
      {t('demo.bandeau')}
    </div>
  )
}
