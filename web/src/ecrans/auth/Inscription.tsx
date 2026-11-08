import { Store, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { useInscription } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { cheminAccueil } from '@/coquille/navigation'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { localeCourante } from '@/i18n'
import { suiteSure } from '@/routes/navigation'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { HautParleur } from '@/voix/HautParleur'
import { ChampIdentifiant } from './ChampIdentifiant'
import { ChampMotDePasse, ErreurFormulaire, JaugeMotDePasse, TitreAuth } from './communs'
import { SAISIE_VIDE, valeurIdentifiant, verifierIdentifiant, type SaisieIdentifiant } from './identifiant'
import { LONGUEUR_MIN_MOT_DE_PASSE } from './motDePasse'
import { useMessageErreur } from './useMessageErreur'

type Champs = { nom?: string; identifiant?: string; password?: string }

/**
 * Inscription en un écran et trois champs (nom, téléphone ou e-mail, mot de passe), pensée pour un commerçant pressé.
 * Pas de confirmation du mot de passe : l'œil permet de le relire ; le contrat API reste inchangé
 * (`password_confirmation` = `password`). Ensuite : démarrage guidé (création de la boutique).
 */
export default function Inscription() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const suite = suiteSure(params.get('suite'))
  const inscription = useInscription()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()

  const [nom, setNom] = useState('')
  const [identifiant, setIdentifiant] = useState<SaisieIdentifiant>(SAISIE_VIDE)
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<Champs>({})

  const effacer = (champ: keyof Champs) => erreursChamps[champ] && setErreursChamps((e) => ({ ...e, [champ]: undefined }))

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: Champs = {}
    if (!nom.trim()) champs.nom = t('auth.inscription.nomRequis')
    const probleme = verifierIdentifiant(identifiant)
    if (probleme) champs.identifiant = probleme === 'vide' ? t('auth.inscription.identifiantRequis') : t(`auth.identifiant.${probleme}`)
    if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) champs.password = t('auth.inscription.motDePasseCourt')
    setErreursChamps(champs)
    if (Object.keys(champs).length) return

    inscription.mutate(
      {
        nom: nom.trim(),
        identifiant: valeurIdentifiant(identifiant),
        password: motDePasse,
        password_confirmation: motDePasse,
        locale: localeCourante(),
      },
      {
        onSuccess: ({ utilisateur }) => {
          navigate(suite ?? cheminAccueil(utilisateur), { replace: true })
        },
        onError: (err) => {
          if (err instanceof ErreurApi && err.estValidation && err.errors) {
            setErreursChamps({
              nom: err.champ('nom'),
              identifiant: err.champ('identifiant'),
              password: err.champ('password') ?? err.champ('password_confirmation'),
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
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3.5">
        <Champ
          libelle={t('auth.inscription.nom')}
          name="nom"
          autoComplete="name"
          autoCapitalize="words"
          icone={<User />}
          value={nom}
          onChange={(e) => {
            setNom(e.target.value)
            effacer('nom')
          }}
          erreur={erreursChamps.nom}
        />
        <ChampIdentifiant
          libelle={t('auth.inscription.identifiant')}
          saisie={identifiant}
          onChange={(s) => {
            setIdentifiant(s)
            effacer('identifiant')
          }}
          aide={t('auth.inscription.identifiantAide')}
          erreur={erreursChamps.identifiant}
        />
        <ChampMotDePasse
          libelle={t('auth.inscription.motDePasse')}
          name="password"
          autoComplete="new-password"
          aide={<JaugeMotDePasse motDePasse={motDePasse} />}
          value={motDePasse}
          onChange={(e) => {
            setMotDePasse(e.target.value)
            effacer('password')
          }}
          erreur={erreursChamps.password}
        />
        <ErreurFormulaire message={erreur} />
        <Bouton
          type="submit"
          taille="xl"
          pleineLargeur
          className="mt-1 md:h-12 md:text-lg"
          chargement={inscription.isPending}
          icone={<Store />}
          voix="auth.inscription.valider"
        >
          {t('auth.inscription.valider')}
        </Bouton>
      </form>
      <p className="mt-5 flex items-center justify-center gap-1 text-sm">
        <Link to={suite ? `/connexion?suite=${encodeURIComponent(suite)}` : '/connexion'} className="font-medium text-accent-texte hover:underline">
          {t('auth.inscription.jaiUnCompte')}
        </Link>
        <HautParleur cle="auth.inscription.jaiUnCompte" taille={14} />
      </p>
    </MiseEnPageInvite>
  )
}
