import { useTranslation } from 'react-i18next'
import { localeCourante } from '@/i18n'
import { cn } from '@/lib/cn'
import { formaterFCFA } from '@/lib/format'
import { cheminCourbe, libelleJour, type PointCourbe } from './trace'

export interface PropsCourbe {
  serie: readonly PointCourbe[]
  className?: string
}

const LARGEUR = 320
const HAUTEUR = 96

/** Courbe SVG maison (aucune bibliothèque) : aire douce + ligne accent + points, axe des jours, infobulle native. */
export function Courbe({ serie, className }: PropsCourbe) {
  const { t } = useTranslation()
  const locale = localeCourante()
  const trace = cheminCourbe(serie, LARGEUR, HAUTEUR)
  const vide = trace.maximum === 0
  const peuDePoints = serie.length <= 7
  // Pour 30 jours : une étiquette sur cinq pour rester lisible.
  const pas = serie.length > 10 ? Math.ceil(serie.length / 6) : 1

  if (serie.length <= 1) {
    const seul = serie[0]
    return (
      <div className={cn('flex h-24 items-center justify-center text-sm text-texte-3', className)} role="img" aria-label={t('tableau.courbeAria')}>
        {!seul || vide ? t('tableau.aucuneVentePeriode') : null}
        {seul && !vide && (
          <div className="flex w-full items-end gap-3">
            <div className="h-16 flex-1 rounded-t-md bg-accent/80" aria-hidden="true" />
            <span className="text-sm font-medium text-texte tabulaire">{formaterFCFA(seul.montant_xof)}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR + 18}`} className="h-28 w-full overflow-visible" role="img" aria-label={t('tableau.courbeAria')} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sp-courbe-aire" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="0" x2={LARGEUR} y1={HAUTEUR} y2={HAUTEUR} stroke="var(--bordure)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {!vide && (
          <>
            <path d={trace.aire} fill="url(#sp-courbe-aire)" />
            <path d={trace.ligne} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {trace.points.map(([x, y], i) => {
          const p = serie[i]!
          return (
            <g key={p.jour}>
              {!vide && p.montant_xof > 0 && (
                <circle cx={x} cy={y} r="3" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke">
                  <title>{`${libelleJour(p.jour, locale, false)} · ${formaterFCFA(p.montant_xof)} · ${p.nombre}`}</title>
                </circle>
              )}
              {i % pas === 0 && (
                <text x={x} y={HAUTEUR + 14} textAnchor={i === 0 ? 'start' : i === serie.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--texte-3)" className="tabulaire">
                  {libelleJour(p.jour, locale, peuDePoints)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {vide && <p className="pointer-events-none absolute inset-x-0 top-8 text-center text-sm text-texte-3">{t('tableau.aucuneVentePeriode')}</p>}
    </div>
  )
}
