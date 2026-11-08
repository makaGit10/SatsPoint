import { Eye, EyeOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ, type PropsChamp } from '@/composants/Champ'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { forceMotDePasse, LONGUEUR_MIN_MOT_DE_PASSE } from './motDePasse'

/** Titre + sous-titre d'un écran d'authentification. */
export function TitreAuth({ titre, sousTitre, voix }: { titre: ReactNode; sousTitre?: ReactNode; voix?: string }) {
  return (
    <div className="mb-5">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-texte">
        {titre}
        {voix && <HautParleur cle={voix} taille={16} />}
      </h1>
      {sousTitre && <p className="mt-1 text-sm text-texte-2">{sousTitre}</p>}
    </div>
  )
}

/** Champ mot de passe avec bouton afficher / masquer. */
export function ChampMotDePasse(props: Omit<PropsChamp, 'type' | 'suffixe'>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <Champ
      {...props}
      type={visible ? 'text' : 'password'}
      autoComplete={props.autoComplete ?? 'current-password'}
      suffixe={
        <BoutonIcone
          libelle={visible ? t('auth.connexion.masquerMotDePasse') : t('auth.connexion.afficherMotDePasse')}
          icone={visible ? <EyeOff /> : <Eye />}
          voix={visible ? 'auth.connexion.masquerMotDePasse' : 'auth.connexion.afficherMotDePasse'}
          taille="sm"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          sansInfobulle
        />
      }
    />
  )
}

/** Message d'erreur global d'un formulaire. */
export function ErreurFormulaire({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger-doux px-3 py-2 text-sm text-danger-texte">
      {message}
    </p>
  )
}

/** Jauge simple sous le mot de passe : trois segments + une phrase claire (annoncée aux lecteurs d'écran). */
export function JaugeMotDePasse({ motDePasse, id }: { motDePasse: string; id?: string }) {
  const { t } = useTranslation()
  const force = forceMotDePasse(motDePasse)
  const couleur = force === 1 ? 'bg-danger' : force === 2 ? 'bg-attente' : 'bg-succes'
  const texte =
    force === 0
      ? t('auth.motDePasse.minimum', { count: LONGUEUR_MIN_MOT_DE_PASSE })
      : force === 1
        ? t('auth.motDePasse.encore', { count: LONGUEUR_MIN_MOT_DE_PASSE - motDePasse.length })
        : force === 2
          ? t('auth.motDePasse.correct')
          : t('auth.motDePasse.solide')
  return (
    <span id={id} className="flex items-center gap-2" data-force={force}>
      <span className="flex w-16 shrink-0 gap-1" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn('h-1 flex-1 rounded-full transition-colors duration-150', n <= force ? couleur : 'bg-surface-3')} />
        ))}
      </span>
      <span className={cn('text-xs', force === 1 ? 'text-danger-texte' : force >= 2 ? 'text-texte-2' : 'text-texte-3')} aria-live="polite">
        {texte}
      </span>
    </span>
  )
}
