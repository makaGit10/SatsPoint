import { Search } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { chargerPaquet } from '@/i18n'
import { HautParleur } from '@/voix/HautParleur'

const chargerPanneau = () => Promise.all([import('./recherche/PanneauRecherche'), chargerPaquet('extras')]).then(([m]) => ({ default: m.PanneauRecherche }))
const PanneauRecherche = lazy(chargerPanneau)

/** Mac : ⌘ K ; ailleurs : Ctrl K. */
function raccourci() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘ K' : 'Ctrl K'
}

/**
 * Recherche globale : déclencheur dans l'en-tête (faux champ sur bureau, icône sur mobile) et raccourci Ctrl/⌘ + K.
 * La fenêtre de recherche n'est chargée qu'à la première ouverture (préchargée au survol).
 */
export function RechercheGlobale() {
  const { t } = useTranslation()
  const [ouverte, setOuverte] = useState(false)

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOuverte((o) => !o)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [])

  const precharger = () => void chargerPanneau()

  return (
    <>
      <button
        type="button"
        onClick={() => setOuverte(true)}
        onPointerEnter={precharger}
        onFocus={precharger}
        aria-label={t('entete.rechercheAria')}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        data-recherche-declencheur
        className="relative hidden h-9 w-full max-w-xs items-center gap-2 rounded-md border border-bordure bg-fond-2 px-2.5 text-sm text-texte-3 transition-colors hover:border-bordure-forte hover:text-texte-2 md:flex"
      >
        <Search size={15} aria-hidden="true" />
        <span className="flex-1 text-left">{t('entete.recherche')}</span>
        <kbd className="rounded-xs border border-bordure bg-surface px-1 font-sans text-2xs text-texte-3">{raccourci()}</kbd>
        <HautParleur cle="entete.rechercheAria" dansBouton />
      </button>
      <BoutonIcone libelle={t('entete.rechercheAria')} icone={<Search />} voix="entete.rechercheAria" onClick={() => setOuverte(true)} onPointerEnter={precharger} className="md:hidden" sansInfobulle />
      {ouverte && (
        <Suspense fallback={null}>
          <PanneauRecherche onFermer={() => setOuverte(false)} />
        </Suspense>
      )}
    </>
  )
}
