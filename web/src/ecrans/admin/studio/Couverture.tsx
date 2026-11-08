import { useTranslation } from 'react-i18next'
import type { LangueAudio, MatriceAudio } from '@/api/types'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

/** En-tête de couverture : une tuile par langue (barre publiés + brouillons, essentielles manquantes) ; choisit la langue de travail. */
export function Couverture({ matrice, langue, onChoisir }: { matrice: MatriceAudio; langue: LangueAudio; onChoisir: (l: LangueAudio) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('studio.langueTravail')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0" data-couverture>
      {matrice.langues.map((l) => {
        const c = matrice.couverture[l.code] ?? { publies: 0, brouillons: 0, manquants: 0, total: 0, essentielles_manquantes: 0 }
        const total = c.total || 1
        const actif = l.code === langue
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChoisir(l.code)}
            className={cn(
              'relative min-w-[124px] shrink-0 rounded-lg border bg-surface px-2.5 py-2 text-left shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-bordure-forte md:min-w-0',
              actif ? 'border-accent ring-2 ring-accent/25' : 'border-bordure',
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-texte">{l.nom}</span>
              <span className="text-xs text-texte-2 tabulaire">
                {c.publies}/{c.total}
              </span>
            </span>
            <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
              <span className="bg-succes" style={{ width: `${(c.publies / total) * 100}%` }} />
              <span className="bg-attente" style={{ width: `${(c.brouillons / total) * 100}%` }} />
            </span>
            <span className={cn('mt-1 block truncate text-2xs', c.essentielles_manquantes ? 'text-danger-texte' : 'text-succes-texte')}>
              {c.essentielles_manquantes ? t('studio.essentiellesManquantes', { count: c.essentielles_manquantes }) : t('studio.essentiellesPretes')}
            </span>
            <span className="sr-only">{t('studio.couvertureAria', { publies: c.publies, brouillons: c.brouillons, total: c.total })}</span>
            <HautParleur cle="studio.langueTravail" dansBouton />
          </button>
        )
      })}
    </div>
  )
}
