import { Scissors } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { localeCourante } from '@/i18n'
import { cn } from '@/lib/cn'

/** « 4,8 s » (une décimale, séparateur de la langue de l'interface). */
function formaterSecondes(ms: number): string {
  return `${new Intl.NumberFormat(localeCourante() === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} s`
}

function Barres({ forme, className, largeur }: { forme: number[]; className: string; largeur: number }) {
  return (
    <div className="flex h-9 items-center gap-[2px]" style={{ width: `${Math.max(12, Math.min(100, largeur))}%` }} aria-hidden="true">
      {forme.map((n, i) => (
        <span key={i} className={cn('min-w-[2px] flex-1 rounded-full', className)} style={{ height: `${Math.max(8, Math.round(n * 100))}%` }} />
      ))}
    </div>
  )
}

/**
 * Sans voix détectée (`apres` vide) : seule la forme d'origine est montrée.
 *
 * Forme d'onde avant (grisée) / après la coupe des blancs (or), à la même échelle de temps : la version coupée est
 * visiblement plus courte. Durées « 4,8 s → 1,9 s ».
 */
export function FormeOnde({ avant, apres, dureeAvantMs, dureeMs }: { avant: number[]; apres: number[]; dureeAvantMs: number; dureeMs: number }) {
  const { t } = useTranslation()
  const ratio = dureeAvantMs > 0 ? (dureeMs / dureeAvantMs) * 100 : 100
  return (
    <figure className="flex w-full max-w-80 flex-col gap-1" data-forme-onde aria-label={t('studio.decoupe.duree', { avant: formaterSecondes(dureeAvantMs), apres: formaterSecondes(dureeMs) })}>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-2xs font-semibold text-texte-3 uppercase">{t('studio.decoupe.avant')}</span>
        <div className="min-w-0 flex-1">
          <Barres forme={avant} largeur={100} className="bg-texte-3/35" />
        </div>
      </div>
      {apres.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-2xs font-semibold text-accent-texte uppercase">{t('studio.decoupe.apres')}</span>
          <div className="min-w-0 flex-1">
            <Barres forme={apres} largeur={ratio} className="bg-accent-trait" />
          </div>
        </div>
      )}
      <figcaption className="flex items-center justify-center gap-1.5 text-xs font-semibold text-texte-2 tabulaire" data-durees>
        <Scissors size={13} aria-hidden="true" className="text-accent-trait" />
        {apres.length > 0 ? `${formaterSecondes(dureeAvantMs)} → ${formaterSecondes(dureeMs)}` : formaterSecondes(dureeAvantMs)}
      </figcaption>
    </figure>
  )
}
