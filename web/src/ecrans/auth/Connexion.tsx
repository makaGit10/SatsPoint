import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { useConnexion } from '@/auth/useMoi'
import { identifiantsMemorises, memoriserIdentifiant, oublierIdentifiant } from '@/lib/identifiantsMemorises'
import { Bouton } from '@/composants/Bouton'
import { cheminAccueil } from '@/coquille/navigation'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { suiteSure } from '@/routes/navigation'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ChampIdentifiant } from './ChampIdentifiant'
import { ChampMotDePasse, ErreurFormulaire, TitreAuth } from './communs'
import { SAISIE_VIDE, valeurIdentifiant, type SaisieIdentifiant } from './identifiant'
import { useMessageErreur } from './useMessageErreur'
import { useGuideVocal } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'

export default function Connexion() {
  const { t } = useTranslation()
  useGuideVocal('guide.connexion')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const connexion = useConnexion()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()

  const [identifiant, setIdentifiant] = useState<SaisieIdentifiant>(SAISIE_VIDE)
  const [motDePasse, setMotDePasse] = useState('')
  const [seSouvenir, setSeSouvenir] = useState(true)
  const [memorises, setMemorises] = useState<string[]>(() => identifiantsMemorises())
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<{ identifiant?: string; password?: string }>({})

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: typeof erreursChamps = {}
    if (!valeurIdentifiant(identifiant)) champs.identifiant = t('auth.champRequis')
    if (!motDePasse) champs.password = t('auth.champRequis')
    setErreursChamps(champs)
    if (Object.keys(champs).length) return

    // mutateAsync et non mutate : la garde « invité » quitte cet écran dès que la session est connue, et les
    // rappels passés à mutate() ne s'exécutent plus une fois l'écran démonté (la mémorisation serait perdue).
    const saisie = valeurIdentifiant(identifiant)
    connexion
      .mutateAsync({ identifiant: saisie, password: motDePasse, se_souvenir: seSouvenir })
      .then(({ utilisateur }) => {
        // « Se souvenir de moi » : l'identifiant (jamais le mot de passe) sera proposé la prochaine fois.
        if (seSouvenir) memoriserIdentifiant(saisie)
        else oublierIdentifiant(saisie)
        const suite = suiteSure(params.get('suite'))
        const vers = suite ?? cheminAccueil(utilisateur)
        // Double authentification active : le code d'abord, puis la page demandée.
        if (utilisateur.deux_fa?.active && !utilisateur.deux_fa.validee) navigate(`/verification-2fa?suite=${encodeURIComponent(vers)}`, { replace: true })
        else navigate(vers, { replace: true })
      })
      .catch((err: unknown) => {
        setErreur(messageErreur(err, { identifiants: true }))
        if (err instanceof ErreurApi && err.estValidation) setMotDePasse('')
      })
  }

  return (
    <MiseEnPageInvite ecran="connexion">
      <TitreAuth titre={t('auth.connexion.titre')} sousTitre={t('auth.connexion.sousTitre')} voix="auth.connexion.titre" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3.5">
        <ChampIdentifiant
          libelle={t('auth.connexion.identifiant')} voix="auth.connexion.identifiant"
          saisie={identifiant}
          onChange={setIdentifiant}
          erreur={erreursChamps.identifiant}
          suggestions={memorises}
          onOublier={(v) => {
            oublierIdentifiant(v)
            setMemorises(identifiantsMemorises())
          }}
        />
        <ChampMotDePasse
          libelle={t('auth.connexion.motDePasse')} voix="auth.connexion.motDePasse"
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
              className="size-4 rounded-xs border-bordure-forte accent-[var(--accent-trait)]"
            />
            {t('auth.connexion.seSouvenir')}
          </label>
          <span className="flex shrink-0 items-center gap-0.5">
            <Link to="/mot-de-passe/oubli" className="text-sm font-medium text-accent-texte hover:underline">
              {t('auth.connexion.oubli')}
            </Link>
            <HautParleur cle="auth.connexion.oubli" />
          </span>
        </div>
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" taille="xl" pleineLargeur className="mt-1 md:h-12 md:text-lg" chargement={connexion.isPending} icone={<LogIn />} voix="auth.connexion.valider">
          {t('auth.connexion.valider')}
        </Bouton>
      </form>
      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-texte-2">
        {t('auth.connexion.pasDeCompte')}{' '}
        <Link to={suiteSure(params.get('suite')) ? `/inscription?suite=${encodeURIComponent(suiteSure(params.get('suite'))!)}` : '/inscription'} className="font-medium text-accent-texte hover:underline">
          {t('auth.connexion.creer')}
        </Link>
        <HautParleur cle="auth.connexion.creer" />
      </p>
    </MiseEnPageInvite>
  )
}
