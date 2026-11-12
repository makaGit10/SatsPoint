import { Ellipsis } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/store'
import { Dialogue } from '@/composants/Dialogue'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { estActif, navigationPour, type ElementNavigation } from './navigation'
import { SqueletteTexte } from '@/composants/Squelette'

const PanneauPreferences = lazy(() => import('./Preferences').then((m) => ({ default: m.PanneauPreferences })))

const MAX_BARRE = 4

function OngletBarre({ element, actif }: { element: ElementNavigation; actif: boolean }) {
  const { t } = useTranslation()
  const Icone = element.icone
  return (
    <NavLink
      to={element.chemin}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 text-xs font-semibold transition-colors duration-150',
        actif ? 'bg-accent-doux text-accent-texte' : 'text-texte-3 active:text-texte',
      )}
    >
      <Icone size={22} strokeWidth={actif ? 2.2 : 1.8} aria-hidden="true" />
      <span className="max-w-full truncate">{t(element.cleCourte ?? element.cle)}</span>
      <HautParleur cle={element.cleCourte ?? element.cle} dansBouton coin="top-0.5 right-1" />
    </NavLink>
  )
}

/** Barre de navigation du bas (mobile) : 4 rubriques + « Plus ». */
export function BarreBas() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [plusOuvert, setPlusOuvert] = useState(false)

  const elements = navigationPour(utilisateur)
  const dansBarre = elements.filter((e) => e.barreBas).slice(0, MAX_BARRE)
  const dansPlus = elements.filter((e) => !dansBarre.includes(e))
  const plusActif = dansPlus.some((e) => estActif(pathname, e.chemin))

  if (dansBarre.length === 0) return null

  return (
    <>
      <nav
        aria-label={t('nav.principale')}
        className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(var(--hauteur-barre-bas)+env(safe-area-inset-bottom,0px))] items-stretch gap-1 barre-verre border-t px-2 pt-1.5 pb-sure md:hidden"
      >
        {dansBarre.map((e) => (
          <OngletBarre key={e.chemin} element={e} actif={estActif(pathname, e.chemin)} />
        ))}
        <button
          type="button"
          onClick={() => setPlusOuvert(true)}
          aria-haspopup="dialog"
          aria-expanded={plusOuvert}
          className={cn(
            'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 text-xs font-semibold transition-colors duration-150',
            plusActif ? 'bg-accent-doux text-accent-texte' : 'text-texte-3 active:text-texte',
          )}
        >
          <Ellipsis size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('nav.plus')}</span>
          <HautParleur cle="nav.plus" dansBouton coin="top-0.5 right-1" />
        </button>
      </nav>

      <Dialogue ouvert={plusOuvert} onOuvertChange={setPlusOuvert} titre={t('nav.plus')} voix="nav.plus" taille="sm">
        {dansPlus.length > 0 && (
          <ul className="mb-5 grid grid-cols-2 gap-2" aria-label={t('nav.menuPlus')}>
            {dansPlus.map((e) => {
              const Icone = e.icone
              const actif = estActif(pathname, e.chemin)
              return (
                <li key={e.chemin} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setPlusOuvert(false)
                      navigate(e.chemin)
                    }}
                    aria-current={actif ? 'page' : undefined}
                    className={cn(
                      'flex h-16 w-full items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold transition-colors',
                      actif ? 'border-accent bg-accent-doux text-texte' : 'border-bordure bg-surface-2 text-texte-2 hover:bg-accent-doux',
                    )}
                  >
                    <Icone size={20} className={cn(actif && 'text-accent-texte')} aria-hidden="true" />
                    <span className="flex-1 truncate">{t(e.cle)}</span>
                  </button>
                  <span className="absolute top-1/2 right-1 -translate-y-1/2">
                    <HautParleur cle={e.cle} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <Suspense fallback={<SqueletteTexte lignes={4} className="pb-2" />}>
          <PanneauPreferences className="pb-2" />
        </Suspense>
      </Dialogue>
    </>
  )
}
