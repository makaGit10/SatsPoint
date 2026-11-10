import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { formaterNombre } from '@/lib/format'
import { bornesLignes, pagesCompactes } from '@/lib/pagination'
import { BoutonIcone } from './BoutonIcone'

export interface PropsPagination {
  /** Page courante (1-indexée). */
  page: number
  /** Taille de page (sert au résumé « 31–60 sur 248 »). */
  parPage: number
  /** Nombre total de lignes. Absent : total inconnu (ex. historique du portefeuille) → « Page N » seulement. */
  total?: number
  /** Nombre de pages ; déduit de `total` s'il est absent. */
  pages?: number
  /** Sans total : existe-t-il une page suivante ? */
  suivante?: boolean
  onChange: (page: number) => void
  /** Haut de la liste : ramené sous l'en-tête au changement de page s'il est sorti de l'écran. */
  ancre?: RefObject<HTMLElement | null>
  /** Libellé accessible de la navigation (par défaut « Pages de la liste »). */
  libelle?: string
  /** Page suivante en cours de chargement (données précédentes encore affichées). */
  chargement?: boolean
  className?: string
}

/** Fait revenir le haut de la liste à l'écran (sous l'en-tête collant), sans bouger si elle y est déjà. */
function remonter(ancre: RefObject<HTMLElement | null> | undefined) {
  if (typeof window === 'undefined') return
  const el = ancre?.current
  const entete = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hauteur-entete')) || 64
  const haut = el ? el.getBoundingClientRect().top + window.scrollY - entete - 12 : 0
  if (el && el.getBoundingClientRect().top >= entete) return
  const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: Math.max(0, haut), behavior: doux ? 'smooth' : 'auto' })
}

const CLASSE_NUMERO =
  'zone-tactile relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabulaire transition-colors duration-150 select-none md:h-9 md:min-w-9'

/**
 * Pagination « Lumière » : précédent · numéros compacts avec « … » · suivant, résumé « 31–60 sur 248 ».
 * Au téléphone : précédent · « Page 2 / 9 » · suivant. Rien n'est affiché s'il n'y a qu'une page.
 */
export function Pagination({ page, parPage, total, pages: pagesDonnees, suivante, onChange, ancre, libelle, chargement, className }: PropsPagination) {
  const { t } = useTranslation()
  const totalConnu = total !== undefined
  const pages = pagesDonnees ?? (totalConnu ? Math.max(1, Math.ceil(total / Math.max(1, parPage))) : undefined)
  const aSuivante = pages !== undefined ? page < pages : Boolean(suivante)
  const aPrecedente = page > 1
  if (!aPrecedente && !aSuivante) return null

  const aller = (cible: number) => {
    if (cible === page || cible < 1 || (pages !== undefined && cible > pages)) return
    onChange(cible)
    remonter(ancre)
  }
  const [debut, fin] = totalConnu ? bornesLignes(page, parPage, total) : [0, 0]
  const resume = totalConnu && debut > 0 ? t('pagination.resume', { debut: formaterNombre(debut), fin: formaterNombre(fin), total: formaterNombre(total) }) : null
  const position = pages !== undefined ? t('pagination.pageSur', { page, pages }) : t('pagination.page', { page })

  return (
    <nav aria-label={libelle ?? t('pagination.libelle')} aria-busy={chargement || undefined} className={cn('mt-3 flex items-center justify-between gap-3', className)} data-pagination>
      {/* Résumé (bureau) : rangs affichés et total ; sans total, la position est dans la pilule. */}
      <p className="hidden text-xs text-texte-3 tabulaire sm:block" aria-live="polite">
        {resume}
      </p>

      <div className="verre flex w-full items-center justify-between gap-1 rounded-full p-1 sm:w-auto sm:justify-end">
        <BoutonIcone
          libelle={t('pagination.precedente')}
          icone={<ChevronLeft />}
          voix="pagination.precedente"
          taille="md"
          className="md:h-9 md:w-9"
          disabled={!aPrecedente}
          onClick={() => aller(page - 1)}
        />

        {/* Téléphone : position seule, résumé en petit dessous. */}
        <p className="flex min-w-0 flex-col items-center px-2 text-center leading-tight sm:hidden" aria-live="polite">
          <span className="text-sm font-semibold text-texte tabulaire">{position}</span>
          {resume && <span className="text-2xs text-texte-3 tabulaire">{resume}</span>}
        </p>

        {/* Bureau : numéros compacts. */}
        {pages !== undefined && (
          <ol className="hidden items-center gap-1 sm:flex">
            {pagesCompactes(page, pages).map((p) =>
              typeof p === 'number' ? (
                <li key={p}>
                  <button
                    type="button"
                    aria-label={t('pagination.page', { page: p })}
                    aria-current={p === page ? 'page' : undefined}
                    onClick={() => aller(p)}
                    className={cn(CLASSE_NUMERO, p === page ? 'bg-inverse text-inverse-texte shadow-sm' : 'text-texte-2 hover:bg-accent-doux hover:text-texte')}
                  >
                    {formaterNombre(p)}
                  </button>
                </li>
              ) : (
                <li key={p} aria-hidden="true" className="inline-flex h-9 w-6 items-center justify-center text-sm text-texte-3 select-none">
                  …
                </li>
              ),
            )}
          </ol>
        )}
        {pages === undefined && <span className="hidden px-3 text-sm font-semibold text-texte tabulaire sm:inline">{position}</span>}

        <BoutonIcone
          libelle={t('pagination.suivante')}
          icone={<ChevronRight />}
          voix="pagination.suivante"
          taille="md"
          className="md:h-9 md:w-9"
          disabled={!aSuivante}
          onClick={() => aller(page + 1)}
        />
      </div>
    </nav>
  )
}
