import { ChevronRight, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/store'
import { cn } from '@/lib/cn'
import { etapesFaites, NOMBRE_ETAPES_DEMARRAGE } from '@/lib/demarrage'
import { HautParleur } from '@/voix/HautParleur'

/** Indicateur de progression du démarrage, affiché au propriétaire tant que la caisse n'est pas prête. */
export function BandeauDemarrage({ className }: { className?: string }) {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const boutique = utilisateur?.boutique
  if (!boutique || boutique.role !== 'proprietaire') return null
  const c = boutique.configuration
  if (c.wallet && c.paiement_test) return null
  const faites = etapesFaites(c, true)
  const pct = Math.round((faites / NOMBRE_ETAPES_DEMARRAGE) * 100)

  return (
    <Link
      to="/demarrage"
      data-bandeau="demarrage"
      className={cn(
        'flex items-center gap-2.5 rounded-lg border border-accent/40 bg-accent-doux px-3 py-2 text-sm transition-colors hover:border-accent',
        className,
      )}
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-surface text-accent-texte" aria-hidden="true">
        <Rocket size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-texte">{t('demarrage.continuer')}</span>
          <span className="shrink-0 text-xs text-texte-2 tabulaire">{t('demarrage.progression', { faites, total: NOMBRE_ETAPES_DEMARRAGE })}</span>
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={NOMBRE_ETAPES_DEMARRAGE} aria-valuenow={faites}>
          <span className="block h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </span>
      </span>
      <HautParleur cle="demarrage.continuer" />
      <ChevronRight size={16} className="shrink-0 text-texte-3" aria-hidden="true" />
    </Link>
  )
}
