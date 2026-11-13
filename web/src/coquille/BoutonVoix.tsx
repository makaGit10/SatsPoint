import { Volume2, VolumeX } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalogue } from '@/api/catalogue'
import { chargerPaquet, localeCourante } from '@/i18n'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { useVoix } from '@/voix/store'

// La feuille et ses textes ne sont chargés qu'à la première ouverture (rien dans le JavaScript de la caisse).
const FeuilleVoix = lazy(() => Promise.all([import('./FeuilleVoix'), chargerPaquet('guide')]).then(([m]) => m))

/**
 * Contrôle vocal toujours visible (en-têtes connecté et invité, page de présentation, reçu) : « 🔊 WO ».
 * Haut-parleur barré quand la voix est coupée ; un toucher ouvre la feuille « Aide vocale ».
 */
export function BoutonVoix({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  void i18n.language
  const [ouvert, setOuvert] = useState(false)
  const activee = useVoix((s) => s.activee)
  const langueAudio = useVoix((s) => s.langueAudio)
  const { langues } = useCatalogue()
  const code = activee && langueAudio ? langueAudio : localeCourante()
  const nom = langues.find((l) => l.code === code)?.nom_local ?? t(`langue.${code === 'en' ? 'en' : 'fr'}`)
  // Le nom accessible commence par le code affiché (« WO — Aide vocale (Wolof) », WCAG 2.5.3).
  const libelle = `${code.toUpperCase()} — ${t('voix.ouvrirAide', { langue: nom })}${activee ? '' : ` — ${t('voix.coupee')}`}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={libelle}
        title={libelle}
        data-bouton-voix={activee ? 'active' : 'coupee'}
        className={cn(
          'zone-tactile relative inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-bold tracking-wide uppercase transition-colors duration-150',
          activee ? 'border-accent/45 bg-accent-doux text-accent-texte' : 'border-bordure bg-surface-2 text-texte-2 hover:text-texte',
          className,
        )}
      >
        {activee ? <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" /> : <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />}
        <span className="max-w-[4.5rem] truncate">{code}</span>
        <HautParleur cle="voix.feuille.titre" dansBouton />
      </button>
      {ouvert && (
        <Suspense fallback={null}>
          <FeuilleVoix onFermer={() => setOuvert(false)} />
        </Suspense>
      )}
    </>
  )
}
