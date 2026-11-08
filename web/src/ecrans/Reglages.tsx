import { Settings } from 'lucide-react'
import { PageVide } from './PageVide'

export default function Reglages() {
  return (
    <PageVide
      prefixe="reglages"
      ecran="reglages"
      icone={<Settings />}
      ton="neutre"
      rubriques={['parametres']}
      clesRequetes={[['boutique']]}
    />
  )
}
