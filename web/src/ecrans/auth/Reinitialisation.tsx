import { KeyRound, Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { useReinitialisation } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { notifier } from '@/composants/toastStore'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ChampMotDePasse, ErreurFormulaire, TitreAuth } from './communs'
import { useMessageErreur } from './useMessageErreur'

const LONGUEUR_MIN = 12

export default function Reinitialisation() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const reinit = useReinitialisation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()

  const jeton = params.get('jeton') ?? ''
  const [identifiant, setIdentifiant] = useState(params.get('identifiant') ?? '')
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [lienInvalide, setLienInvalide] = useState(!jeton)
  const [erreursChamps, setErreursChamps] = useState<{ identifiant?: string; password?: string; password_confirmation?: string }>({})

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: typeof erreursChamps = {}
    if (!identifiant.trim()) champs.identifiant = t('auth.champRequis')
    if (motDePasse.length < LONGUEUR_MIN) champs.password = t('auth.inscription.motDePasseCourt')
    if (confirmation !== motDePasse) champs.password_confirmation = t('auth.inscription.confirmationErreur')
    setErreursChamps(champs)
    if (Object.keys(champs).length) return

    reinit.mutate(
      { jeton, identifiant: identifiant.trim(), password: motDePasse, password_confirmation: confirmation },
      {
        onSuccess: () => {
          notifier({ type: 'succes', titre: t('auth.reinit.succes'), voix: 'auth.reinit.succes' })
          navigate('/connexion', { replace: true })
        },
        onError: (err) => {
          if (err instanceof ErreurApi && err.estValidation && (err.champ('jeton') || err.champ('identifiant'))) {
            setLienInvalide(true)
            return
          }
          if (err instanceof ErreurApi && err.estValidation && err.champ('password')) {
            setErreursChamps({ password: err.champ('password') })
            return
          }
          setErreur(messageErreur(err))
        },
      },
    )
  }

  return (
    <MiseEnPageInvite ecran="reinitialisation">
      <TitreAuth titre={t('auth.reinit.titre')} sousTitre={t('auth.reinit.sousTitre')} voix="auth.reinit.titre" />
      {lienInvalide && (
        <div role="alert" className="mb-3 rounded-md border border-danger/30 bg-danger-doux px-3 py-2 text-sm text-danger-texte">
          {t('auth.reinit.lienInvalide')}{' '}
          <Link to="/mot-de-passe/oubli" className="font-medium underline">
            {t('auth.oubli.titre')}
          </Link>
        </div>
      )}
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <Champ
          libelle={t('auth.reinit.identifiant')}
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
          libelle={t('auth.reinit.motDePasse')}
          name="password"
          autoComplete="new-password"
          aide={t('auth.inscription.motDePasseAide')}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          erreur={erreursChamps.password}
        />
        <ChampMotDePasse
          libelle={t('auth.reinit.confirmation')}
          name="password_confirmation"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          erreur={erreursChamps.password_confirmation}
        />
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" taille="lg" pleineLargeur chargement={reinit.isPending} disabled={lienInvalide} icone={<KeyRound />} voix="auth.reinit.valider">
          {t('auth.reinit.valider')}
        </Bouton>
      </form>
    </MiseEnPageInvite>
  )
}
