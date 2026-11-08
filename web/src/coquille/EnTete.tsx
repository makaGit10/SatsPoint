import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/store'
import { cheminAccueil } from './navigation'
import { Marque } from './Marque'
import { MenuUtilisateur } from './MenuUtilisateur'
import { RechercheGlobale } from './RechercheGlobale'
import { SelecteurLangue, SelecteurTheme } from './Selecteurs'

export function EnTete() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  return (
    <header className="sticky top-0 z-30 flex h-[var(--hauteur-entete)] shrink-0 items-center gap-2 border-b border-bordure bg-fond/90 px-3 backdrop-blur-sm md:px-5">
      <Link to={cheminAccueil(utilisateur)} aria-label={t('entete.accueil')} className="flex min-w-0 items-center gap-2 md:hidden">
        <Marque taille="sm" sansTexte />
        <span className="truncate text-base font-semibold text-texte">{utilisateur?.boutique?.nom ?? t('app.nom')}</span>
      </Link>
      <div className="flex flex-1 items-center md:max-w-md">
        <RechercheGlobale />
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <div className="hidden items-center gap-0.5 md:flex">
          <SelecteurTheme />
          <SelecteurLangue />
        </div>
        <MenuUtilisateur />
      </div>
    </header>
  )
}
