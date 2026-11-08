import { Search, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Dialogue } from '@/composants/Dialogue'

/** Recherche globale : déclencheur dans l'en-tête, raccourci Ctrl/⌘ + K, fenêtre avec champ (résultats à venir). */
export function RechercheGlobale() {
  const { t } = useTranslation()
  const [ouverte, setOuverte] = useState(false)
  const [terme, setTerme] = useState('')

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

  return (
    <>
      {/* Bureau : faux champ ; mobile : icône. */}
      <button
        type="button"
        onClick={() => setOuverte(true)}
        aria-label={t('entete.rechercheAria')}
        className="hidden h-9 w-full max-w-xs items-center gap-2 rounded-md border border-bordure bg-fond-2 px-2.5 text-sm text-texte-3 transition-colors hover:border-bordure-forte hover:text-texte-2 md:flex"
      >
        <Search size={15} aria-hidden="true" />
        <span className="flex-1 text-left">{t('entete.recherche')}</span>
        <kbd className="rounded-xs border border-bordure bg-surface px-1 font-sans text-2xs text-texte-3">Ctrl K</kbd>
      </button>
      <BoutonIcone libelle={t('entete.rechercheAria')} icone={<Search />} onClick={() => setOuverte(true)} className="md:hidden" sansInfobulle />

      <Dialogue ouvert={ouverte} onOuvertChange={setOuverte} titre={t('recherche.titre')} titreMasque taille="lg" className="md:top-[12vh] md:translate-y-0">
        <div className="flex items-center gap-2 rounded-md border border-bordure bg-fond-2 px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <Search size={16} className="shrink-0 text-texte-3" aria-hidden="true" />
          <input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- fenêtre de recherche : le focus direct est attendu
            autoFocus
            type="search"
            value={terme}
            onChange={(e) => setTerme(e.target.value)}
            placeholder={t('recherche.placeholder')}
            aria-label={t('recherche.titre')}
            className="h-11 w-full bg-transparent text-base outline-none md:h-10"
          />
        </div>
        <div className="mt-3 flex flex-col items-center gap-1.5 py-6 text-center text-sm text-texte-3">
          <Sparkles size={18} className="text-accent" aria-hidden="true" />
          <p>{terme ? t('recherche.aucune', { terme }) : t('recherche.aide')}</p>
          <p className="text-xs">{t('recherche.bientot')}</p>
        </div>
      </Dialogue>
    </>
  )
}
