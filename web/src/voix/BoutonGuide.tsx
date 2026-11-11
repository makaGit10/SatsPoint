import { Volume2 } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Infobulle } from '@/composants/Infobulle'
import { cn } from '@/lib/cn'
import { jouerGuide } from './guide'
import { syntheseDisponible } from './lecteur'
import { useVoix } from './store'
import { useUrlAudio } from './useManifesteAudio'

/**
 * Bouton rond « Réécouter l'aide » (coin bas droit) : relit le guide vocal de l'écran affiché.
 * Chargé à la demande (aide vocale active et écran avec un guide). Grande cible tactile (56 px), au-dessus de la
 * barre du bas sur mobile ; la page réserve sa place (`--reserve-guide`) pour ne jamais masquer une action.
 */
export default function BoutonGuide({ cle }: { cle: string }) {
  const { t } = useTranslation()
  const url = useUrlAudio(cle)
  const enLecture = useVoix((s) => s.cleEnLecture === cle)
  const disponible = Boolean(url) || syntheseDisponible()

  useEffect(() => {
    if (!disponible) return
    const racine = document.documentElement
    racine.dataset.guideVisible = ''
    return () => {
      delete racine.dataset.guideVisible
    }
  }, [disponible])

  if (!disponible) return null
  const libelle = t('voix.reecouterAide')

  return (
    <div className="bouton-guide" data-bouton-guide={cle}>
      <Infobulle contenu={libelle} cote="left">
        <button
          type="button"
          aria-label={libelle}
          aria-pressed={enLecture}
          onClick={() => void jouerGuide(cle)}
          className={cn(
            'relative inline-flex size-14 items-center justify-center rounded-full fond-or text-sur-accent shadow-lg ring-4 ring-fond/70 transition-transform duration-150 active:scale-95',
            enLecture && 'anim-guide',
          )}
        >
          {enLecture ? (
            <span className="flex h-6 items-center gap-[3px]" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="anim-ondes block h-6 w-[4px] rounded-full bg-current" style={{ animationDelay: `${i * 110}ms` }} />
              ))}
            </span>
          ) : (
            <Volume2 size={26} strokeWidth={2.2} aria-hidden="true" />
          )}
          <span className="sr-only" aria-live="polite">
            {enLecture ? t('voix.lectureEnCours') : ''}
          </span>
        </button>
      </Infobulle>
    </div>
  )
}
