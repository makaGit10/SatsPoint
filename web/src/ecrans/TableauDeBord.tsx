import { LayoutDashboard } from 'lucide-react'
import { PageVide } from './PageVide'

export default function TableauDeBord() {
  return (
    <PageVide
      prefixe="tableau"
      ecran="tableau-de-bord"
      icone={<LayoutDashboard />}
      ton="succes"
      rubriques={['ventes', 'paiements']}
      clesRequetes={[['tableau-de-bord'], ['ventes']]}
    />
  )
}
