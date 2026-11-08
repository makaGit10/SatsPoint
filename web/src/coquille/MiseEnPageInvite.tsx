import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { BandeauDemo } from './BandeauDemo'
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
    <div className="flex min-h-dvh flex-col bg-fond" data-ecran={ecran}>
      <BandeauDemo />
      <header className="flex h-[var(--hauteur-entete)] shrink-0 items-center justify-between px-4 md:px-6">
        {sansMarque ? (
          <span />
        ) : (
          <Link to="/accueil">
            <Marque taille="sm" />
            <span className="sr-only">{` — ${t('entete.accueil')}`}</span>
          </Link>
        )}
        <div className="flex items-center gap-0.5">
          <SelecteurTheme />
          <SelecteurLangue />
        </div>
      </header>
      <main className={cn('mx-auto flex w-full flex-1 flex-col px-4 pt-2 pb-8 md:justify-center md:pt-0 md:pb-16', large ? 'max-w-2xl' : 'max-w-sm')}>
        {children}
      </main>
    </div>
  )
}
