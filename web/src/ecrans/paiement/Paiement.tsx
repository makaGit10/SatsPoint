import { useMutation } from '@tanstack/react-query'
import { BadgeCheck, Ban, Clock, Copy, ExternalLink, FlaskConical, RefreshCw, Share2, Smartphone, TriangleAlert, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CLE_BOUTIQUE, modifierBoutique, useBoutique } from '@/api/boutique'
import { CLE_MOI } from '@/api/moi'
import type { MethodePaiement, Operateur, Paiement as TypePaiement } from '@/api/types'
import { annulerVente, CLE_VENTES, confirmerManuellement, nouvelleTentative, simulerPaiement, useVente } from '@/api/ventes'
import { peut, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Dialogue } from '@/composants/Dialogue'
import { EtatVide } from '@/composants/EtatVide'
import { Onglet, OngletContenu, Onglets, OngletsListe } from '@/composants/Onglets'
import { QrCode } from '@/composants/QrCode'
import { Segment } from '@/composants/Segment'
import { Squelette } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { BandeauDemo } from '@/coquille/BandeauDemo'
import { Marque } from '@/coquille/Marque'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { formaterCompteARebours, formaterFCFA, formaterSats } from '@/lib/format'
import { contenuQrLightning, OPERATEURS } from '@/lib/methodes'
import { queryClient } from '@/lib/queryClient'
import { copier, jouerSonSucces, partager, peutPartager, vibrer } from '@/lib/retours'
import { useCompteARebours } from '@/lib/useCompteARebours'
import { TempsReel } from '@/temps-reel/TempsReel'
import { annoncer } from '@/voix/annoncer'
import { HautParleur } from '@/voix/HautParleur'
import { Succes } from './Succes'
import { useSuiviPaiement, type EtatSuivi } from './useSuiviPaiement'

type Onglet = 'lightning' | 'mobile'
type ChoixMobile = Operateur | 'wave_manuel'

/**
 * Écran de paiement plein écran : onglets Bitcoin | Mobile money, QR côté client, compte à rebours,
 * temps réel + vérification de secours, expiration → nouvelle demande, changement de méthode = nouvelle tentative.
 * Le statut « payé » vient toujours du serveur (`useSuiviPaiement`).
 */
export default function Paiement() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const { ulid } = useParams()
  const [params] = useSearchParams()
  const test = params.get('test') === '1'
  const navigate = useNavigate()
  const messageErreur = useMessageErreur()
  const utilisateur = useAuth((s) => s.utilisateur)
  const gestion = peut(utilisateur, ['proprietaire', 'gerant'])
  const nomBoutique = utilisateur?.boutique?.nom ?? t('app.nom')

  const { etat, paiement, vente, verifier, verificationEnCours, recharger } = useSuiviPaiement(ulid)
  const { data: boutique } = useBoutique()
  const { data: venteComplete } = useVente(etat === 'reussi' ? vente?.ulid : null)

  const [annulationOuverte, setAnnulationOuverte] = useState(false)
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)

  // Retours sensoriels et annonces vocales à chaque transition (une seule fois par état).
  const dernierEtat = useRef<EtatSuivi | null>(null)
  useEffect(() => {
    if (etat === dernierEtat.current) return
    dernierEtat.current = etat
    if (etat === 'reussi') {
      jouerSonSucces()
      vibrer([40, 60, 40])
      void annoncer('paiement.recu')
      void queryClient.invalidateQueries({ queryKey: CLE_VENTES })
      if (test) {
        void modifierBoutique({ paiement_test: true }).then(() => {
          void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
          void queryClient.invalidateQueries({ queryKey: CLE_MOI })
        })
      }
    } else if (etat === 'expire') {
      void annoncer('paiement.expire')
    } else if (etat === 'annule') {
      void annoncer('paiement.annule')
    }
  }, [etat, test])

  const suffixeTest = test ? '?test=1' : ''

  const tentative = useMutation({
    mutationFn: ({ methode, operateur }: { methode: MethodePaiement; operateur?: Operateur }) => nouvelleTentative(vente!.ulid, methode, operateur),
    onSuccess: ({ paiement: nouveau }) => navigate(`/caisse/paiement/${nouveau.ulid}${suffixeTest}`, { replace: true }),
    onError: (e) => {
      notifier({ type: 'erreur', titre: messageErreur(e) })
      recharger()
    },
  })
  const annulation = useMutation({
    mutationFn: () => annulerVente(vente!.ulid),
    onSuccess: () => {
      setAnnulationOuverte(false)
      recharger()
      void queryClient.invalidateQueries({ queryKey: CLE_VENTES })
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })
  const simulation = useMutation({
    mutationFn: () => simulerPaiement(ulid!),
    // Aucune décision ici : on relit simplement le statut auprès du serveur.
    onSuccess: () => recharger(),
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })
  const confirmation = useMutation({
    mutationFn: () => confirmerManuellement(ulid!),
    onSuccess: () => {
      setConfirmationOuverte(false)
      recharger()
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  const moyens = boutique?.reglages.moyens
  const paytechOk = Boolean(moyens?.paytech && boutique?.paytech.configure)
  const waveOk = Boolean(moyens?.wave_manuel && boutique?.reglages.wave_lien)
  const lightningOk = Boolean(moyens?.lightning && boutique?.configuration.wallet)
  const mobileOk = paytechOk || waveOk

  const choixMobile: { valeur: ChoixMobile; libelle: string }[] = useMemo(
    () => [
      ...(paytechOk ? OPERATEURS.map((op) => ({ valeur: op as ChoixMobile, libelle: t(`operateurs.${op}`) })) : []),
      ...(waveOk ? [{ valeur: 'wave_manuel' as ChoixMobile, libelle: t('methodes.wave_manuel') }] : []),
    ],
    [paytechOk, waveOk, t],
  )

  const ongletCourant: Onglet = paiement?.methode === 'lightning' ? 'lightning' : 'mobile'
  const choixCourant: ChoixMobile | null = paiement ? (paiement.methode === 'wave_manuel' ? 'wave_manuel' : paiement.operateur) : null

  const lancerTentative = (choix: 'lightning' | ChoixMobile) => {
    if (!vente || tentative.isPending) return
    if (choix === 'lightning') tentative.mutate({ methode: 'lightning' })
    else if (choix === 'wave_manuel') tentative.mutate({ methode: 'wave_manuel' })
    else tentative.mutate({ methode: 'paytech', operateur: choix })
  }

  const changerOnglet = (valeur: string) => {
    if (valeur === ongletCourant || !paiement) return
    if (valeur === 'lightning') lancerTentative('lightning')
    else lancerTentative(choixMobile[0]?.valeur ?? 'wave_manuel')
  }

  const secondes = useCompteARebours(etat === 'en_attente' ? paiement?.expire_le : null)
  // Échéance atteinte : on relit tout de suite (le serveur fait foi, il marquera la tentative expirée).
  useEffect(() => {
    if (secondes === 0 && etat === 'en_attente') recharger()
  }, [secondes, etat, recharger])
  const expireLocal = etat === 'en_attente' && secondes === 0

  const terminerTest = () => navigate('/caisse', { replace: true })

  if (etat === 'reussi' && paiement && vente) {
    return (
      <>
        <Succes
          montant={paiement.montant_xof}
          sats={venteComplete?.montant_sats_reussi ?? paiement.montant_sats}
          methode={venteComplete?.methode_reussie ?? paiement.methode}
          operateur={venteComplete?.operateur_reussi ?? paiement.operateur}
          numero={vente.numero}
          boutique={nomBoutique}
          recuUrl={venteComplete?.recu_url ?? null}
          alerte={venteComplete?.alerte ?? null}
          test={test}
          onNouvelleVente={test ? terminerTest : () => navigate('/caisse', { replace: true })}
        />
        <TempsReel />
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-fond" data-ecran="paiement" data-etat={etat}>
      <BandeauDemo />
      <header className="flex h-[var(--hauteur-entete)] shrink-0 items-center gap-2 border-b border-bordure px-3 md:px-5">
        <Marque taille="sm" sansTexte />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 truncate text-base font-semibold text-texte">
            {t('paiement.titre')}
            <HautParleur cle="paiement.titre" />
          </h1>
          {vente && <p className="truncate text-xs text-texte-3 tabulaire">{t('paiement.vente', { numero: vente.numero })}</p>}
        </div>
        {etat === 'en_attente' && (
          <BoutonIcone libelle={t('paiement.annuler')} icone={<X />} voix="paiement.annuler" variante="danger" onClick={() => setAnnulationOuverte(true)} />
        )}
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] md:max-w-lg md:pt-6">
        {etat === 'introuvable' || etat === 'erreur' ? (
          <EtatVide
            ton="neutre"
            icone={<Ban />}
            titre={etat === 'introuvable' ? t('paiement.introuvable') : t('erreurs.inattendue')}
            action={
              <div className="flex gap-2">
                {etat === 'erreur' && (
                  <Bouton variante="secondaire" icone={<RefreshCw />} voix="commun.reessayer" onClick={recharger}>
                    {t('commun.reessayer')}
                  </Bouton>
                )}
                <Bouton voix="paiement.retourCaisse" onClick={() => navigate('/caisse', { replace: true })}>
                  {t('paiement.retourCaisse')}
                </Bouton>
              </div>
            }
          />
        ) : (
          <>
            <div className="text-center">
              {paiement ? (
                <>
                  <p className="text-4xl font-semibold tracking-tight text-texte tabulaire md:text-5xl">{formaterFCFA(paiement.montant_xof)}</p>
                  <p className="mt-1 min-h-5 text-base text-texte-2 tabulaire">{paiement.montant_sats !== null && formaterSats(paiement.montant_sats)}</p>
                </>
              ) : (
                <>
                  <Squelette className="mx-auto h-10 w-44" />
                  <Squelette className="mx-auto mt-2 h-4 w-24" />
                </>
              )}
            </div>

            <Onglets value={ongletCourant} onValueChange={changerOnglet} className="mt-4 flex flex-1 flex-col">
              <OngletsListe className="md:w-full">
                <Onglet value="lightning" icone={<Zap />} voix="paiement.lightning" disabled={!lightningOk || tentative.isPending}>
                  {t('paiement.lightning')}
                </Onglet>
                <Onglet value="mobile" icone={<Smartphone />} voix="paiement.mobileMoney" disabled={!mobileOk || tentative.isPending}>
                  {t('paiement.mobileMoney')}
                </Onglet>
              </OngletsListe>

              <OngletContenu value="lightning" className="flex flex-1 flex-col">
                <PanneauTentative
                  etat={tentative.isPending ? 'chargement' : expireLocal ? 'expire' : etat}
                  paiement={paiement}
                  secondes={secondes}
                  gestion={gestion}
                  verificationEnCours={verificationEnCours}
                  simulationEnCours={simulation.isPending}
                  onVerifier={() => void verifier().then(() => notifier({ type: 'info', titre: t('paiement.verifie') })).catch((e: unknown) => notifier({ type: 'erreur', titre: messageErreur(e) }))}
                  onSimuler={() => simulation.mutate()}
                  onNouvelleDemande={() => lancerTentative('lightning')}
                  onChangerMethode={mobileOk ? () => lancerTentative(choixMobile[0]?.valeur ?? 'wave_manuel') : undefined}
                  onConfirmer={() => setConfirmationOuverte(true)}
                  onRetourCaisse={() => navigate('/caisse', { replace: true })}
                  nomBoutique={nomBoutique}
                />
              </OngletContenu>

              <OngletContenu value="mobile" className="flex flex-1 flex-col">
                {choixMobile.length > 1 && (
                  <Segment<ChoixMobile>
                    libelle={t('paiement.choisirOperateur')}
                    taille="sm"
                    valeur={choixCourant ?? choixMobile[0]!.valeur}
                    options={choixMobile.map((c) => ({ ...c, desactive: tentative.isPending || etat !== 'en_attente' }))}
                    onChange={(v) => v !== choixCourant && lancerTentative(v)}
                    className="mb-3"
                  />
                )}
                <PanneauTentative
                  etat={tentative.isPending ? 'chargement' : expireLocal ? 'expire' : etat}
                  paiement={paiement}
                  secondes={secondes}
                  gestion={gestion}
                  verificationEnCours={verificationEnCours}
                  simulationEnCours={simulation.isPending}
                  onVerifier={() => void verifier().then(() => notifier({ type: 'info', titre: t('paiement.verifie') })).catch((e: unknown) => notifier({ type: 'erreur', titre: messageErreur(e) }))}
                  onSimuler={() => simulation.mutate()}
                  onNouvelleDemande={() => lancerTentative(choixCourant ?? choixMobile[0]?.valeur ?? 'wave_manuel')}
                  onChangerMethode={lightningOk ? () => lancerTentative('lightning') : undefined}
                  onConfirmer={() => setConfirmationOuverte(true)}
                  onRetourCaisse={() => navigate('/caisse', { replace: true })}
                  nomBoutique={nomBoutique}
                />
              </OngletContenu>
            </Onglets>
          </>
        )}
      </main>

      <Dialogue
        ouvert={annulationOuverte}
        onOuvertChange={setAnnulationOuverte}
        titre={t('paiement.annulerTitre')}
        description={t('paiement.annulerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="paiement.garder" onClick={() => setAnnulationOuverte(false)}>
              {t('paiement.garder')}
            </Bouton>
            <Bouton variante="danger" icone={<X />} voix="paiement.annuler" chargement={annulation.isPending} onClick={() => annulation.mutate()}>
              {t('paiement.annuler')}
            </Bouton>
          </>
        }
      />
      <Dialogue
        ouvert={confirmationOuverte}
        onOuvertChange={setConfirmationOuverte}
        titre={t('paiement.confirmerTitre', { montant: paiement ? formaterFCFA(paiement.montant_xof) : '' })}
        description={t('paiement.confirmerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setConfirmationOuverte(false)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton icone={<BadgeCheck />} voix="paiement.confirmerManuellement" chargement={confirmation.isPending} onClick={() => confirmation.mutate()}>
              {t('paiement.confirmerManuellement')}
            </Bouton>
          </>
        }
      />
      <TempsReel />
    </div>
  )
}

interface PropsPanneau {
  etat: EtatSuivi
  paiement: TypePaiement | null
  secondes: number | null
  gestion: boolean
  verificationEnCours: boolean
  simulationEnCours: boolean
  onVerifier: () => void
  onSimuler: () => void
  onNouvelleDemande: () => void
  onChangerMethode?: () => void
  onConfirmer: () => void
  onRetourCaisse: () => void
  nomBoutique: string
}

/** Contenu d'un onglet selon l'état de la tentative courante. */
function PanneauTentative(p: PropsPanneau) {
  const { t } = useTranslation()
  const { etat, paiement } = p

  if (etat === 'chargement' || !paiement) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 pt-2" data-chargement="paiement" aria-busy="true">
        <Squelette className="size-60 rounded-lg" />
        <Squelette className="h-4 w-48" />
        <Squelette className="h-10 w-full max-w-xs" />
      </div>
    )
  }

  if (etat === 'expire') {
    return (
      <PanneauEtat ton="attente" icone={<Clock />} titre={t('paiement.expire')} texte={t('paiement.expireTexte')} voix="paiement.expire">
        <Bouton taille="lg" pleineLargeur icone={<RefreshCw />} voix="paiement.nouvelleDemande" onClick={p.onNouvelleDemande}>
          {t('paiement.nouvelleDemande')}
        </Bouton>
        {p.onChangerMethode && (
          <Bouton variante="secondaire" pleineLargeur voix="paiement.changerMethode" onClick={p.onChangerMethode}>
            {t('paiement.changerMethode')}
          </Bouton>
        )}
      </PanneauEtat>
    )
  }

  if (etat === 'annule') {
    return (
      <PanneauEtat ton="neutre" icone={<Ban />} titre={t('paiement.annule')} texte={t('paiement.annuleTexte')} voix="paiement.annule">
        <Bouton taille="lg" pleineLargeur voix="caisse.nouvelleVente" onClick={p.onRetourCaisse}>
          {t('caisse.nouvelleVente')}
        </Bouton>
      </PanneauEtat>
    )
  }

  if (etat === 'echoue') {
    return (
      <PanneauEtat ton="danger" icone={<TriangleAlert />} titre={t('paiement.echoue')} voix="paiement.echoue">
        <Bouton taille="lg" pleineLargeur icone={<RefreshCw />} voix="commun.reessayer" onClick={p.onNouvelleDemande}>
          {t('commun.reessayer')}
        </Bouton>
        {p.onChangerMethode && (
          <Bouton variante="secondaire" pleineLargeur voix="paiement.changerMethode" onClick={p.onChangerMethode}>
            {t('paiement.changerMethode')}
          </Bouton>
        )}
      </PanneauEtat>
    )
  }

  // En attente : QR + actions.
  const lightning = paiement.methode === 'lightning'
  const waveManuel = paiement.methode === 'wave_manuel'
  const contenuQr = lightning ? (paiement.bolt11 ? contenuQrLightning(paiement.bolt11) : null) : (paiement.paytech?.redirect_url ?? paiement.wave_lien)
  const lienExterne = lightning ? null : (paiement.paytech?.redirect_url ?? paiement.wave_lien)
  const aCopier = lightning ? paiement.bolt11 : lienExterne

  const copierDemande = async () => {
    if (!aCopier) return
    const ok = await copier(aCopier)
    notifier({ type: ok ? 'succes' : 'erreur', titre: ok ? t('paiement.copie') : t('paiement.copieImpossible') })
  }
  const partagerDemande = () =>
    void partager({ title: t('paiement.titre'), text: t('paiement.partage', { boutique: p.nomBoutique, montant: formaterFCFA(paiement.montant_xof) }), url: lienExterne ?? undefined })

  return (
    <div className="flex flex-1 flex-col items-center">
      {contenuQr && <QrCode valeur={contenuQr} libelle={t('paiement.qrAria')} taille={248} className="md:size-[272px]" />}
      <p className="mt-3 max-w-xs text-center text-sm text-texte-2">{lightning ? t('paiement.scanner') : waveManuel ? t('paiement.waveTexte') : t('paiement.scannerMobileMoney')}</p>

      <div className="mt-3 flex items-center gap-2" aria-live="polite">
        <span className="inline-flex size-2 rounded-full bg-attente anim-pulsation" aria-hidden="true" />
        <span className="text-sm font-medium text-attente-texte">{waveManuel ? t('paiement.enAttenteConfirmation') : t('paiement.enAttente')}</span>
        {p.secondes !== null && (
          <span className={cn('inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-sm font-semibold text-texte tabulaire', p.secondes <= 30 && 'bg-danger-doux text-danger-texte')}>
            <Clock size={13} aria-hidden="true" />
            <span className="sr-only">{t('paiement.expireDans')} </span>
            {formaterCompteARebours(p.secondes)}
          </span>
        )}
      </div>

      {lienExterne && (
        <a
          href={lienExterne}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-md bg-mm px-4 text-base font-medium text-white shadow-xs hover:brightness-105 md:h-10"
        >
          <ExternalLink size={16} aria-hidden="true" />
          {waveManuel ? t('paiement.ouvrirWave') : t('paiement.ouvrir')}
        </a>
      )}

      <div className="mt-4 flex items-center justify-center gap-3">
        <BoutonIcone libelle={t('paiement.copier')} icone={<Copy />} voix="paiement.copier" variante="secondaire" taille="lg" onClick={() => void copierDemande()} />
        {peutPartager() && <BoutonIcone libelle={t('paiement.partager')} icone={<Share2 />} voix="paiement.partager" variante="secondaire" taille="lg" onClick={partagerDemande} />}
        <BoutonIcone libelle={t('paiement.verifier')} icone={<RefreshCw className={cn(p.verificationEnCours && 'animate-spin')} />} voix="paiement.verifier" variante="secondaire" taille="lg" disabled={p.verificationEnCours} onClick={p.onVerifier} />
      </div>

      <div className="mt-auto flex w-full max-w-xs flex-col gap-2 pt-4">
        {waveManuel && p.gestion && (
          <Bouton taille="lg" pleineLargeur icone={<BadgeCheck />} voix="paiement.confirmerManuellement" onClick={p.onConfirmer}>
            {t('paiement.confirmerManuellement')}
          </Bouton>
        )}
        {paiement.simule && (
          <Bouton variante="secondaire" pleineLargeur icone={<FlaskConical />} voix="paiement.simuler" chargement={p.simulationEnCours} onClick={p.onSimuler} data-simuler>
            {t('paiement.simuler')}
          </Bouton>
        )}
      </div>
    </div>
  )
}

function PanneauEtat({ ton, icone, titre, texte, voix, children }: { ton: 'attente' | 'neutre' | 'danger'; icone: ReactNode; titre: string; texte?: string; voix: string; children: ReactNode }) {
  const tons = { attente: 'bg-attente-doux text-attente-texte', neutre: 'bg-neutre-doux text-neutre-texte', danger: 'bg-danger-doux text-danger-texte' }
  return (
    <div className="flex flex-1 flex-col items-center pt-6 text-center" role="status" aria-live="polite">
      <span className={cn('inline-flex size-16 items-center justify-center rounded-full [&>svg]:size-8', tons[ton])} aria-hidden="true">
        {icone}
      </span>
      <h2 className="mt-4 flex items-center gap-1.5 text-lg font-semibold text-texte">
        {titre}
        <HautParleur cle={voix} />
      </h2>
      {texte && <p className="mt-1 max-w-xs text-sm text-texte-2">{texte}</p>}
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">{children}</div>
    </div>
  )
}
