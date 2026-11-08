import { useMutation } from '@tanstack/react-query'
import { Calculator, Check, ChevronDown, CreditCard, KeyRound, Link2, Play, SkipForward, Store, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { CLE_BOUTIQUE, creerBoutique, enregistrerPaytech, modifierBoutique, useBoutique } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import { CLE_MOI } from '@/api/moi'
import type { BoutiqueDetail, Utilisateur } from '@/api/types'
import { CLE_VENTES, creerVente } from '@/api/ventes'
import { CLE_WALLET } from '@/api/wallet'
import { useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Segment } from '@/composants/Segment'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { NOMBRE_ETAPES_DEMARRAGE } from '@/lib/demarrage'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { FormulaireConnexionWallet } from './portefeuille/ConnexionWallet'

type Cle = 'boutique' | 'portefeuille' | 'mobileMoney' | 'test'

const ICONES: Record<Cle, LucideIcon> = { boutique: Store, portefeuille: Wallet, mobileMoney: CreditCard, test: Zap }
const ORDRE: Cle[] = ['boutique', 'portefeuille', 'mobileMoney', 'test']

/** Démarrage guidé : quatre étapes dépliables, état lu depuis la boutique ; la première non faite est ouverte. */
export default function Demarrage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const utilisateur = useAuth((s) => s.utilisateur)
  const aBoutique = Boolean(utilisateur?.boutique)
  const { data: boutique } = useBoutique(aBoutique)
  const configuration = boutique?.configuration ?? utilisateur?.boutique?.configuration ?? null
  const [ouverteManuelle, setOuverteManuelle] = useState<Cle | null>(null)

  useDonneesEnDirect(['parametres', 'wallet'], () => {
    void queryClient.invalidateQueries({ queryKey: CLE_MOI })
    void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
    void queryClient.invalidateQueries({ queryKey: CLE_WALLET })
  })

  const faits: Record<Cle, boolean> = {
    boutique: aBoutique,
    portefeuille: Boolean(configuration?.wallet),
    mobileMoney: Boolean(configuration?.paytech || boutique?.reglages.wave_lien),
    test: Boolean(configuration?.paiement_test),
  }
  const nombreFaites = ORDRE.filter((c) => faits[c]).length
  const premiereNonFaite = ORDRE.find((c) => !faits[c]) ?? null
  const ouverte = ouverteManuelle ?? premiereNonFaite
  const termine = faits.boutique && faits.portefeuille && faits.test
  const pct = Math.round((nombreFaites / NOMBRE_ETAPES_DEMARRAGE) * 100)

  return (
    <div className="anim-apparition flex flex-col" data-ecran="demarrage">
      <EnTetePage
        titre={t('demarrage.titre')}
        sousTitre={t('demarrage.sousTitre')}
        voix="demarrage.titre"
        actions={<span className="text-sm font-medium text-texte-2 tabulaire">{t('demarrage.progression', { faites: nombreFaites, total: NOMBRE_ETAPES_DEMARRAGE })}</span>}
      />
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={NOMBRE_ETAPES_DEMARRAGE} aria-valuenow={nombreFaites} aria-label={t('demarrage.titre')}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      {termine && (
        <EtatVide
          ton="succes"
          icone={<Check />}
          titre={t('demarrage.termine')}
          texte={t('demarrage.termineTexte')}
          className="mb-3"
          action={
            <Bouton icone={<Calculator />} voix="demarrage.allerCaisse" onClick={() => navigate('/caisse')}>
              {t('demarrage.allerCaisse')}
            </Bouton>
          }
        />
      )}

      <ol className="flex flex-col gap-2">
        {ORDRE.map((cle, i) => {
          const fait = faits[cle]
          const estOuverte = ouverte === cle
          return (
            <Etape
              key={cle}
              numero={i + 1}
              cle={cle}
              fait={fait}
              ouverte={estOuverte}
              facultatif={cle === 'mobileMoney'}
              onBasculer={() => setOuverteManuelle(estOuverte ? (ORDRE.find((c) => !faits[c] && c !== cle) ?? cle === premiereNonFaite ? null : premiereNonFaite) : cle)}
              resume={cle === 'boutique' && boutique ? `${boutique.nom} · ${boutique.ville}` : undefined}
            >
              {cle === 'boutique' && !fait && <FormulaireBoutique />}
              {cle === 'boutique' && fait && (
                <Link to="/reglages" className="text-sm font-medium text-accent-texte hover:underline">
                  {t('commun.modifier')}
                </Link>
              )}
              {cle === 'portefeuille' && (aBoutique ? <FormulaireConnexionWallet /> : <p className="text-sm text-texte-3">{t('demarrage.vide.texte')}</p>)}
              {cle === 'mobileMoney' && (boutique ? <FormulaireMobileMoney boutique={boutique} onPasser={() => setOuverteManuelle('test')} /> : <p className="text-sm text-texte-3">{t('demarrage.vide.texte')}</p>)}
              {cle === 'test' && <EtapeTest boutique={boutique} />}
            </Etape>
          )
        })}
      </ol>
    </div>
  )
}

function Etape({ numero, cle, fait, ouverte, facultatif, resume, onBasculer, children }: { numero: number; cle: Cle; fait: boolean; ouverte: boolean; facultatif?: boolean; resume?: string; onBasculer: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const Icone = ICONES[cle]
  const id = `etape-${cle}`
  return (
    <li className={cn('rounded-lg border bg-surface transition-colors', ouverte ? 'border-accent shadow-xs' : 'border-bordure')} aria-current={ouverte ? 'step' : undefined}>
      <button type="button" onClick={onBasculer} aria-expanded={ouverte} aria-controls={id} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span
          className={cn(
            'inline-flex size-9 shrink-0 items-center justify-center rounded-full',
            fait ? 'bg-succes-doux text-succes-texte' : ouverte ? 'bg-accent-doux text-accent-texte' : 'bg-surface-2 text-texte-3',
          )}
          aria-hidden="true"
        >
          {fait ? <Check size={18} /> : <Icone size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-base font-medium text-texte">
            <span className="text-texte-3 tabulaire">{numero}.</span>
            {t(`demarrage.etapes.${cle}`)}
            {facultatif && <span className="text-xs font-normal text-texte-3">({t('commun.optionnel')})</span>}
          </span>
          <span className="block truncate text-sm text-texte-3">{resume ?? t(`demarrage.etapes.${cle}Texte`)}</span>
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-texte-3 transition-transform', ouverte && 'rotate-180')} aria-hidden="true" />
      </button>
      {ouverte && (
        <div id={id} className="border-t border-bordure px-3 py-3 md:px-4">
          {children}
        </div>
      )}
    </li>
  )
}

function appliquerUtilisateur(utilisateur: Utilisateur) {
  queryClient.setQueryData(CLE_MOI, utilisateur)
  useAuth.getState().definir(utilisateur)
  void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
}

function FormulaireBoutique() {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('Dakar')
  useSaisieEnCours(nom !== '' || telephone !== '' || ville !== 'Dakar')
  const [erreur, setErreur] = useState<string | null>(null)
  const [champs, setChamps] = useState<{ nom?: string; ville?: string }>({})

  const creation = useMutation({
    mutationFn: creerBoutique,
    onSuccess: ({ utilisateur }) => appliquerUtilisateur(utilisateur),
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) setChamps({ nom: e.champ('nom'), ville: e.champ('ville') })
      setErreur(messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const c: typeof champs = {}
    if (nom.trim().length < 2) c.nom = t('auth.champRequis')
    if (!ville.trim()) c.ville = t('auth.champRequis')
    setChamps(c)
    if (Object.keys(c).length) return
    creation.mutate({ nom: nom.trim(), telephone: telephone.trim() || null, ville: ville.trim() })
  }

  return (
    <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
      <Champ libelle={t('reglages.nom')} value={nom} onChange={(e) => setNom(e.target.value)} erreur={champs.nom} autoComplete="organization" icone={<Store />} />
      <div className="grid gap-3 md:grid-cols-2">
        <Champ libelle={t('reglages.telephone')} mentionOptionnel={t('commun.optionnel')} value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" autoComplete="tel" />
        <Champ libelle={t('reglages.ville')} value={ville} onChange={(e) => setVille(e.target.value)} erreur={champs.ville} autoComplete="address-level2" />
      </div>
      <ErreurFormulaire message={erreur} />
      <Bouton type="submit" icone={<Store />} voix="demarrage.creerBoutique" chargement={creation.isPending} pleineLargeur className="md:w-auto md:self-start">
        {t('demarrage.creerBoutique')}
      </Bouton>
    </form>
  )
}

type ChoixMobile = 'paytech' | 'wave'

function FormulaireMobileMoney({ boutique, onPasser }: { boutique: BoutiqueDetail; onPasser: () => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [choix, setChoix] = useState<ChoixMobile>(boutique.reglages.wave_lien && !boutique.paytech.configure ? 'wave' : 'paytech')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [environnement, setEnvironnement] = useState<'test' | 'prod'>(boutique.paytech.environnement)
  const [waveLien, setWaveLien] = useState(boutique.reglages.wave_lien ?? '')
  useSaisieEnCours(apiKey !== '' || apiSecret !== '' || waveLien !== (boutique.reglages.wave_lien ?? ''))
  const [erreur, setErreur] = useState<string | null>(null)
  const [champs, setChamps] = useState<Record<string, string | undefined>>({})

  const invalider = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
    void queryClient.invalidateQueries({ queryKey: CLE_MOI })
  }
  const paytech = useMutation({
    mutationFn: () => enregistrerPaytech({ api_key: apiKey, api_secret: apiSecret, environnement }),
    onSuccess: () => {
      setApiKey('')
      setApiSecret('')
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invalider()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) setChamps({ api_key: e.champ('api_key'), api_secret: e.champ('api_secret') })
      setErreur(messageErreur(e))
    },
  })
  const wave = useMutation({
    mutationFn: () => modifierBoutique({ reglages: { wave_lien: waveLien.trim(), moyens: { ...boutique.reglages.moyens, wave_manuel: true } } }),
    onSuccess: () => {
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invalider()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) setChamps({ wave_lien: e.champ('reglages.wave_lien') })
      setErreur(messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setChamps({})
    if (choix === 'paytech') {
      const c: Record<string, string> = {}
      if (!boutique.paytech.configure && !apiKey.trim()) c.api_key = t('auth.champRequis')
      if (!boutique.paytech.configure && !apiSecret.trim()) c.api_secret = t('auth.champRequis')
      setChamps(c)
      if (Object.keys(c).length) return
      paytech.mutate()
    } else {
      if (!waveLien.trim()) {
        setChamps({ wave_lien: t('auth.champRequis') })
        return
      }
      wave.mutate()
    }
  }

  const enCours = paytech.isPending || wave.isPending

  return (
    <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
      <Segment<ChoixMobile>
        libelle={t('reglages.paiements')}
        valeur={choix}
        onChange={setChoix}
        options={[
          { valeur: 'paytech', libelle: t('reglages.paytech'), icone: <CreditCard /> },
          { valeur: 'wave', libelle: t('reglages.waveManuel'), icone: <Link2 /> },
        ]}
      />
      {choix === 'paytech' ? (
        <>
          <p className="text-sm text-texte-2">{t('reglages.paytechTexte')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Champ libelle={t('reglages.apiKey')} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} erreur={champs.api_key} aide={boutique.paytech.configure ? t('reglages.secretAide') : undefined} autoComplete="off" icone={<KeyRound />} />
            <Champ libelle={t('reglages.apiSecret')} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} erreur={champs.api_secret} aide={boutique.paytech.configure ? t('reglages.secretAide') : undefined} autoComplete="off" icone={<KeyRound />} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-texte-2">{t('reglages.environnement')}</span>
            <Segment<'test' | 'prod'>
              libelle={t('reglages.environnement')}
              taille="sm"
              valeur={environnement}
              onChange={setEnvironnement}
              options={[
                { valeur: 'test', libelle: t('reglages.test') },
                { valeur: 'prod', libelle: t('reglages.prod') },
              ]}
              className="md:w-64"
            />
          </div>
        </>
      ) : (
        <Champ libelle={t('reglages.waveLien')} aide={t('reglages.waveLienAide')} value={waveLien} onChange={(e) => setWaveLien(e.target.value)} erreur={champs.wave_lien} inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} icone={<Link2 />} />
      )}
      <ErreurFormulaire message={erreur} />
      <div className="flex flex-col gap-2 md:flex-row">
        <Bouton type="submit" icone={<Check />} voix="commun.enregistrer" chargement={enCours} pleineLargeur className="md:w-auto">
          {t('commun.enregistrer')}
        </Bouton>
        <Bouton type="button" variante="fantome" icone={<SkipForward />} voix="demarrage.passer" onClick={onPasser} pleineLargeur className="md:w-auto">
          {t('demarrage.passer')}
        </Bouton>
      </div>
    </form>
  )
}

function EtapeTest({ boutique }: { boutique: BoutiqueDetail | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const messageErreur = useMessageErreur()
  const [erreur, setErreur] = useState<string | null>(null)

  const lightningOk = Boolean(boutique?.reglages.moyens.lightning && boutique.configuration.wallet)
  const paytechOk = Boolean(boutique?.reglages.moyens.paytech && boutique.paytech.configure)
  const waveOk = Boolean(boutique?.reglages.moyens.wave_manuel && boutique.reglages.wave_lien)
  const possible = lightningOk || paytechOk || waveOk

  const test = useMutation({
    mutationFn: () =>
      creerVente({
        montant_xof: 100,
        note: 'Test',
        ...(lightningOk ? { methode: 'lightning' as const } : paytechOk ? { methode: 'paytech' as const, operateur: 'wave' as const } : { methode: 'wave_manuel' as const }),
      }),
    onSuccess: ({ vente }) => {
      void queryClient.invalidateQueries({ queryKey: CLE_VENTES })
      const tentative = vente.paiements[0]
      if (tentative) navigate(`/caisse/paiement/${tentative.ulid}?test=1`)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-texte-2">{t('demarrage.testExplication')}</p>
      {!possible && boutique && (
        <p className="text-sm text-attente-texte">
          {t('caisse.aucunMoyen')} {t('caisse.aucunMoyenAction')}
        </p>
      )}
      <ErreurFormulaire message={erreur} />
      <Bouton icone={<Play />} voix="demarrage.lancerTest" chargement={test.isPending} disabled={!possible} onClick={() => test.mutate()} pleineLargeur className="md:w-auto md:self-start">
        {t('demarrage.lancerTest')}
      </Bouton>
    </div>
  )
}
