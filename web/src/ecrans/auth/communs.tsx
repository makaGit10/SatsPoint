import { Eye, EyeOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ, type PropsChamp } from '@/composants/Champ'
import { HautParleur } from '@/voix/HautParleur'

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
          taille="sm"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
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
