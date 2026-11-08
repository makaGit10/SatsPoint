import { Link2, Wallet } from 'lucide-react'
import { PageVide } from './PageVide'

export default function Portefeuille() {
  return (
    <PageVide
      prefixe="portefeuille"
      ecran="portefeuille"
      icone={<Wallet />}
      action="portefeuille.connecter"
      iconeAction={<Link2 />}
      rubriques={['wallet', 'parametres']}
      clesRequetes={[['wallet'], ['boutique']]}
    />
  )
}
