import { useMutation } from '@tanstack/react-query'
import { ArrowUpRight, Check, ClipboardPaste, LockKeyhole, ScanLine, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ErreurApi } from '@/api/client'
import type { ApercuEnvoi, ResultatEnvoi } from '@/api/types'
import { apercuEnvoi, CLE_TRANSACTIONS, CLE_WALLET, envoyer } from '@/api/wallet'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { ChampMotDePasse, ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { formaterFCFA, formaterSats } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { lirePressePapier } from '@/lib/retours'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { Scanner } from './Scanner'
import { estimerFrais } from './utilitaires'

type Etape = 'destination' | 'apercu' | 'confirmation' | 'resultat'

/** Envoyer des sats (propriétaire) : destination → aperçu → mot de passe → résultat. */
export function Envoyer({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours(ouvert)

  const [etape, setEtape] = useState<Etape>('destination')
  const [destination, setDestination] = useState('')
  const [montant, setMontant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [apercu, setApercu] = useState<ApercuEnvoi | null>(null)
  const [resultat, setResultat] = useState<ResultatEnvoi | null>(null)
  const [erreur, setErreur] = useState<{ message: string; code?: string } | null>(null)
  const [scannerOuvert, setScannerOuvert] = useState(false)

  const montantSats = montant ? Number(montant) : undefined
  const besoinMontant = apercu !== null && apercu.type !== 'bolt11' && apercu.montant_sats === null

  const reinitialiser = () => {
    setEtape('destination')
    setDestination('')
    setMontant('')
    setMotDePasse('')
    setApercu(null)
    setResultat(null)
    setErreur(null)
  }
  const fermer = () => {
    reinitialiser()
    onFermer()
  }

  const enErreur = (e: unknown) => setErreur({ message: messageErreur(e), code: e instanceof ErreurApi ? e.code : undefined })

  const previsualisation = useMutation({
    mutationFn: () => apercuEnvoi(destination.trim(), montantSats),
    onSuccess: (a) => {
      setApercu(a)
      // Adresse / LNURL sans montant : on reste sur l'étape destination pour demander le montant.
      if (a.type !== 'bolt11' && a.montant_sats === null) return
      setEtape('apercu')
    },
    onError: enErreur,
  })

  const envoi = useMutation({
    mutationFn: () =>
      envoyer({
        destination: destination.trim(),
        ...(apercu?.type !== 'bolt11' && montantSats ? { montant_sats: montantSats } : {}),
        password: motDePasse,
      }),
    onSuccess: (r) => {
      setResultat(r)
      setMotDePasse('')
      setEtape('resultat')
      void queryClient.invalidateQueries({ queryKey: CLE_WALLET })
      void queryClient.invalidateQueries({ queryKey: CLE_TRANSACTIONS })
    },
    onError: (e) => {
      setMotDePasse('')
      enErreur(e)
      setEtape('resultat')
    },
  })

  const soumettreDestination = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    if (!destination.trim()) {
      setErreur({ message: t('auth.champRequis') })
      return
    }
    if (besoinMontant && !(montantSats && montantSats > 0)) {
      setErreur({ message: t('auth.champRequis') })
      return
    }
    previsualisation.mutate()
  }

  const coller = async () => {
    const texte = await lirePressePapier()
    if (texte) setDestination(texte.replace(/^lightning:/i, ''))
  }

  const sats = apercu?.montant_sats ?? montantSats ?? 0
  const frais = sats ? estimerFrais(sats) : 0

  return (
    <>
      <Dialogue ouvert={ouvert} onOuvertChange={(o) => !o && fermer()} titre={t('portefeuille.envoyerTitre')} taille="sm">
        {etape === 'destination' && (
          <form onSubmit={soumettreDestination} noValidate className="flex flex-col gap-3 pb-1">
            <Champ
              libelle={t('portefeuille.destination')}
              aide={t('portefeuille.destinationAide')}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value)
                setApercu(null)
              }}
              autoFocus
              suffixe={
                <span className="flex items-center">
                  <BoutonIcone taille="sm" libelle={t('portefeuille.coller')} icone={<ClipboardPaste />} voix="portefeuille.coller" onClick={() => void coller()} tabIndex={-1} />
                  <BoutonIcone taille="sm" libelle={t('portefeuille.scanner')} icone={<ScanLine />} voix="portefeuille.scanner" onClick={() => setScannerOuvert(true)} tabIndex={-1} />
                </span>
              }
              className="pr-20"
            />
            {besoinMontant && (
              <Champ
                libelle={t('portefeuille.montantSats')}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={montant}
                onChange={(e) => setMontant(e.target.value.replace(/[^\d]/g, ''))}
                aide={apercu?.min_sats !== undefined && apercu.max_sats !== undefined ? `${formaterSats(apercu.min_sats)} – ${formaterSats(apercu.max_sats)}` : undefined}
                autoFocus
              />
            )}
            <ErreurFormulaire message={erreur?.message ?? null} />
            <Bouton type="submit" icone={<Search />} voix="portefeuille.apercu" chargement={previsualisation.isPending} pleineLargeur>
              {t('portefeuille.apercu')}
            </Bouton>
          </form>
        )}

        {etape === 'apercu' && apercu && (
          <div className="flex flex-col gap-3 pb-1">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-surface-2 px-3 py-2 text-sm">
              <dt className="text-texte-3">{t('portefeuille.destinataire')}</dt>
              <dd className="truncate text-right font-medium text-texte">{apercu.destinataire}</dd>
              <dt className="text-texte-3">{t('portefeuille.montant')}</dt>
              <dd className="text-right font-semibold text-texte tabulaire">
                {formaterSats(sats)}
                {apercu.montant_xof !== null && <span className="block text-xs font-normal text-texte-2">{formaterFCFA(apercu.montant_xof)}</span>}
              </dd>
              <dt className="text-texte-3">{t('portefeuille.frais')}</dt>
              <dd className="text-right text-texte tabulaire">≈ {formaterSats(frais)}</dd>
              {apercu.description && (
                <>
                  <dt className="text-texte-3">{t('portefeuille.description')}</dt>
                  <dd className="truncate text-right text-texte">{apercu.description}</dd>
                </>
              )}
            </dl>
            <div className="flex gap-2">
              <Bouton variante="secondaire" voix="commun.retour" onClick={() => setEtape('destination')} className="flex-1">
                {t('commun.retour')}
              </Bouton>
              <Bouton icone={<LockKeyhole />} voix="commun.continuer" onClick={() => setEtape('confirmation')} className="flex-1">
                {t('commun.continuer')}
              </Bouton>
            </div>
          </div>
        )}

        {etape === 'confirmation' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (motDePasse) envoi.mutate()
            }}
            noValidate
            className="flex flex-col gap-3 pb-1"
          >
            <p className="text-center text-2xl font-semibold text-texte tabulaire">{formaterSats(sats)}</p>
            <ChampMotDePasse libelle={t('portefeuille.motDePasse')} name="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <Bouton variante="secondaire" voix="commun.retour" onClick={() => setEtape('apercu')} className="flex-1">
                {t('commun.retour')}
              </Bouton>
              <Bouton type="submit" icone={<ArrowUpRight />} voix="portefeuille.confirmerEnvoi" chargement={envoi.isPending} disabled={!motDePasse} className="flex-1">
                {t('portefeuille.confirmerEnvoi')}
              </Bouton>
            </div>
          </form>
        )}

        {etape === 'resultat' && (
          <div className="flex flex-col items-center gap-3 pb-1 text-center">
            {resultat ? (
              <>
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-succes-doux text-succes-texte" aria-hidden="true">
                  <Check size={28} strokeWidth={2.5} />
                </span>
                <p className="text-lg font-semibold text-texte">{t('portefeuille.envoye')}</p>
                <p className="text-sm text-texte-2 tabulaire">
                  {t('portefeuille.envoyeTexte', { sats: formaterSats(resultat.montant_sats), frais: formaterSats(resultat.frais_sats), hash: resultat.payment_hash_abrege })}
                </p>
                <Bouton voix="commun.fermer" onClick={fermer} pleineLargeur>
                  {t('commun.fermer')}
                </Bouton>
              </>
            ) : (
              <>
                <ErreurFormulaire message={erreur?.message ?? t('erreurs.inattendue')} />
                {erreur?.code === 'BUDGET_DEPASSE' && <p className="text-sm text-texte-2">{t('portefeuille.budgetTexte')}</p>}
                <div className="flex w-full gap-2">
                  <Bouton variante="secondaire" voix="commun.fermer" onClick={fermer} className="flex-1">
                    {t('commun.fermer')}
                  </Bouton>
                  {erreur?.code === 'SOLDE_INSUFFISANT' || erreur?.code === 'DESTINATION_INVALIDE' ? (
                    <Bouton voix="portefeuille.modifierMontant" onClick={() => setEtape('destination')} className="flex-1">
                      {t('portefeuille.modifierMontant')}
                    </Bouton>
                  ) : erreur?.code === 'MOT_DE_PASSE_INCORRECT' ? (
                    <Bouton voix="commun.reessayer" onClick={() => setEtape('confirmation')} className="flex-1">
                      {t('commun.reessayer')}
                    </Bouton>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      </Dialogue>
      <Scanner
        ouvert={scannerOuvert}
        onFermer={() => setScannerOuvert(false)}
        onCode={(valeur) => {
          setDestination(valeur)
          setApercu(null)
          setScannerOuvert(false)
        }}
      />
    </>
  )
}
