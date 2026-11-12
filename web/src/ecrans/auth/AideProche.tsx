import { HandHeart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

/**
 * Encart « Vous ne savez pas écrire ? » (inscription, création de la boutique) : demander à un proche ou à un agent
 * SatsPoint de remplir les cases avec soi ; ensuite tout se fait avec les images et la voix. Icône + haut-parleur :
 * compréhensible sans lire. Chargé à la demande avec le paquet `guide`.
 */
export default function AideProche({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <aside className={cn('flex items-start gap-3 rounded-xl border border-mm/25 bg-mm-doux px-3.5 py-3', className)} data-aide-proche>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-mm-texte" aria-hidden="true">
        <HandHeart size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-semibold text-texte">
          {t('voix.aideProche.titre')}
          <HautParleur cle="guide.aideProche" />
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-texte-2">{t('guide.aideProche')}</p>
      </div>
    </aside>
  )
}
