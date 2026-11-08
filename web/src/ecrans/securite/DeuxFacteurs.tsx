import { useMutation } from '@tanstack/react-query'
import { Check, Copy, Download, KeyRound, ShieldAlert, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ErreurApi } from '@/api/client'
import { activerDeuxFa, desactiverDeuxFa, initialiserDeuxFa } from '@/api/deuxFa'
import { useAuth } from '@/auth/store'
import { appliquerUtilisateur, relireSession } from '@/auth/useMoi'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Carte } from '@/composants/Carte'
import { EnTetePage } from '@/composants/EnTetePage'
import { QrCode } from '@/composants/QrCode'
import { Squelette } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { cheminAccueil } from '@/coquille/navigation'
import { ChampMotDePasse, ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { copier } from '@/lib/retours'
import { suiteSure } from '@/routes/navigation'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ChampCode } from './ChampCode'

/** Secret en groupes de 4 (plus facile à recopier). */
function grouper(secret: string) {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

/** Sécurité du compte : activer (QR + code + codes de secours affichés une seule fois) ou désactiver la double authentification. */
export default function DeuxFacteurs() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const etat = utilisateur?.deux_fa
  const [codes, setCodes] = useState<string[] | null>(null)

  return (
    <div className="anim-apparition mx-auto flex w-full max-w-xl flex-col" data-ecran="securite-2fa" data-etape={codes ? 'codes' : etat?.active ? 'active' : 'activation'}>
      <EnTetePage titre={t('deuxFa.titre')} sousTitre={t('deuxFa.sousTitre')} voix="deuxFa.titre" />
      {codes ? <CodesSecours codes={codes} /> : etat?.active ? <Desactivation requise={etat.requise} /> : <Activation requise={Boolean(etat?.requise)} onActive={setCodes} />}
    </div>
  )
}

function Activation({ requise, onActive }: { requise: boolean; onActive: (codes: string[]) => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const entree = useRef<HTMLInputElement>(null)

  const initialisation = useMutation({ mutationFn: initialiserDeuxFa })
  const { mutate: initialiser } = initialisation
  useEffect(() => {
    initialiser()
  }, [initialiser])
  const donnees = initialisation.data

  const activation = useMutation({
    mutationFn: (valeur: string) => activerDeuxFa(valeur),
    onSuccess: async (reponse) => {
      if (reponse.utilisateur) appliquerUtilisateur(reponse.utilisateur)
      onActive(reponse.codes_secours)
      // La session est validée par l'activation : on relit `/moi` (sans quitter l'écran des codes).
      if (!reponse.utilisateur) void relireSession()
      notifier({ type: 'succes', titre: t('deuxFa.activee'), voix: 'deuxFa.activee' })
    },
    onError: (e) => {
      setCode('')
      setErreur(e instanceof ErreurApi && (e.code === 'CODE_INVALIDE' || e.estValidation) ? t('deuxFa.codeIncorrect') : messageErreur(e))
      entree.current?.focus()
    },
  })

  const soumettre = (e?: FormEvent, valeur = code) => {
    e?.preventDefault()
    setErreur(null)
    if (valeur.length !== 6) return setErreur(t('deuxFa.codeIncomplet'))
    activation.mutate(valeur)
  }

  const copierSecret = async () => {
    if (donnees && (await copier(donnees.secret))) {
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {requise && (
        <p className="flex items-start gap-2 rounded-md border border-attente/40 bg-attente-doux px-3 py-2 text-sm text-attente-texte" role="status">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('deuxFa.obligatoire')}
        </p>
      )}
      <Carte rembourrage="md" className="flex flex-col gap-4">
        <ol className="flex flex-col gap-4">
          <li className="flex gap-3">
            <Numero n={1} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-texte">{t('deuxFa.etape1.titre')}</p>
              <p className="text-sm text-texte-2">{t('deuxFa.etape1.texte')}</p>
            </div>
          </li>
          <li className="flex gap-3">
            <Numero n={2} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-texte">{t('deuxFa.etape2.titre')}</p>
              <p className="text-sm text-texte-2">{t('deuxFa.etape2.texte')}</p>
              <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {donnees ? (
                  <QrCode valeur={donnees.otpauth_url} libelle={t('deuxFa.qrAria')} taille={168} className="shrink-0 border border-bordure" />
                ) : (
                  <Squelette className="size-[168px] shrink-0 rounded-lg" data-chargement="2fa" />
                )}
                <div className="flex w-full min-w-0 flex-col gap-1">
                  <span className="text-xs text-texte-3">{t('deuxFa.secretAide')}</span>
                  <div className="flex items-center gap-1 rounded-md border border-bordure bg-fond-2 py-1 pr-1 pl-2.5">
                    <code className="min-w-0 flex-1 font-mono text-sm break-all text-texte" data-secret>
                      {donnees ? grouper(donnees.secret) : '•••• •••• •••• ••••'}
                    </code>
                    <BoutonIcone libelle={copie ? t('commun.copie') : t('deuxFa.copierSecret')} icone={copie ? <Check /> : <Copy />} voix="deuxFa.copierSecret" taille="sm" disabled={!donnees} onClick={() => void copierSecret()} />
                  </div>
                  {initialisation.isError && (
                    <Bouton variante="secondaire" taille="sm" voix="commun.reessayer" onClick={() => initialiser()} className="mt-1 self-start">
                      {t('commun.reessayer')}
                    </Bouton>
                  )}
                </div>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Numero n={3} />
            <form onSubmit={soumettre} noValidate className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm font-semibold text-texte">{t('deuxFa.etape3.titre')}</p>
              <ChampCode
                ref={entree}
                libelle={t('deuxFa.code')}
                valeur={code}
                onChange={(v) => {
                  setCode(v)
                  setErreur(null)
                }}
                onComplet={(v) => soumettre(undefined, v)}
                desactive={!donnees || activation.isPending}
              />
              <ErreurFormulaire message={erreur} />
              <Bouton type="submit" icone={<ShieldCheck />} voix="deuxFa.activer" chargement={activation.isPending} disabled={!donnees}>
                {t('deuxFa.activer')}
              </Bouton>
            </form>
          </li>
        </ol>
      </Carte>
    </div>
  )
}

function Numero({ n }: { n: number }) {
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-doux text-xs font-semibold text-accent-texte" aria-hidden="true">
      {n}
    </span>
  )
}

/** Codes de secours : affichés une seule fois, à copier ou télécharger avant de continuer. */
function CodesSecours({ codes }: { codes: string[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const utilisateur = useAuth((s) => s.utilisateur)
  const [range, setRange] = useState(false)
  const texte = `${t('deuxFa.codes.fichierTitre')}\n\n${codes.join('\n')}\n`

  const telecharger = () => {
    const url = URL.createObjectURL(new Blob([texte], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'satspoint-codes-de-secours.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setRange(true)
  }

  return (
    <Carte rembourrage="md" className="flex flex-col gap-3" data-codes-secours>
      <div className="flex items-start gap-2.5">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-succes-doux text-succes-texte" aria-hidden="true">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-texte">{t('deuxFa.codes.titre')}</h2>
          <p className="text-sm text-texte-2">{t('deuxFa.codes.texte')}</p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-bordure bg-fond-2 p-3 sm:grid-cols-4" aria-label={t('deuxFa.codes.titre')}>
        {codes.map((c) => (
          <li key={c} className="text-center font-mono text-sm font-medium text-texte tabulaire">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Bouton
          variante="secondaire"
          taille="sm"
          icone={<Copy />}
          voix="deuxFa.codes.copier"
          onClick={() =>
            void copier(codes.join('\n')).then((ok) => {
              if (ok) {
                setRange(true)
                notifier({ type: 'succes', titre: t('commun.copie') })
              }
            })
          }
        >
          {t('deuxFa.codes.copier')}
        </Bouton>
        <Bouton variante="secondaire" taille="sm" icone={<Download />} voix="deuxFa.codes.telecharger" onClick={telecharger}>
          {t('deuxFa.codes.telecharger')}
        </Bouton>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-texte-2">
        <input type="checkbox" checked={range} onChange={(e) => setRange(e.target.checked)} className="size-4 rounded-xs accent-[var(--accent)]" />
        {t('deuxFa.codes.confirmation')}
      </label>
      <Bouton icone={<Check />} voix="deuxFa.codes.terminer" disabled={!range} onClick={() => navigate(suiteSure(params.get('suite')) ?? cheminAccueil(utilisateur), { replace: true })}>
        {t('deuxFa.codes.terminer')}
      </Bouton>
    </Carte>
  )
}

function Desactivation({ requise }: { requise: boolean }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()
  const [ouvert, setOuvert] = useState(false)
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const desactivation = useMutation({
    mutationFn: () => desactiverDeuxFa(motDePasse),
    onSuccess: () => {
      setMotDePasse('')
      setOuvert(false)
      void relireSession()
      notifier({ type: 'info', titre: t('deuxFa.desactivee'), voix: 'deuxFa.desactivee' })
    },
    onError: (e) => setErreur(e instanceof ErreurApi && e.champ('password') ? t('deuxFa.motDePasseIncorrect') : messageErreur(e)),
  })

  return (
    <div className="flex flex-col gap-3">
      <Carte rembourrage="md" className="flex items-start gap-3" data-deux-fa="active">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-succes-doux text-succes-texte" aria-hidden="true">
          <Smartphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-texte">{t('deuxFa.activeTitre')}</p>
          <p className="text-sm text-texte-2">{t('deuxFa.activeTexte')}</p>
          {requise && <p className="mt-1 text-xs text-texte-3">{t('deuxFa.requiseNote')}</p>}
        </div>
      </Carte>
      <Carte rembourrage="md">
        {ouvert ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setErreur(null)
              if (!motDePasse) return setErreur(t('auth.champRequis'))
              desactivation.mutate()
            }}
            noValidate
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-texte-2">{requise ? t('deuxFa.desactiverRequise') : t('deuxFa.desactiverTexte')}</p>
            <ChampMotDePasse libelle={t('deuxFa.motDePasse')} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoFocus />
            <ErreurFormulaire message={erreur} />
            <div className="flex justify-end gap-2">
              <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setOuvert(false)}>
                {t('commun.annuler')}
              </Bouton>
              <Bouton type="submit" variante="danger" icone={<ShieldOff />} voix="deuxFa.desactiver" chargement={desactivation.isPending}>
                {t('deuxFa.desactiver')}
              </Bouton>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-texte-2">
              <KeyRound size={16} className="text-texte-3" aria-hidden="true" />
              {t('deuxFa.changerTelephone')}
            </div>
            <Bouton variante="secondaire" taille="sm" icone={<ShieldOff />} voix="deuxFa.desactiver" onClick={() => setOuvert(true)}>
              {t('deuxFa.desactiver')}
            </Bouton>
          </div>
        )}
      </Carte>
    </div>
  )
}
