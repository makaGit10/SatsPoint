import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { BandeauDemo } from './BandeauDemo'
import { BoutonVoix } from './BoutonVoix'
import { Marque } from './Marque'
import { SelecteurLangue, SelecteurTheme } from './Selecteurs'

/** Mise en page des écrans publics (accueil, connexion, inscription…) : colonne centrée, réglages en haut à droite. */
export function MiseEnPageInvite({
  children,
  large,
  ecran,
  sansMarque,
}: {
  children: ReactNode
  /** Colonne plus large (accueil, choix de langue). */
  large?: boolean
  ecran: string
  sansMarque?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col" data-ecran={ecran}>
      <BandeauDemo />
      <header className="flex h-[var(--hauteur-entete)] shrink-0 items-center justify-between px-5 md:px-8">
        {sansMarque ? (
          <span />
        ) : (
          <Link to="/accueil">
            <Marque taille="sm" />
            <span className="sr-only">{` — ${t('entete.accueil')}`}</span>
          </Link>
        )}
        <div className="flex items-center gap-0.5">
          <BoutonVoix className="mr-1" />
          <SelecteurTheme />
          <SelecteurLangue />
        </div>
      </header>
      <main className={cn('mx-auto flex w-full flex-1 flex-col px-5 pt-4 pb-[calc(32px+var(--reserve-guide))] md:justify-center md:pt-0 md:pb-[calc(64px+var(--reserve-guide))]', large ? 'max-w-xl' : 'max-w-md')}>
        {children}
      </main>
    </div>
  )
}
