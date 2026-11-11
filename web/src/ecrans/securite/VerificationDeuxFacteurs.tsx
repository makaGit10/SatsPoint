import { useMutation } from '@tanstack/react-query'
import { KeyRound, LifeBuoy, LogOut, ShieldCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { verifierDeuxFa } from '@/api/deuxFa'
import { deuxFaAActiver, useAuth } from '@/auth/store'
import { appliquerUtilisateur, relireSession, useDeconnexion } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { cheminAccueil } from '@/coquille/navigation'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { ErreurFormulaire, TitreAuth } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { suiteSure } from '@/routes/navigation'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ChampCode } from './ChampCode'
import { CodeLocal } from './CodeLocal'
import { useGuideVocal } from '@/voix/guide'

/** Après connexion, si la double authentification est active : code de l'application (ou code de secours). */
export default function VerificationDeuxFacteurs() {
  const { t } = useTranslation()
  useGuideVocal('guide.verification2fa')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const utilisateur = useAuth((s) => s.utilisateur)
  const deconnexion = useDeconnexion('/connexion')
  const messageErreur = useMessageErreur()
  useSaisieEnCours()
  const [secours, setSecours] = useState(false)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const entree = useRef<HTMLInputElement>(null)
  const suite = suiteSure(params.get('suite'))

  const verification = useMutation({
    mutationFn: (valeur: string) => verifierDeuxFa(valeur),
    onSuccess: async (reponse) => {
      // Le back peut renvoyer l'utilisateur, ou seulement l'état `deux_fa` : on relit `/moi` dans ce cas.
      const u = reponse.utilisateur ?? (await relireSession())
      if (reponse.utilisateur) appliquerUtilisateur(reponse.utilisateur)
      navigate(suite ?? cheminAccueil(u), { replace: true })
    },
    onError: (e) => {
      setCode('')
      if (e instanceof ErreurApi && (e.code === 'CODE_INVALIDE' || e.estValidation)) setErreur(t('deuxFa.codeIncorrect'))
      else if (e instanceof ErreurApi && e.estTropDeTentatives) setErreur(t('deuxFa.tropDEssais'))
      else setErreur(messageErreur(e))
      entree.current?.focus()
    },
  })

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (deuxFaAActiver(utilisateur)) return <Navigate to={`/securite/2fa${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`} replace />
  if (!utilisateur.deux_fa?.active || utilisateur.deux_fa.validee) return <Navigate to={suite ?? cheminAccueil(utilisateur)} replace />

  const soumettre = (e?: FormEvent, valeur = code) => {
    e?.preventDefault()
    setErreur(null)
    const propre = valeur.trim()
    if (secours ? propre.length < 8 : propre.length !== 6) {
      setErreur(t(secours ? 'deuxFa.secoursIncomplet' : 'deuxFa.codeIncomplet'))
      return
    }
    verification.mutate(propre)
  }

  return (
    <MiseEnPageInvite ecran="verification-2fa">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-accent-doux text-accent-texte" aria-hidden="true">
        <ShieldCheck size={24} />
      </span>
      <TitreAuth titre={t('deuxFa.verification.titre')} sousTitre={secours ? t('deuxFa.verification.texteSecours') : t('deuxFa.verification.texte')} voix="deuxFa.verification.titre" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <CodeLocal actif={!secours} onRemplir={(v) => soumettre(undefined, v)} />
        <ChampCode
          ref={entree}
          libelle={secours ? t('deuxFa.codeSecours') : t('deuxFa.code')}
          valeur={code}
          onChange={(v) => {
            setCode(v)
            setErreur(null)
          }}
          onComplet={(v) => soumettre(undefined, v)}
          secours={secours}
          desactive={verification.isPending}
          autoFocus
        />
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" taille="lg" pleineLargeur icone={<KeyRound />} voix="deuxFa.verifier" chargement={verification.isPending}>
          {t('deuxFa.verifier')}
        </Bouton>
      </form>
      <div className="mt-5 flex flex-col items-center gap-1">
        <Bouton
          variante="fantome"
          taille="sm"
          icone={<LifeBuoy />}
          voix={secours ? 'deuxFa.utiliserApplication' : 'deuxFa.utiliserSecours'}
          onClick={() => {
            setSecours((s) => !s)
            setCode('')
            setErreur(null)
            requestAnimationFrame(() => entree.current?.focus())
          }}
        >
          {secours ? t('deuxFa.utiliserApplication') : t('deuxFa.utiliserSecours')}
        </Bouton>
        <Bouton
          variante="fantome"
          taille="sm"
          icone={<LogOut />}
          voix="utilisateur.deconnexion"
          chargement={deconnexion.isPending}
          onClick={() => deconnexion.mutate(undefined, { onSettled: () => navigate('/connexion', { replace: true }) })}
        >
          {t('utilisateur.deconnexion')}
        </Bouton>
      </div>
    </MiseEnPageInvite>
  )
}
