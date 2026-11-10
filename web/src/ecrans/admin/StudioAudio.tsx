import { useMutation } from '@tanstack/react-query'
import { CheckCheck, Filter, Mic, Search, Send, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_MATRICE, publierAudios, useMatriceAudio } from '@/api/admin'
import { useCatalogue } from '@/api/catalogue'
import type { CodePays, LangueAudio } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Pagination } from '@/composants/Pagination'
import { Selection } from '@/composants/Selection'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { nomPays } from '@/lib/catalogue'
import { cn } from '@/lib/cn'
import { queryClient } from '@/lib/queryClient'
import { ecrireStockage, lireStockage } from '@/lib/stockage'
import { useEstBureau } from '@/lib/useMediaQuery'
import { usePaginationLocale } from '@/lib/usePagination'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { HautParleur } from '@/voix/HautParleur'
import { estLangueAudio } from '@/voix/store'
import { Couverture } from './studio/Couverture'
import { LegendeStatuts } from './studio/IconeStatut'
import { MatriceBureau, MatriceMobile } from './studio/Matrice'
import { PanneauEnregistrement } from './studio/PanneauEnregistrement'
import { brouillons, filtrerCles, languesDuFiltre, prochaineManquante, voisine, type FiltresStudio } from './studio/selection'
import { useEnregistreur } from './studio/useEnregistreur'

const CLE_LANGUE = 'satspoint.studio.langue'
const CLE_RAFALE = 'satspoint.studio.rafale'
const CLE_PAYS = 'satspoint.studio.pays'
/** Lignes de la matrice par page (lignes compactes : 50 restent lisibles d'un coup d'œil). */
const CLES_PAR_PAGE = 50

/**
 * Studio audio (super-admin, cahier § 6.13) : couverture par langue, matrice clés × langues, enregistrement au micro
 * ou dépôt de fichier, brouillon → publication, mode rafale et raccourcis clavier.
 */
export default function StudioAudio() {
  const { t, i18n } = useTranslation()
  const messageErreur = useMessageErreur()
  const bureau = useEstBureau()
  const requete = useMatriceAudio()
  const matrice = requete.data
  const invalider = () => void queryClient.invalidateQueries({ queryKey: CLE_MATRICE })
  useDonneesEnDirect(['audio', 'audios'], invalider)

  const [filtres, setFiltres] = useState<FiltresStudio>(() => {
    const l = lireStockage(CLE_LANGUE)
    return { langue: estLangueAudio(l) ? l : 'wo', ecran: null, manquants: false, q: '' }
  })
  // Filtre pays : n'affiche que les colonnes des langues de ce pays (+ celles de tous les pays, comme le français).
  const catalogue = useCatalogue()
  const [pays, setPays] = useState<CodePays | ''>(() => (lireStockage(CLE_PAYS) ?? '') as CodePays | '')
  const languesVisibles = useMemo(
    () => (matrice ? languesDuFiltre(matrice.langues, pays) : []),
    [matrice, pays],
  )
  const matriceVisible = useMemo(() => (matrice ? { ...matrice, langues: languesVisibles } : undefined), [matrice, languesVisibles])
  const [rafale, setRafale] = useState(() => lireStockage(CLE_RAFALE) !== '0')
  const [selectionChoisie, setSelectionChoisie] = useState<string | null>(null)
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)
  const rec = useEnregistreur()
  const [confirmationLot, setConfirmationLot] = useState(false)

  // Langue de travail : celle choisie si elle est encore active et visible, sinon la première colonne.
  const langue = matrice && !languesVisibles.some((l) => l.code === filtres.langue) ? (languesVisibles[0]?.code ?? filtres.langue) : filtres.langue
  const cles = useMemo(() => (matrice ? filtrerCles(matrice.cles, { ...filtres, langue }) : []), [matrice, filtres, langue])
  // Filtres et recherche d'abord, puis pagination ; la page suit la case choisie (mode rafale, clavier).
  const pagination = usePaginationLocale(matrice ? cles : undefined, { parPage: CLES_PAR_PAGE })
  const hautMatrice = useRef<HTMLDivElement>(null)
  const filtrer = (maj: (f: FiltresStudio) => FiltresStudio) => {
    setFiltres(maj)
    pagination.reinitialiser()
  }
  const toutes = useMemo(() => (matrice ? filtrerCles(matrice.cles, { ...filtres, langue, ecran: null, manquants: false, q: '' }) : []), [matrice, filtres, langue])
  // Par défaut : la première case à enregistrer dans la langue de travail.
  const selection = selectionChoisie ?? (matrice ? (prochaineManquante(toutes, langue, null) ?? toutes[0]?.cle ?? null) : null)
  const cleChoisie = matrice?.cles.find((c) => c.cle === selection) ?? null
  const nomLangue = matrice?.langues.find((l) => l.code === langue)?.nom ?? langue
  const idsBrouillons = useMemo(() => (matrice ? brouillons(matrice.cles, langue) : []), [matrice, langue])
  const enTraitement = matrice?.cles.some((c) => Object.values(c.etats).some((e) => e?.statut === 'en_traitement')) ?? false

  // Secours si le signal temps réel n'arrive pas : relecture toutes les 3 s tant qu'un fichier est en traitement.
  useEffect(() => {
    if (!enTraitement) return
    const id = setInterval(() => void queryClient.invalidateQueries({ queryKey: CLE_MATRICE }), 3000)
    return () => clearInterval(id)
  }, [enTraitement])

  /** Change de case : la prise en cours est jetée ; en mode rafale, le décompte repart aussitôt. */
  const selectionner = (cle: string, auto = false) => {
    rec.reinitialiser()
    setSelectionChoisie(cle)
    const rang = cles.findIndex((c) => c.cle === cle)
    const pageCle = rang >= 0 ? Math.floor(rang / CLES_PAR_PAGE) + 1 : pagination.page
    if (pageCle !== pagination.page) pagination.allerA(pageCle, { remplacer: true })
    if (auto) setTimeout(() => rec.demarrer(), 350)
  }

  const choisirLangue = (l: LangueAudio) => {
    if (l === langue) return
    ecrireStockage(CLE_LANGUE, l)
    rec.reinitialiser()
    // « Manquants seulement » dépend de la langue : la liste change, on repart de la page 1.
    if (filtres.manquants) filtrer((f) => ({ ...f, langue: l }))
    else setFiltres((f) => ({ ...f, langue: l }))
  }
  const choisirPays = (valeur: string) => {
    ecrireStockage(CLE_PAYS, valeur || null)
    setPays(valeur as CodePays | '')
  }
  const choisir = (cle: string, l: LangueAudio) => {
    choisirLangue(l)
    selectionner(cle)
    if (!bureau) setFeuilleOuverte(true)
  }
  /** Fermer la feuille (mobile) arrête une prise en cours. */
  const fermerFeuille = (ouverte: boolean) => {
    if (!ouverte) rec.reinitialiser()
    setFeuilleOuverte(ouverte)
  }
  const basculerRafale = () => {
    ecrireStockage(CLE_RAFALE, rafale ? '0' : '1')
    setRafale(!rafale)
  }

  const suivante = (auto: boolean) => {
    const liste = cles.length ? cles : toutes
    const prochaine = prochaineManquante(liste, langue, selection)
    if (prochaine) selectionner(prochaine, auto)
    else {
      if (auto) notifier({ type: 'succes', titre: t('studio.toutFait', { langue: nomLangue }), voix: 'studio.toutFait' })
    }
  }
  const precedente = () => {
    const v = voisine(cles.length ? cles : toutes, selection, -1)
    if (v) selectionner(v)
  }

  const lot = useMutation({
    mutationFn: () => publierAudios({ ids: idsBrouillons }),
    onSuccess: ({ publies }) => {
      setConfirmationLot(false)
      invalider()
      notifier({ type: 'succes', titre: t('studio.lotPublie', { count: publies, langue: nomLangue }), voix: 'studio.publie' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  const panneau = cleChoisie && (
    <PanneauEnregistrement
      cle={cleChoisie}
      langue={langue}
      nomLangue={nomLangue}
      rafale={rafale}
      onValide={() => (rafale ? suivante(true) : undefined)}
      onSuivant={() => suivante(false)}
      onPrecedent={precedente}
      clavier={bureau || feuilleOuverte}
      rec={rec}
    />
  )

  return (
    <div className="anim-apparition flex flex-col" data-ecran="studio">
      <EnTetePage
        titre={t('studio.titre')}
        sousTitre={t('studio.sousTitre')}
        voix="studio.titre"
        actions={
          <Bouton
            variante="secondaire"
            taille="sm"
            icone={<Send />}
            voix="studio.publierTout"
            disabled={idsBrouillons.length === 0}
            onClick={() => setConfirmationLot(true)}
            aria-label={t('studio.publierToutAria', { count: idsBrouillons.length, langue: nomLangue })}
          >
            <span className="hidden sm:inline">{t('studio.publierTout')}</span>
            <span className="rounded-full bg-attente-doux px-1.5 text-xs text-attente-texte tabulaire">{idsBrouillons.length}</span>
          </Bouton>
        }
      />

      {requete.isPending ? (
        <div data-chargement="studio" aria-busy="true">
          <SqueletteListe lignes={8} />
        </div>
      ) : requete.isError || !matrice ? (
        <EtatVide
          ton="neutre"
          icone={<Mic />}
          titre={t('erreurs.inattendue')}
          action={
            <Bouton variante="secondaire" voix="commun.reessayer" onClick={() => void requete.refetch()}>
              {t('commun.reessayer')}
            </Bouton>
          }
        />
      ) : (
        <>
          <Couverture matrice={matriceVisible ?? matrice} langue={langue} onChoisir={choisirLangue} />

          <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
            <Champ
              libelle={t('studio.rechercher')}
              type="search"
              icone={<Search />}
              placeholder={t('studio.rechercher')}
              value={filtres.q}
              onChange={(e) => filtrer((f) => ({ ...f, q: e.target.value }))}
              className="h-9 text-sm md:h-8"
              classeConteneur="min-w-0 flex-1 basis-full sm:basis-48 [&>label]:sr-only"
              autoComplete="off"
            />
            <Selection
              libelle={t('studio.ecran')}
              libelleVisible={false}
              taille="sm"
              value={filtres.ecran ?? ''}
              onChange={(e) => filtrer((f) => ({ ...f, ecran: e.target.value || null }))}
              options={[{ valeur: '', libelle: t('studio.tousEcrans') }, ...matrice.ecrans.map((e) => ({ valeur: e, libelle: t(`studio.ecrans.${e}`, { defaultValue: e }) }))]}
              classeConteneur="shrink-0 basis-40"
            />
            {catalogue.pays.length > 1 && (
              <Selection
                libelle={t('studio.pays')}
                libelleVisible={false}
                taille="sm"
                value={pays}
                onChange={(e) => choisirPays(e.target.value)}
                options={[{ valeur: '', libelle: t('studio.tousPays') }, ...catalogue.pays.map((p) => ({ valeur: p.code, libelle: nomPays(p, i18n.language) }))]}
                classeConteneur="shrink-0 basis-40"
                data-filtre-pays
              />
            )}
            <Puce actif={filtres.manquants} icone={<Filter />} voix="studio.manquantsSeulement" onClick={() => filtrer((f) => ({ ...f, manquants: !f.manquants }))}>
              {t('studio.manquantsSeulement')}
            </Puce>
            <Puce actif={rafale} icone={<Zap />} voix="studio.rafale" onClick={basculerRafale} titre={t('studio.rafaleAide')}>
              {t('studio.rafale')}
            </Puce>
          </div>
          <LegendeStatuts className="mb-2" />

          <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px]">
            {cles.length === 0 ? (
              <EtatVide
                ton="succes"
                icone={<CheckCheck />}
                titre={filtres.manquants ? t('studio.vide.toutFait', { langue: nomLangue }) : t('studio.vide.titre')}
                texte={t('studio.vide.texte')}
                action={
                  <Bouton variante="secondaire" voix="studio.effacerFiltres" onClick={() => filtrer((f) => ({ ...f, ecran: null, manquants: false, q: '' }))}>
                    {t('studio.effacerFiltres')}
                  </Bouton>
                }
              />
            ) : (
              <div ref={hautMatrice} className="min-w-0">
                {bureau ? (
                  <MatriceBureau cles={pagination.visibles} langues={languesVisibles} langue={langue} selection={selection} onChoisir={choisir} />
                ) : (
                  <MatriceMobile cles={pagination.visibles} langues={languesVisibles} langue={langue} selection={selection} onChoisir={choisir} />
                )}
                <Pagination
                  page={pagination.page}
                  parPage={CLES_PAR_PAGE}
                  total={pagination.total}
                  pages={pagination.pages}
                  onChange={pagination.allerA}
                  ancre={hautMatrice}
                  libelle={t('studio.matrice')}
                />
              </div>
            )}
            {bureau && panneau && (
              <aside className="sticky top-[calc(var(--hauteur-entete)+12px)] verre rounded-xl p-3 shadow-xs">{panneau}</aside>
            )}
          </div>

          {!bureau && (
            <Dialogue ouvert={feuilleOuverte && Boolean(cleChoisie)} onOuvertChange={fermerFeuille} titre={t('studio.panneau')} titreMasque taille="lg">
              {panneau}
            </Dialogue>
          )}
        </>
      )}

      <Dialogue
        ouvert={confirmationLot}
        onOuvertChange={setConfirmationLot}
        titre={t('studio.publierToutTitre', { count: idsBrouillons.length, langue: nomLangue })}
        description={t('studio.publierToutTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setConfirmationLot(false)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton icone={<Send />} voix="studio.publierTout" chargement={lot.isPending} onClick={() => lot.mutate()}>
              {t('studio.publierTout')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}

/** Filtre à bascule compact (icône + libellé), avec aide vocale. */
function Puce({ actif, icone, voix, onClick, titre, children }: { actif: boolean; icone: ReactNode; voix: string; onClick: () => void; titre?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      title={titre}
      className={cn(
        'relative inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium whitespace-nowrap transition-colors md:h-8 [&>svg]:size-3.5',
        actif ? 'border-accent bg-accent-doux text-accent-texte' : 'border-bordure bg-surface text-texte-2 hover:text-texte',
      )}
    >
      {icone}
      {children}
      <HautParleur cle={voix} dansBouton />
    </button>
  )
}
