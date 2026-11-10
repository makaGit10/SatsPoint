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
    <header className="sticky top-0 z-30 flex h-[var(--hauteur-entete)] shrink-0 items-center gap-3 barre-verre border-b px-4 md:px-8">
      {/* Nom accessible = texte visible + destination (WCAG 2.5.3 « label dans le nom ») : pas d'aria-label qui le masquerait. */}
      <Link to={cheminAccueil(utilisateur)} className="flex min-w-0 items-center gap-2 md:hidden">
        <Marque taille="sm" sansTexte />
        <span className="truncate text-lg titre-serre text-texte">{utilisateur?.boutique?.nom ?? t('app.nom')}</span>
        <span className="sr-only">{` — ${t('entete.accueil')}`}</span>
      </Link>
      <div className="flex flex-1 items-center md:max-w-md">
        <RechercheGlobale />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <div className="hidden items-center gap-0.5 md:flex">
          <SelecteurTheme />
          <SelecteurLangue />
        </div>
        <MenuUtilisateur />
      </div>
    </header>
  )
}
