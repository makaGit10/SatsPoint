import { useMutation } from '@tanstack/react-query'
import { Link2, NotebookPen, Package, Zap } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CLE_ARTICLES, useArticles } from '@/api/articles'
import { CLE_BOUTIQUE, useBoutique } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import { CLE_COURS, useCours } from '@/api/cours'
import type { MethodePaiement, Operateur } from '@/api/types'
import { CLE_VENTES, creerVente } from '@/api/paiements'
import { peut, useAuth } from '@/auth/store'
import { Bouton, BoutonLien } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Dialogue } from '@/composants/Dialogue'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { chargerPaquet } from '@/i18n'
import { cn } from '@/lib/cn'
import { convertirEnSats, formaterFCFA, formaterNombre, formaterSats } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { tempsRelatif } from '@/lib/temps'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { useGuideVocal } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'
import { ajouterAuPanier, changerQuantite, totalPanier, type LignePanier } from './caisse/panier'
import type { MoyensDisponibles } from './caisse/ChoixMethode'
import { Pave } from './caisse/Pave'
import { ajouterChiffres } from './caisse/saisie'

export const MONTANT_MIN = 100

// Chargés à la demande : rien dans le JavaScript du premier écran tant qu'on n'en a pas besoin.
const ChoixMethode = lazy(() => import('./caisse/ChoixMethode').then((m) => ({ default: m.ChoixMethode })))
// Grille et panier : avec le paquet « articles » (noms des pictogrammes, libellés) chargé en même temps.
const grille = () => Promise.all([import('./caisse/Articles'), chargerPaquet('articles')]).then(([m]) => m)
const GrilleArticles = lazy(() => grille().then((m) => ({ default: m.GrilleArticles })))
const Panier = lazy(() => grille().then((m) => ({ default: m.Panier })))
const BandeauAucunMoyen = lazy(() => import('./caisse/AucunMoyen').then((m) => ({ default: m.BandeauAucunMoyen })))
const BoutonBrancherMoyen = lazy(() => import('./caisse/AucunMoyen').then((m) => ({ default: m.BoutonBrancherMoyen })))
const NoteVente = lazy(() => import('./caisse/NoteVente'))
const BandeauDemarrage = lazy(() => import('@/coquille/BandeauDemarrage').then((m) => ({ default: m.BandeauDemarrage })))
const MONTANT_MAX_DEFAUT = 2_000_000

/** Caisse : pavé plein écran (mobile), montant + conversion en direct, articles rapides et panier (P1), choix du moyen à l'encaissement. */
export default function Caisse() {
  const { t, i18n } = useTranslation()
  void i18n.language
  useGuideVocal('guide.caisse')
  const navigate = useNavigate()
  const utilisateur = useAuth((s) => s.utilisateur)
  const gestion = peut(utilisateur, ['proprietaire', 'gerant'])
  const messageErreur = useMessageErreur()

  const { data: boutique } = useBoutique()
  const { data: cours, isPending: coursEnChargement } = useCours()
  // Les moyens disponibles dépendent de la boutique ET du cours : tant qu'ils ne sont pas connus, on n'encaisse pas
  // (sinon un clic rapide part sur le seul moyen « connu » ou annonce à tort qu'aucun moyen n'est actif).
  const moyensConnus = Boolean(boutique) && !coursEnChargement
  const { data: articles } = useArticles()

  useDonneesEnDirect(['parametres', 'articles', 'wallet'], () => {
    void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
    void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES })
  })

  const [saisie, setSaisie] = useState('')
  const [note, setNote] = useState('')
  const [noteVisible, setNoteVisible] = useState(false)
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [articlesOuverts, setArticlesOuverts] = useState(false)
  const [choixOuvert, setChoixOuvert] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const articlesActifs = useMemo(() => (articles ?? []).filter((a) => a.actif), [articles])
  const montantLibre = saisie ? Number(saisie) : 0
  const montant = montantLibre + totalPanier(panier)
  const max = boutique?.reglages.montant_max_xof ?? MONTANT_MAX_DEFAUT
  const coursDisponible = Boolean(cours?.disponible && cours.btc_xof)
  const sats = coursDisponible && montant > 0 ? convertirEnSats(montant, cours!.btc_xof!) : null

  const horsBornes = montant > 0 && (montant < MONTANT_MIN || montant > max)
  const raisonBornes = montant > 0 && montant < MONTANT_MIN ? t('caisse.minimum', { min: formaterFCFA(MONTANT_MIN) }) : montant > max ? t('caisse.maximum', { max: formaterFCFA(max) }) : null

  const moyens: MoyensDisponibles = useMemo(() => {
    const r = boutique?.reglages.moyens
    const walletOk = Boolean(boutique?.configuration.wallet)
    return {
      lightning: Boolean(r?.lightning) && walletOk && coursDisponible,
      lightningRaison: !r?.lightning ? null : !walletOk ? t('caisse.walletNonConnecte') : !coursDisponible ? t('caisse.coursIndisponible') : null,
      paytech: Boolean(r?.paytech && boutique?.paytech.configure),
      wave_manuel: Boolean(r?.wave_manuel && boutique?.reglages.wave_lien),
      pays: boutique?.moyens_pays ?? [],
    }
  }, [boutique, coursDisponible, t])
  const nombreMoyens = [moyens.lightning, moyens.paytech, moyens.wave_manuel].filter(Boolean).length + moyens.pays.length
  // Aucun moyen branché (ni portefeuille relié, ni PayTech, ni lien Wave) : on ne propose pas « Encaisser » (erreur évitable),
  // mais « Brancher un moyen de paiement ». Un cours momentanément indisponible n'entre pas dans ce cas.
  const lightningBranche = Boolean(boutique?.reglages.moyens.lightning && boutique?.configuration.wallet)
  const aucunMoyenBranche = Boolean(boutique) && !lightningBranche && !moyens.paytech && !moyens.wave_manuel && !moyens.pays.length

  const creation = useMutation({
    mutationFn: creerVente,
    onSuccess: ({ vente }) => {
      void queryClient.invalidateQueries({ queryKey: CLE_VENTES })
      const tentative = vente.paiements[0]
      if (tentative) navigate(`/caisse/paiement/${tentative.ulid}`)
    },
    onError: (e) => {
      const message = messageErreur(e)
      setErreur(message)
      // Encaissement direct (un seul moyen) : la feuille de choix n'est pas ouverte, l'erreur doit se voir quand même.
      if (!choixOuvert) notifier({ type: 'erreur', titre: message })
      // Lightning indisponible côté serveur : on relit le cours et la boutique pour refléter l'état réel.
      if (e instanceof ErreurApi && (e.code === 'COURS_INDISPONIBLE' || e.code === 'WALLET_INJOIGNABLE')) {
        void queryClient.invalidateQueries({ queryKey: CLE_COURS })
        void queryClient.invalidateQueries({ queryKey: CLE_BOUTIQUE })
      }
    },
  })

  const encaisserAvec = useCallback(
    (methode: MethodePaiement, operateur?: Operateur, moyen?: string) => {
      setErreur(null)
      const lignes = [
        // Article sans nom écrit : le nom de son pictogramme (règle de ecrans/articles/libelle.ts, recopiée pour ne rien ajouter au JS de la caisse).
        ...panier.map((l) => ({
          article_ulid: l.article.ulid,
          libelle: l.article.nom?.trim() || t(`pictos.${l.article.pictogramme}`, { defaultValue: t('caisse.article') }),
          quantite: l.quantite,
          prix_unitaire_xof: l.article.prix_xof,
        })),
        ...(panier.length && montantLibre > 0 ? [{ libelle: t('caisse.montantLibre'), quantite: 1, prix_unitaire_xof: montantLibre }] : []),
      ]
      creation.mutate({
        montant_xof: montant,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(lignes.length ? { lignes } : {}),
        methode,
        ...(operateur ? { operateur } : {}),
        ...(moyen ? { moyen } : {}),
      })
    },
    [creation, montant, montantLibre, note, panier, t],
  )

  const encaisser = useCallback(() => {
    if (horsBornes || montant === 0 || creation.isPending || !moyensConnus || aucunMoyenBranche) return
    if (nombreMoyens === 0) {
      notifier({ type: 'erreur', titre: t('caisse.aucunMoyen'), description: moyens.lightningRaison ?? t('caisse.aucunMoyenAction'), voix: 'caisse.aucunMoyen' })
      return
    }
    setErreur(null)
    if (nombreMoyens === 1 && !moyens.paytech) {
      const seul = moyens.pays[0]
      if (seul) encaisserAvec('moyen_pays', undefined, seul.ulid)
      else encaisserAvec(moyens.lightning ? 'lightning' : 'wave_manuel')
      return
    }
    setChoixOuvert(true)
  }, [aucunMoyenBranche, creation.isPending, encaisserAvec, horsBornes, montant, moyens, moyensConnus, nombreMoyens, t])

  // Clavier physique (bureau) : chiffres, Retour arrière, Entrée, Échap — seulement hors champ de saisie.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable)) return
      if (choixOuvert || articlesOuverts) return
      if (/^\d$/.test(e.key)) setSaisie((s) => ajouterChiffres(s, e.key))
      else if (e.key === 'Backspace') setSaisie((s) => s.slice(0, -1))
      else if (e.key === 'Escape') setSaisie('')
      else if (e.key === 'Enter') encaisser()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [articlesOuverts, choixOuvert, encaisser])

  const ageCours = cours?.recupere_le ? tempsRelatif(cours.recupere_le) : null
  const configuration = utilisateur?.boutique?.configuration
  const demarrageEnCours = utilisateur?.boutique?.role === 'proprietaire' && !(configuration?.wallet && configuration?.paiement_test)
  const aDesArticles = articlesActifs.length > 0
  const versBranchement = demarrageEnCours ? '/demarrage' : boutique?.reglages.moyens.lightning && !boutique.configuration.wallet ? '/portefeuille' : '/reglages'

  return (
    <div className="anim-apparition flex flex-1 flex-col gap-4" data-ecran="caisse">
      {demarrageEnCours && (
        <Suspense fallback={null}>
          <BandeauDemarrage />
        </Suspense>
      )}
      {/* Mobile : une colonne (montant en haut, pavé en bas). Bureau : montant, conversion et articles à gauche,
          pavé + action à droite, pour que le montant reste toujours visible sans défiler. */}
      <section className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] md:items-start md:gap-8" aria-label={t('caisse.titre')}>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <header className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-2xl text-texte md:text-3xl">
              {t('caisse.titre')}
              <HautParleur cle="caisse.titre" />
            </h1>
            <div className="flex items-center gap-1">
              {aDesArticles && (
                <BoutonIcone
                  libelle={t('caisse.articles')}
                  icone={<Package />}
                  voix="caisse.articles"
                  actif={articlesOuverts}
                  onClick={() => setArticlesOuverts(true)}
                  className="md:hidden"
                />
              )}
              <BoutonIcone libelle={t('caisse.note')} icone={<NotebookPen />} voix="caisse.note" actif={noteVisible} onClick={() => setNoteVisible((v) => !v)} />
            </div>
          </header>

          {/* Montant + conversion : zone qui respire, centrée (carte sur bureau). */}
          <div className="verre flex flex-1 flex-col items-center justify-center rounded-xl px-5 py-7 text-center md:flex-none md:py-10" data-montant>
            <p className={cn('chiffre-geant md:text-7xl', montant === 0 ? 'text-texte-3' : 'text-texte')} aria-live="polite" aria-atomic="true" aria-label={t('caisse.montantAria')}>
              {formaterNombre(montant)}
              <span className="ml-1.5 text-xl font-bold tracking-normal text-accent-texte md:text-2xl">FCFA</span>
            </p>
            <p className="mt-3 min-h-6 text-base font-semibold text-texte-2 tabulaire" aria-live="polite">
              {sats !== null ? formaterSats(sats, { approx: true }) : coursDisponible || !cours ? '' : t('caisse.coursIndisponible')}
            </p>
            {coursDisponible ? (
              <p className="mt-1.5 text-xs text-texte-3 tabulaire">
                {t('caisse.coursValeur', { cours: formaterFCFA(cours!.btc_xof!) })}
                {ageCours && ` · ${t(ageCours.cle, { count: ageCours.count })}`}
              </p>
            ) : (
              cours && <p className="mt-1 text-xs text-mm-texte">{t('caisse.coursIndisponibleAction')}</p>
            )}
            {raisonBornes && (
              <p role="alert" className="mt-2 rounded-md bg-danger-doux px-2.5 py-1 text-xs font-medium text-danger-texte">
                {raisonBornes}
              </p>
            )}
            {panier.length > 0 && (
              <button type="button" onClick={() => setArticlesOuverts(true)} className="relative mt-3 rounded-full bg-accent-doux px-3.5 py-1.5 text-sm font-semibold text-accent-texte md:hidden">
                {t('caisse.panier')} · {panier.reduce((s, l) => s + l.quantite, 0)} · {formaterFCFA(totalPanier(panier))}
                <HautParleur cle="caisse.panier" dansBouton />
              </button>
            )}
          </div>

          {noteVisible && (
            <Suspense fallback={<div className="h-[72px]" />}>
              <NoteVente valeur={note} onChange={setNote} />
            </Suspense>
          )}

          {aucunMoyenBranche && (
            <Suspense fallback={null}>
              <BandeauAucunMoyen gestion={gestion} />
            </Suspense>
          )}
          {!aucunMoyenBranche && boutique && !boutique.configuration.wallet && boutique.reglages.moyens.lightning && gestion && (
            <div className="flex items-center gap-3 rounded-xl border border-attente/30 bg-attente-doux px-4 py-3 text-sm font-medium text-attente-texte">
              <span className="min-w-0 flex-1">{t('caisse.walletNonConnecte')}</span>
              <BoutonLien to="/portefeuille" variante="secondaire" taille="sm" icone={<Link2 />} voix="caisse.connecterWallet">{t('caisse.connecterWallet')}</BoutonLien>
            </div>
          )}

          {/* Bureau : articles rapides + panier sous le montant. */}
          {aDesArticles && (
            <Carte className="hidden min-w-0 md:block" rembourrage="md">
              <CarteEnTete titre={t('caisse.articles')} className="mb-3" />
              <Suspense fallback={<div className="h-20" data-chargement="articles" />}>
                <GrilleArticles articles={articlesActifs} panier={panier} onAjouter={(a) => setPanier((p) => ajouterAuPanier(p, a))} />
              </Suspense>
              <div className="mt-4 border-t border-bordure pt-3">
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('caisse.panier')}</h3>
                <Suspense fallback={null}>
                  <Panier panier={panier} onChanger={(ulid, d) => setPanier((p) => changerQuantite(p, ulid, d))} onVider={() => setPanier([])} />
                </Suspense>
              </div>
            </Carte>
          )}
        </div>

        <div className="flex flex-col md:sticky md:top-20">
          <Pave valeur={saisie} onChange={setSaisie} desactive={creation.isPending} />

          {aucunMoyenBranche && gestion ? (
            <Suspense fallback={<div className="mt-4 h-16" />}>
              <BoutonBrancherMoyen vers={versBranchement} />
            </Suspense>
          ) : (
            <Bouton
              taille="xl"
              icone={<Zap />}
              voix="caisse.encaisser"
              // Étiré par la colonne ; sur mobile, la place du bouton rond « Réécouter l'aide » est laissée à droite.
              className="mt-4 mr-[var(--reserve-guide)] md:mr-0"
              disabled={montant === 0 || horsBornes || aucunMoyenBranche}
              chargement={creation.isPending || (montant > 0 && !horsBornes && !moyensConnus)}
              onClick={encaisser}
            >
              {t('caisse.encaisser')}
            </Bouton>
          )}
        </div>
      </section>

      {choixOuvert && (
        <Suspense fallback={null}>
          <ChoixMethode ouvert={choixOuvert} onFermer={() => setChoixOuvert(false)} montant={montant} sats={sats} moyens={moyens} enCours={creation.isPending} erreur={erreur} onChoisir={encaisserAvec} />
        </Suspense>
      )}

      {/* Mobile : articles et panier en feuille. */}
      <Dialogue ouvert={articlesOuverts} onOuvertChange={setArticlesOuverts} titre={t('caisse.articles')} voix="caisse.articles" taille="md">
        <div className="flex flex-col gap-3 pb-1">
          <Suspense fallback={<div className="h-20" data-chargement="articles" />}>
            <GrilleArticles articles={articlesActifs} panier={panier} onAjouter={(a) => setPanier((p) => ajouterAuPanier(p, a))} />
          </Suspense>
          <div className="border-t border-bordure pt-2">
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('caisse.panier')}</h3>
            <Suspense fallback={null}>
              <Panier panier={panier} onChanger={(ulid, d) => setPanier((p) => changerQuantite(p, ulid, d))} onVider={() => setPanier([])} />
            </Suspense>
          </div>
          <Bouton pleineLargeur onClick={() => setArticlesOuverts(false)} voix="commun.continuer">
            {t('commun.continuer')}
          </Bouton>
        </div>
      </Dialogue>
    </div>
  )
}
