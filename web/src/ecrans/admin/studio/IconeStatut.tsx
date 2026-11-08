import { AlertTriangle, Check, Circle, CircleDot, Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { StatutAudio } from '@/api/types'
import { cn } from '@/lib/cn'

const STYLES: Record<StatutAudio, { icone: typeof Check; classe: string }> = {
  publie: { icone: Check, classe: 'bg-succes-doux text-succes-texte' },
  brouillon: { icone: CircleDot, classe: 'bg-attente-doux text-attente-texte' },
  en_traitement: { icone: Hourglass, classe: 'bg-neutre-doux text-neutre-texte anim-pulsation' },
  erreur: { icone: AlertTriangle, classe: 'bg-danger-doux text-danger-texte' },
  manquant: { icone: Circle, classe: 'border border-dashed border-bordure-forte text-texte-3' },
}

const ORDRE_STATUTS: StatutAudio[] = ['publie', 'brouillon', 'en_traitement', 'erreur', 'manquant']

/** Pastille ronde de statut (✔ publié, ● brouillon, ⏳ en traitement, ⚠ erreur, ○ manquant) : couleur + icône. */
export function IconeStatut({ statut, taille = 'md', className }: { statut: StatutAudio; taille?: 'sm' | 'md'; className?: string }) {
  const { icone: Icone, classe } = STYLES[statut]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', taille === 'md' ? 'size-6 [&>svg]:size-3.5' : 'size-4 [&>svg]:size-2.5', classe, className)}
      aria-hidden="true"
    >
      <Icone strokeWidth={2.5} />
    </span>
  )
}

/** Légende compacte des statuts. */
export function LegendeStatuts({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-texte-3', className)} aria-label={t('studio.legende')}>
      {ORDRE_STATUTS.map((s) => (
        <li key={s} className="inline-flex items-center gap-1">
          <IconeStatut statut={s} taille="sm" />
          {t(`studio.statuts.${s}`)}
        </li>
      ))}
    </ul>
  )
}
