import { UserPlus, Users } from 'lucide-react'
import { PageVide } from './PageVide'

export default function Equipe() {
  return (
    <PageVide
      prefixe="equipe"
      ecran="equipe"
      icone={<Users />}
      ton="mm"
      action="equipe.inviter"
      iconeAction={<UserPlus />}
      rubriques={['equipe']}
      clesRequetes={[['equipe']]}
    />
  )
}
