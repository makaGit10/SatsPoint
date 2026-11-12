import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { classesTuile } from '@/lib/couleursArticles'
import { HautParleur } from '@/voix/HautParleur'
import { CATEGORIES_PICTOS, PICTOGRAMMES, type Pictogramme } from './pictogrammes'

/**
 * Galerie de pictogrammes : grandes tuiles colorées rangées par rayon (alimentation, boissons, mode…), chacune avec
 * son nom écrit en petit et un haut-parleur qui le dit dans la langue de la personne (clés `pictos.*` du studio).
 */
export function GaleriePictogrammes({ valeur, onChoisir, className }: { valeur: string | null; onChoisir: (p: Pictogramme) => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col gap-3', className)} data-galerie-pictogrammes>
      {CATEGORIES_PICTOS.map((categorie) => (
        <section key={categorie} aria-labelledby={`pictos-${categorie}`}>
          <h4 id={`pictos-${categorie}`} className="mb-1.5 flex items-center gap-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">
            {t(`articles.categoriesPictos.${categorie}`)}
            <HautParleur cle={`articles.categoriesPictos.${categorie}`} />
          </h4>
          <ul role="radiogroup" aria-labelledby={`pictos-${categorie}`} className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {PICTOGRAMMES.filter((p) => p.categorie === categorie).map((p) => {
              const choisi = valeur === p.id
              const Icone = p.icone
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={choisi}
                    aria-label={t(`pictos.${p.id}`)}
                    data-pictogramme={p.id}
                    onClick={() => onChoisir(p)}
                    className={cn(
                      'relative flex h-[84px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 transition-transform duration-100 active:scale-95',
                      classesTuile(p.couleur),
                      choisi ? 'border-texte' : 'border-transparent',
                    )}
                  >
                    <Icone size={32} strokeWidth={1.75} aria-hidden="true" />
                    <span className="line-clamp-2 w-full text-center text-[10.5px] leading-[1.15] font-semibold">{t(`pictos.${p.id}`)}</span>
                    {choisi && (
                      <span className="absolute top-1 left-1 flex size-4 items-center justify-center rounded-full bg-texte text-surface" aria-hidden="true">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    <HautParleur cle={`pictos.${p.id}`} dansBouton />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
