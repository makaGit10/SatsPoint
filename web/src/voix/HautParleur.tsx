import { Volume2 } from 'lucide-react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LangueAudio } from '@/api/types'
import { localeCourante } from '@/i18n'
import { cn } from '@/lib/cn'
import { lire, lireTexte, syntheseDisponible } from './lecteur'
import { useVoix } from './store'
import { useUrlAudio } from './useManifesteAudio'

export interface PropsHautParleur {
  /** Clé vocale = clé de traduction (ex. `caisse.encaisser`). */
  cle: string
  /** Langue imposée (sélecteur de langue) ; sinon la langue choisie par la personne. */
  langue?: LangueAudio
  /** Rendu en coin de bouton : non focalisable au clavier (le bouton parent l'est déjà). */
  dansBouton?: boolean
  /** Avec `dansBouton` : position du coin (classes Tailwind), par défaut en haut à droite, légèrement en débord. */
  coin?: string
  /** Avec `dansBouton` : petit haut-parleur dans le fil du libellé (segments étroits) plutôt qu'en coin. */
  enLigne?: boolean
  /** Taille de l'icône en px (14–16). */
  taille?: 14 | 16
  className?: string
}

/**
 * Petit haut-parleur : lit l'audio de la clé sans déclencher l'élément parent.
 * Source : l'enregistrement publié (langue choisie, puis repli français) ; à défaut, la voix du navigateur lit le
 * texte affiché (aucun bouton muet en attendant les enregistrements). Masqué si l'aide vocale est coupée, ou si
 * ni enregistrement ni voix du navigateur ne sont disponibles.
 */
export function HautParleur({ cle, langue, dansBouton = false, coin = '-top-1.5 -right-1.5', enLigne = false, taille = 14, className }: PropsHautParleur) {
  const { t } = useTranslation()
  const activee = useVoix((s) => s.activee)
  const enLecture = useVoix((s) => s.cleEnLecture === cle)
  const url = useUrlAudio(cle, langue)

  // Manifeste en cours de chargement : rien (ni repli, ni voix du navigateur) pour ne pas jouer la mauvaise langue.
  const texte = url || url === undefined ? '' : t(cle, { defaultValue: '' }).replace(/\{\{[^}]+\}\}/g, '')
  const synthese = url === null && texte !== '' && texte !== cle && syntheseDisponible()

  // Le sélecteur de langue parle toujours (langue imposée) ; ailleurs, on respecte la préférence.
  if ((!url && !synthese) || (!langue && !activee)) return null

  const declencher = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (url) lire(url, cle)
    else lireTexte(texte, localeCourante() === 'en' ? 'en-US' : 'fr-FR', cle)
  }
  const bloquer = (e: PointerEvent | MouseEvent) => {
    e.stopPropagation()
  }
  const auClavier = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') declencher(e)
  }

  return (
    <span
      // Dans un bouton : repère visuel et tactile seulement (le lecteur d'écran lit déjà le nom du bouton) —
      // jamais un « bouton dans un bouton » pour les technologies d'assistance.
      {...(dansBouton
        ? { 'aria-hidden': true as const, 'data-en-lecture': enLecture || undefined }
        : { role: 'button', tabIndex: 0, 'aria-label': t('voix.ecouter'), 'aria-pressed': enLecture })}
      data-haut-parleur={cle}
      onClick={declencher}
      onPointerDown={bloquer}
      onMouseDown={bloquer}
      onKeyDown={dansBouton ? undefined : auClavier}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full select-none',
        // Dans le fil d'un segment, l'icône prend la couleur du libellé (option active ou non).
        dansBouton && enLigne ? 'text-current transition-opacity duration-150 hover:opacity-100' : 'text-texte-2 transition-colors duration-150 hover:text-accent-texte',
        enLecture && 'text-accent-texte',
        // Zone tactile ≥ 32 px autour d'un visuel compact.
        "after:absolute after:top-1/2 after:left-1/2 after:h-8 after:w-8 after:min-h-full after:min-w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
        dansBouton
          ? enLigne
            ? 'relative h-4 w-4 opacity-75'
            : cn('absolute h-5 w-5 border border-bordure bg-surface text-texte-2 shadow-xs', coin)
          : 'relative h-8 w-8',
        className,
      )}
    >
      {enLecture ? <Ondes taille={taille} /> : <Volume2 size={taille} strokeWidth={2} aria-hidden="true" />}
    </span>
  )
}

/** Trois barres animées pendant la lecture. */
function Ondes({ taille }: { taille: number }) {
  const hauteur = taille
  return (
    <span className="flex items-center gap-[2px]" style={{ height: hauteur }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="anim-ondes block w-[3px] rounded-full bg-current"
          style={{ height: hauteur, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  )
}
