import { Calculator, Zap } from 'lucide-react'
import { PageVide } from './PageVide'

export default function Caisse() {
  return (
    <PageVide
      prefixe="caisse"
      ecran="caisse"
      icone={<Calculator />}
      action="caisse.encaisser"
      iconeAction={<Zap />}
      rubriques={['ventes', 'paiements', 'articles', 'parametres']}
      clesRequetes={[['ventes'], ['paiements'], ['articles'], ['boutique'], ['cours']]}
    />
  )
}
