import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/store'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Infobulle } from '@/composants/Infobulle'
import { cn } from '@/lib/cn'
import { CLES_STOCKAGE, ecrireStockage, lireStockage } from '@/lib/stockage'
import { HautParleur } from '@/voix/HautParleur'
import { Marque } from './Marque'
import { cheminAccueil, estActif, navigationPour } from './navigation'

export function BarreLaterale() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const { pathname } = useLocation()
  const [repliee, setRepliee] = useState(() => lireStockage(CLES_STOCKAGE.lateraleRepliee) === '1')
  const elements = navigationPour(utilisateur)

  const basculer = () => {
    setRepliee((r) => {
      ecrireStockage(CLES_STOCKAGE.lateraleRepliee, r ? '0' : '1')
      return !r
    })
  }

  return (
    <aside
      data-repliee={repliee || undefined}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-bordure bg-fond-2 transition-[width] duration-200 ease-sortie md:flex',
        repliee ? 'w-[var(--largeur-laterale-repliee)]' : 'w-[var(--largeur-laterale)]',
      )}
    >
      <div className={cn('flex h-[var(--hauteur-entete)] items-center border-b border-bordure', repliee ? 'justify-center px-2' : 'px-4')}>
        <NavLink to={cheminAccueil(utilisateur)} aria-label={t('entete.accueil')} className="flex min-w-0 items-center">
          <Marque taille="sm" sansTexte={repliee} />
        </NavLink>
      </div>

      <nav aria-label={t('nav.principale')} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {elements.map((e) => {
          const actif = estActif(pathname, e.chemin)
          const Icone = e.icone
          const lien = (
            <NavLink
              key={e.chemin}
              to={e.chemin}
              aria-current={actif ? 'page' : undefined}
              className={cn(
                'group relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150',
                actif ? 'bg-accent-doux text-texte' : 'text-texte-2 hover:bg-surface-2 hover:text-texte',
                repliee && 'justify-center px-0',
              )}
            >
              <Icone size={19} strokeWidth={actif ? 2.2 : 1.9} className={cn('shrink-0', actif && 'text-accent-texte')} aria-hidden="true" />
              {!repliee && <span className="flex-1 truncate">{t(e.cle)}</span>}
              {!repliee && <HautParleur cle={e.cle} className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100" />}
            </NavLink>
          )
          return repliee ? (
            <Infobulle key={e.chemin} contenu={t(e.cle)} cote="right">
              {lien}
            </Infobulle>
          ) : (
            lien
          )
        })}
      </nav>

      <div className={cn('flex border-t border-bordure p-2', repliee ? 'justify-center' : 'justify-end')}>
        <BoutonIcone
          libelle={repliee ? t('nav.deplier') : t('nav.replier')}
          icone={repliee ? <PanelLeftOpen /> : <PanelLeftClose />}
          onClick={basculer}
          coteInfobulle="right"
        />
      </div>
    </aside>
  )
}
