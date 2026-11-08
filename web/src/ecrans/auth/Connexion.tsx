import { LogIn, Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { useConnexion } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { cheminAccueil } from '@/coquille/navigation'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { suiteSure } from '@/routes/navigation'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ChampMotDePasse, ErreurFormulaire, TitreAuth } from './communs'
import { useMessageErreur } from './useMessageErreur'

export default function Connexion() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const connexion = useConnexion()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()

  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [seSouvenir, setSeSouvenir] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<{ identifiant?: string; password?: string }>({})

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: typeof erreursChamps = {}
    if (!identifiant.trim()) champs.identifiant = t('auth.champRequis')
    if (!motDePasse) champs.password = t('auth.champRequis')
    setErreursChamps(champs)
    if (Object.keys(champs).length) return

    connexion.mutate(
      { identifiant: identifiant.trim(), password: motDePasse, se_souvenir: seSouvenir },
      {
        onSuccess: ({ utilisateur }) => {
          const suite = suiteSure(params.get('suite'))
          const vers = suite ?? cheminAccueil(utilisateur)
          // Double authentification active : le code d'abord, puis la page demandée.
          if (utilisateur.deux_fa?.active && !utilisateur.deux_fa.validee) navigate(`/verification-2fa?suite=${encodeURIComponent(vers)}`, { replace: true })
          else navigate(vers, { replace: true })
        },
        onError: (err) => {
          setErreur(messageErreur(err, { identifiants: true }))
          if (err instanceof ErreurApi && err.estValidation) setMotDePasse('')
        },
      },
    )
  }

  return (
    <MiseEnPageInvite ecran="connexion">
      <TitreAuth titre={t('auth.connexion.titre')} sousTitre={t('auth.connexion.sousTitre')} voix="auth.connexion.titre" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <Champ
          libelle={t('auth.connexion.identifiant')}
          name="identifiant"
          autoComplete="username"
          inputMode="email"
          icone={<Phone />}
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          erreur={erreursChamps.identifiant}
          autoCapitalize="none"
          spellCheck={false}
        />
        <ChampMotDePasse
          libelle={t('auth.connexion.motDePasse')}
          name="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          erreur={erreursChamps.password}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-texte-2">
            <input
              type="checkbox"
              checked={seSouvenir}
              onChange={(e) => setSeSouvenir(e.target.checked)}
              className="size-4 rounded-xs border-bordure-forte accent-[var(--accent)]"
            />
            {t('auth.connexion.seSouvenir')}
          </label>
          <Link to="/mot-de-passe/oubli" className="shrink-0 text-sm font-medium text-accent-texte hover:underline">
            {t('auth.connexion.oubli')}
          </Link>
        </div>
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" taille="lg" pleineLargeur chargement={connexion.isPending} icone={<LogIn />} voix="auth.connexion.valider">
          {t('auth.connexion.valider')}
        </Bouton>
      </form>
      <p className="mt-6 text-center text-sm text-texte-2">
        {t('auth.connexion.pasDeCompte')}{' '}
        <Link to={suiteSure(params.get('suite')) ? `/inscription?suite=${encodeURIComponent(suiteSure(params.get('suite'))!)}` : '/inscription'} className="font-medium text-accent-texte hover:underline">
          {t('auth.connexion.creer')}
        </Link>
      </p>
    </MiseEnPageInvite>
  )
}
