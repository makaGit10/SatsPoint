import { Phone, Store, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { useInscription } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { notifier } from '@/composants/toastStore'
import { cheminAccueil } from '@/coquille/navigation'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { localeCourante } from '@/i18n'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ChampMotDePasse, ErreurFormulaire, TitreAuth } from './communs'
import { useMessageErreur } from './useMessageErreur'

const LONGUEUR_MIN = 12

type Champs = { nom?: string; identifiant?: string; password?: string; password_confirmation?: string }

export default function Inscription() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inscription = useInscription()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()

  const [nom, setNom] = useState('')
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<Champs>({})

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: Champs = {}
    if (!nom.trim()) champs.nom = t('auth.champRequis')
    if (!identifiant.trim()) champs.identifiant = t('auth.champRequis')
    if (motDePasse.length < LONGUEUR_MIN) champs.password = t('auth.inscription.motDePasseCourt')
    if (confirmation !== motDePasse) champs.password_confirmation = t('auth.inscription.confirmationErreur')
    setErreursChamps(champs)
    if (Object.keys(champs).length) return

    inscription.mutate(
      { nom: nom.trim(), identifiant: identifiant.trim(), password: motDePasse, password_confirmation: confirmation, locale: localeCourante() },
      {
        onSuccess: ({ utilisateur }) => {
          notifier({ type: 'succes', titre: t('auth.inscription.succes'), voix: 'auth.inscription.succes' })
          navigate(cheminAccueil(utilisateur), { replace: true })
        },
        onError: (err) => {
          if (err instanceof ErreurApi && err.estValidation && err.errors) {
            setErreursChamps({
              nom: err.champ('nom'),
              identifiant: err.champ('identifiant'),
              password: err.champ('password'),
              password_confirmation: err.champ('password_confirmation'),
            })
            setErreur(t('erreurs.validation'))
          } else {
            setErreur(messageErreur(err))
          }
        },
      },
    )
  }

  return (
    <MiseEnPageInvite ecran="inscription">
      <TitreAuth titre={t('auth.inscription.titre')} sousTitre={t('auth.inscription.sousTitre')} voix="auth.inscription.titre" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <Champ
          libelle={t('auth.inscription.nom')}
          name="nom"
          autoComplete="name"
          icone={<User />}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          erreur={erreursChamps.nom}
        />
        <Champ
          libelle={t('auth.inscription.identifiant')}
          name="identifiant"
          autoComplete="username"
          inputMode="email"
          icone={<Phone />}
          aide={t('auth.inscription.identifiantAide')}
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          erreur={erreursChamps.identifiant}
          autoCapitalize="none"
          spellCheck={false}
        />
        <ChampMotDePasse
          libelle={t('auth.inscription.motDePasse')}
          name="password"
          autoComplete="new-password"
          aide={t('auth.inscription.motDePasseAide')}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          erreur={erreursChamps.password}
        />
        <ChampMotDePasse
          libelle={t('auth.inscription.confirmation')}
          name="password_confirmation"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          erreur={erreursChamps.password_confirmation}
        />
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" taille="lg" pleineLargeur chargement={inscription.isPending} icone={<Store />} voix="auth.inscription.valider">
          {t('auth.inscription.valider')}
        </Bouton>
      </form>
      <p className="mt-6 text-center text-sm text-texte-2">
        {t('auth.inscription.dejaUnCompte')}{' '}
        <Link to="/connexion" className="font-medium text-accent-texte hover:underline">
          {t('auth.inscription.connexion')}
        </Link>
      </p>
    </MiseEnPageInvite>
  )
}
