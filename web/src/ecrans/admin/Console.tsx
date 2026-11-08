import { Activity, ScrollText, ShieldCheck, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Carte } from '@/composants/Carte'
import { PageVide } from '@/ecrans/PageVide'

const RUBRIQUES = [
  { cle: 'admin.boutiques', icone: Store },
  { cle: 'admin.sante', icone: Activity },
  { cle: 'admin.journal', icone: ScrollText },
] as const

export default function Console() {
  const { t } = useTranslation()
  return (
    <PageVide prefixe="admin" ecran="admin" icone={<ShieldCheck />} ton="neutre" rubriques={['boutiques', 'sante']} clesRequetes={[['admin']]}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {RUBRIQUES.map(({ cle, icone: Icone }) => (
          <Carte key={cle} rembourrage="sm" className="flex flex-col items-center gap-1 text-center">
            <Icone size={18} className="text-texte-3" aria-hidden="true" />
            <span className="text-xs font-medium text-texte-2">{t(cle)}</span>
            <span className="text-lg font-semibold text-texte-3 tabulaire">—</span>
          </Carte>
        ))}
      </div>
    </PageVide>
  )
}
