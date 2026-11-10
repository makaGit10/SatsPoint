import { useMutation } from '@tanstack/react-query'
import { CheckCheck, Filter, Mic, Search, Send, Zap } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_MATRICE, publierAudios, useMatriceAudio } from '@/api/admin'
import type { LangueAudio } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Selection } from '@/composants/Selection'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { queryClient } from '@/lib/queryClient'
import { ecrireStockage, lireStockage } from '@/lib/stockage'
import { useEstBureau } from '@/lib/useMediaQuery'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { HautParleur } from '@/voix/HautParleur'
import { estLangueAudio } from '@/voix/store'
import { Couverture } from './studio/Couverture'
import { LegendeStatuts } from './studio/IconeStatut'
import { MatriceBureau, MatriceMobile } from './studio/Matrice'
import { PanneauEnregistrement } from './studio/PanneauEnregistrement'
import { brouillons, filtrerCles, prochaineManquante, voisine, type FiltresStudio } from './studio/selection'
import { useEnregistreur } from './studio/useEnregistreur'

const CLE_LANGUE = 'satspoint.studio.langue'
const CLE_RAFALE = 'satspoint.studio.rafale'

/**
 * Studio audio (super-admin, cahier § 6.13) : couverture par langue, matrice clés × langues, enregistrement au micro
 * ou dépôt de fichier, brouillon → publication, mode rafale et raccourcis clavier.
 */
export default function StudioAudio() {
  const { t } = useTranslation()
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
  const [rafale, setRafale] = useState(() => lireStockage(CLE_RAFALE) !== '0')
  const [selectionChoisie, setSelectionChoisie] = useState<string | null>(null)
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)
  const rec = useEnregistreur()
  const [confirmationLot, setConfirmationLot] = useState(false)

  const langue = filtres.langue
  const cles = useMemo(() => (matrice ? filtrerCles(matrice.cles, filtres) : []), [matrice, filtres])
  const toutes = useMemo(() => (matrice ? filtrerCles(matrice.cles, { ...filtres, ecran: null, manquants: false, q: '' }) : []), [matrice, filtres])
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
    if (auto) setTimeout(() => rec.demarrer(), 350)
  }

  const choisirLangue = (l: LangueAudio) => {
    if (l === langue) return
    ecrireStockage(CLE_LANGUE, l)
    rec.reinitialiser()
    setFiltres((f) => ({ ...f, langue: l }))
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
          <Couverture matrice={matrice} langue={langue} onChoisir={choisirLangue} />

          <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
            <Champ
              libelle={t('studio.rechercher')}
              type="search"
              icone={<Search />}
              placeholder={t('studio.rechercher')}
              value={filtres.q}
              onChange={(e) => setFiltres((f) => ({ ...f, q: e.target.value }))}
              className="h-9 text-sm md:h-8"
              classeConteneur="min-w-0 flex-1 basis-full sm:basis-48 [&>label]:sr-only"
              autoComplete="off"
            />
            <Selection
              libelle={t('studio.ecran')}
              libelleVisible={false}
              taille="sm"
              value={filtres.ecran ?? ''}
              onChange={(e) => setFiltres((f) => ({ ...f, ecran: e.target.value || null }))}
              options={[{ valeur: '', libelle: t('studio.tousEcrans') }, ...matrice.ecrans.map((e) => ({ valeur: e, libelle: t(`studio.ecrans.${e}`, { defaultValue: e }) }))]}
              classeConteneur="basis-36"
            />
            <Puce actif={filtres.manquants} icone={<Filter />} voix="studio.manquantsSeulement" onClick={() => setFiltres((f) => ({ ...f, manquants: !f.manquants }))}>
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
                  <Bouton variante="secondaire" voix="studio.effacerFiltres" onClick={() => setFiltres((f) => ({ ...f, ecran: null, manquants: false, q: '' }))}>
                    {t('studio.effacerFiltres')}
                  </Bouton>
                }
              />
            ) : bureau ? (
              <MatriceBureau cles={cles} langues={matrice.langues} langue={langue} selection={selection} onChoisir={choisir} />
            ) : (
              <MatriceMobile cles={cles} langues={matrice.langues} langue={langue} selection={selection} onChoisir={choisir} />
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
