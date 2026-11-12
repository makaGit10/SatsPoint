import { useMutation } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, Package, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CLE_ARTICLES, useArticles } from '@/api/articles'
import { ordonnerArticles, supprimerArticle } from '@/api/articlesEcriture'
import { exporterArticles } from '@/api/exports'
import type { Article } from '@/api/types'
import { peut, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Menu } from '@/composants/Menu'
import { Pagination } from '@/composants/Pagination'
import { Pastille } from '@/composants/Pastille'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { libelleArticle } from './articles/libelle'
import { cn } from '@/lib/cn'
import { chargerPaquet } from '@/i18n'
import { formaterFCFA } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { pertinence } from '@/lib/texte'
import { usePaginationLocale } from '@/lib/usePagination'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { EcouterArticle } from './articles/EcouterArticle'
import { VignetteArticle } from './articles/VignetteArticle'

// Assistant d'import : chargé à la demande avec son paquet de traductions (rien pour la caisse).
const ImportArticles = lazy(() => Promise.all([import('./articles/ImportArticles'), chargerPaquet('admin')]).then(([m]) => m))
// Formulaire sans écrire (photo, pictogrammes, micro, pavé) : chargé à la première ouverture.
const FormulaireArticle = lazy(() => import('./articles/FormulaireArticle'))

/** Articles par page (pagination côté écran : la liste complète est déjà chargée pour la caisse). */
const ARTICLES_PAR_PAGE = 20

/**
 * Articles (P1) : liste compacte réordonnable (vignette, haut-parleur qui dit le nom), recherche, pagination (20 par page),
 * formulaire SANS ÉCRIRE en fenêtre (photo, pictogramme, nom dit, pavé) ; caissier en lecture seule.
 */
export default function Articles() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const peutGerer = peut(utilisateur, ['proprietaire', 'gerant'])
  const messageErreur = useMessageErreur()
  const { data: articles, isPending } = useArticles()
  useDonneesEnDirect(['articles'], () => void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES }))
  const invalider = () => void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES })

  const [formulaire, setFormulaire] = useState<{ ouvert: boolean; article: Article | null }>({ ouvert: false, article: null })
  const [suppression, setSuppression] = useState<Article | null>(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [params, setParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const terme = recherche.trim()
  const haut = useRef<HTMLOListElement>(null)

  // Recherche locale (nom, nom du pictogramme, catégorie, SKU ; accents et petites fautes tolérés) AVANT la pagination.
  const filtres = useMemo(
    () => (articles && terme ? articles.filter((a) => pertinence([libelleArticle(a, t), a.categorie, a.sku].filter(Boolean).join(' '), terme) > 0) : articles),
    [articles, terme, t],
  )
  const { visibles, page, pages, total, debut, allerA, reinitialiser } = usePaginationLocale(filtres, { parPage: ARTICLES_PAR_PAGE })
  const chercher = (valeur: string) => {
    setRecherche(valeur)
    reinitialiser()
  }

  // Liens directs (recherche globale) : `?importer=1` ouvre l'assistant, `?article=…` le formulaire (ajusté au rendu).
  const demande = `${params.get('importer') ?? ''}|${params.get('article') ?? ''}`
  const [demandeVue, setDemandeVue] = useState('|')
  const articleDemande = params.get('article')
  if (demande !== '|' && demande !== demandeVue && (!articleDemande || articles)) {
    setDemandeVue(demande)
    if (params.get('importer') && peutGerer) setImportOuvert(true)
    const a = articleDemande ? articles?.find((x) => x.ulid === articleDemande) : undefined
    if (a && peutGerer) setFormulaire({ ouvert: true, article: a })
  }
  useEffect(() => {
    if (demande === '|' || demande !== demandeVue) return
    const suivant = new URLSearchParams(params)
    suivant.delete('importer')
    suivant.delete('article')
    setParams(suivant, { replace: true })
  }, [demande, demandeVue, params, setParams])

  const exportation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') => exporterArticles(format),
    onSuccess: () => notifier({ type: 'succes', titre: t('ventes.exportOk'), voix: 'ventes.exportOk' }),
    onError: () => notifier({ type: 'erreur', titre: t('ventes.exportErreur'), voix: 'ventes.exportErreur' }),
  })

  const ordre = useMutation({
    mutationFn: (ulids: string[]) => ordonnerArticles(ulids),
    onMutate: (ulids) => {
      // Mise à jour optimiste : la liste bouge tout de suite, le serveur confirme ensuite.
      queryClient.setQueryData<{ articles: Article[] }>(CLE_ARTICLES, (ancien) =>
        ancien ? { articles: ancien.articles.map((a) => ({ ...a, position: ulids.indexOf(a.ulid) })) } : ancien,
      )
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
    onSettled: invalider,
  })
  const supprimer = useMutation({
    mutationFn: (ulid: string) => supprimerArticle(ulid),
    onSuccess: () => {
      setSuppression(null)
      notifier({ type: 'succes', titre: t('articles.supprime'), voix: 'articles.supprime' })
      invalider()
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  const deplacer = (index: number, delta: number) => {
    if (!articles) return
    const cible = index + delta
    if (cible < 0 || cible >= articles.length) return
    const ulids = articles.map((a) => a.ulid)
    const [retire] = ulids.splice(index, 1)
    ulids.splice(cible, 0, retire!)
    ordre.mutate(ulids)
  }

  const ouvrirAjout = () => setFormulaire({ ouvert: true, article: null })

  return (
    <div className="anim-apparition flex flex-col" data-ecran="articles">
      <EnTetePage
        titre={t('articles.titre')}
        voix="articles.titre"
        sousTitre={!peutGerer ? t('articles.lectureSeule') : undefined}
        actions={
          peutGerer && (
            <>
              <BoutonIcone libelle={t('articles.importer')} icone={<Upload />} voix="articles.importer" variante="secondaire" onClick={() => setImportOuvert(true)} />
              <Menu
                libelle={t('articles.exporter')}
                icone={<Download />}
                voix="articles.exporter"
                titre={t('export.titre')}
                occupe={exportation.isPending}
                elements={[
                  { id: 'csv', libelle: t('export.csv'), detail: t('export.csvDetail'), icone: <FileText />, voix: 'export.csv', onChoisir: () => exportation.mutate('csv') },
                  { id: 'xlsx', libelle: t('export.xlsx'), detail: t('export.xlsxDetail'), icone: <FileSpreadsheet />, voix: 'export.xlsx', onChoisir: () => exportation.mutate('xlsx') },
                ]}
              />
              <Bouton icone={<Plus />} voix="articles.ajouter" taille="sm" onClick={ouvrirAjout}>
                {t('commun.ajouter')}
              </Bouton>
            </>
          )
        }
      />

      {isPending && (
        <div data-chargement="articles" aria-busy="true">
          <SqueletteListe lignes={4} />
        </div>
      )}

      {articles && articles.length === 0 && (
        <EtatVide
          ton="neutre"
          icone={<Package />}
          titre={t('articles.vide.titre')}
          texte={t('articles.vide.texte')}
          action={
            peutGerer && (
              <Bouton icone={<Plus />} voix="articles.ajouter" onClick={ouvrirAjout}>
                {t('articles.ajouter')}
              </Bouton>
            )
          }
        />
      )}

      {articles && articles.length > ARTICLES_PAR_PAGE / 2 && (
        <Champ
          libelle={t('articles.rechercher')}
          type="search"
          inputMode="search"
          icone={<Search />}
          placeholder={t('articles.rechercher')}
          value={recherche}
          onChange={(e) => chercher(e.target.value)}
          className="h-10 md:h-9"
          classeConteneur="mb-3 [&>label]:sr-only"
          autoComplete="off"
        />
      )}

      {articles && articles.length > 0 && total === 0 && <EtatVide ton="neutre" icone={<Search />} titre={t('articles.aucunResultat', { terme })} />}

      {articles && total > 0 && (
        <ol ref={haut} className="divide-y divide-bordure verre rounded-xl" aria-label={t('articles.titre')}>
          {visibles.map((a, rang) => {
            // Rang dans la liste complète : l'ordre se change sur tout le catalogue, pas seulement la page.
            const i = debut + rang
            return (
            <li key={a.ulid} className={cn('flex items-center gap-3 px-3 py-2', !a.actif && 'bg-surface-2/60')}>
              <VignetteArticle article={a} taille="md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-texte">
                  <span className={cn('truncate', !a.nom?.trim() && 'text-texte-2 italic')}>{libelleArticle(a, t)}</span>
                  {!a.actif && <Pastille ton="neutre">{t('articles.inactif')}</Pastille>}
                </p>
                {/* Mobile : le prix passe sous le nom (le nom garde la place) ; bureau : prix à droite. */}
                <p className="truncate text-xs text-texte-3">
                  <span className="font-semibold text-texte tabulaire sm:hidden">{formaterFCFA(a.prix_xof)}</span>
                  {(a.categorie || a.sku) && <span className="before:mx-1 before:content-['·'] sm:before:hidden">{[a.categorie, a.sku].filter(Boolean).join(' · ')}</span>}
                </p>
              </div>
              <EcouterArticle article={a} />
              <span className="hidden shrink-0 text-sm font-semibold text-texte tabulaire sm:inline">{formaterFCFA(a.prix_xof)}</span>
              {peutGerer && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {/* Ordre : seulement sans recherche (le rang filtré ne correspond pas au catalogue). */}
                  {!terme && (
                    <span className="hidden items-center sm:flex">
                      <BoutonIcone taille="sm" libelle={t('articles.monter')} icone={<ChevronUp />} voix="articles.monter" disabled={i === 0 || ordre.isPending} onClick={() => deplacer(i, -1)} />
                      <BoutonIcone taille="sm" libelle={t('articles.descendre')} icone={<ChevronDown />} voix="articles.descendre" disabled={i === articles.length - 1 || ordre.isPending} onClick={() => deplacer(i, 1)} />
                    </span>
                  )}
                  <BoutonIcone taille="sm" libelle={t('articles.modifier')} icone={<Pencil />} voix="articles.modifier" onClick={() => setFormulaire({ ouvert: true, article: a })} />
                  <BoutonIcone taille="sm" libelle={t('commun.supprimer')} icone={<Trash2 />} voix="commun.supprimer" variante="danger" onClick={() => setSuppression(a)} />
                </div>
              )}
            </li>
            )
          })}
        </ol>
      )}
      {articles && total > 0 && <Pagination page={page} parPage={ARTICLES_PAR_PAGE} total={total} pages={pages} onChange={allerA} ancre={haut} libelle={t('articles.titre')} />}

      {importOuvert && (
        <Suspense fallback={null}>
          <ImportArticles onFermer={() => setImportOuvert(false)} />
        </Suspense>
      )}

      {formulaire.ouvert && (
        <Suspense fallback={null}>
          <FormulaireArticle article={formulaire.article} onFermer={() => setFormulaire({ ouvert: false, article: null })} />
        </Suspense>
      )}

      <Dialogue
        ouvert={Boolean(suppression)}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={t('articles.supprimerTitre', { nom: suppression ? libelleArticle(suppression, t) : '' })}
        description={t('articles.supprimerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setSuppression(null)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<Trash2 />} voix="commun.supprimer" chargement={supprimer.isPending} onClick={() => suppression && supprimer.mutate(suppression.ulid)}>
              {t('commun.supprimer')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}
