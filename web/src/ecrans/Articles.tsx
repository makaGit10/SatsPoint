import { useMutation } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, Package, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CLE_ARTICLES, creerArticle, modifierArticle, ordonnerArticles, supprimerArticle, useArticles, type CorpsArticle } from '@/api/articles'
import { ErreurApi } from '@/api/client'
import { exporterArticles } from '@/api/exports'
import type { Article } from '@/api/types'
import { peut, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Interrupteur } from '@/composants/Interrupteur'
import { Menu } from '@/composants/Menu'
import { Pastille } from '@/composants/Pastille'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { classePointCouleur, classesTuile, COULEURS_ARTICLES, couleurDepuis, versHex, type CouleurArticle } from '@/lib/couleursArticles'
import { chargerPaquet } from '@/i18n'
import { formaterFCFA } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'

// Assistant d'import : chargé à la demande avec son paquet de traductions (rien pour la caisse).
const ImportArticles = lazy(() => Promise.all([import('./articles/ImportArticles'), chargerPaquet('admin')]).then(([m]) => m))

/** Articles (P1) : liste compacte réordonnable, formulaire en fenêtre ; caissier en lecture seule. */
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

      {articles && articles.length > 0 && (
        <ol className="divide-y divide-bordure rounded-lg border border-bordure bg-surface" aria-label={t('articles.titre')}>
          {articles.map((a, i) => (
            <li key={a.ulid} className={cn('flex items-center gap-3 px-3 py-2', !a.actif && 'opacity-60')}>
              <span
                className={cn('inline-block size-3 shrink-0 rounded-full', classePointCouleur(a.couleur))}
                role="img"
                aria-label={t(`articles.couleurs.${couleurDepuis(a.couleur)}`)}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-texte">
                  <span className="truncate">{a.nom}</span>
                  {!a.actif && <Pastille ton="neutre">{t('articles.inactif')}</Pastille>}
                </p>
                {(a.categorie || a.sku) && <p className="truncate text-xs text-texte-3">{[a.categorie, a.sku].filter(Boolean).join(' · ')}</p>}
              </div>
              <span className="shrink-0 text-sm font-semibold text-texte tabulaire">{formaterFCFA(a.prix_xof)}</span>
              {peutGerer && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <span className="hidden items-center sm:flex">
                    <BoutonIcone taille="sm" libelle={t('articles.monter')} icone={<ChevronUp />} voix="articles.monter" disabled={i === 0 || ordre.isPending} onClick={() => deplacer(i, -1)} />
                    <BoutonIcone taille="sm" libelle={t('articles.descendre')} icone={<ChevronDown />} voix="articles.descendre" disabled={i === articles.length - 1 || ordre.isPending} onClick={() => deplacer(i, 1)} />
                  </span>
                  <BoutonIcone taille="sm" libelle={t('articles.modifier')} icone={<Pencil />} voix="articles.modifier" onClick={() => setFormulaire({ ouvert: true, article: a })} />
                  <BoutonIcone taille="sm" libelle={t('commun.supprimer')} icone={<Trash2 />} voix="commun.supprimer" variante="danger" onClick={() => setSuppression(a)} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {importOuvert && (
        <Suspense fallback={null}>
          <ImportArticles onFermer={() => setImportOuvert(false)} />
        </Suspense>
      )}

      {formulaire.ouvert && <FormulaireArticle article={formulaire.article} onFermer={() => setFormulaire({ ouvert: false, article: null })} />}

      <Dialogue
        ouvert={Boolean(suppression)}
        onOuvertChange={(o) => !o && setSuppression(null)}
        titre={t('articles.supprimerTitre', { nom: suppression?.nom ?? '' })}
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

function FormulaireArticle({ article, onFermer }: { article: Article | null; onFermer: () => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()
  const [nom, setNom] = useState(article?.nom ?? '')
  const [prix, setPrix] = useState(article ? String(article.prix_xof) : '')
  const [categorie, setCategorie] = useState(article?.categorie ?? '')
  const [sku, setSku] = useState(article?.sku ?? '')
  const [couleur, setCouleur] = useState<CouleurArticle>(article?.couleur ? couleurDepuis(article.couleur) : 'orange')
  const [actif, setActif] = useState(article?.actif ?? true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [champs, setChamps] = useState<{ nom?: string; prix?: string }>({})

  const enregistrement = useMutation({
    mutationFn: (corps: CorpsArticle) => (article ? modifierArticle(article.ulid, corps) : creerArticle(corps)),
    onSuccess: () => {
      notifier({ type: 'succes', titre: t('articles.enregistre'), voix: 'articles.enregistre' })
      void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES })
      onFermer()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) setChamps({ nom: e.champ('nom'), prix: e.champ('prix_xof') })
      setErreur(messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const c: typeof champs = {}
    const prixNombre = Number(prix.replace(/\s/g, ''))
    if (!nom.trim()) c.nom = t('auth.champRequis')
    if (!Number.isInteger(prixNombre) || prixNombre <= 0) c.prix = t('auth.champRequis')
    setChamps(c)
    if (Object.keys(c).length) return
    enregistrement.mutate({ nom: nom.trim(), prix_xof: prixNombre, categorie: categorie.trim() || null, couleur: versHex(couleur), sku: sku.trim() || null, actif })
  }

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && onFermer()}
      titre={article ? t('articles.modifier') : t('articles.ajouter')}
      taille="sm"
      pied={
        <>
          <Bouton variante="secondaire" voix="commun.annuler" onClick={onFermer}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton type="submit" form="formulaire-article" icone={<Check />} voix="commun.enregistrer" chargement={enregistrement.isPending}>
            {t('commun.enregistrer')}
          </Bouton>
        </>
      }
    >
      <form id="formulaire-article" onSubmit={soumettre} noValidate className="flex flex-col gap-3 pb-1">
        <Champ libelle={t('articles.nom')} value={nom} onChange={(e) => setNom(e.target.value)} erreur={champs.nom} autoFocus autoComplete="off" />
        <Champ
          libelle={t('articles.prix')}
          value={prix}
          onChange={(e) => setPrix(e.target.value.replace(/[^\d]/g, ''))}
          erreur={champs.prix}
          inputMode="numeric"
          suffixe={<span className="pr-2 text-sm text-texte-3">FCFA</span>}
          autoComplete="off"
          className="tabulaire"
        />
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle={t('articles.categorie')} mentionOptionnel={t('commun.optionnel')} value={categorie} onChange={(e) => setCategorie(e.target.value)} autoComplete="off" />
          <Champ libelle={t('articles.sku')} mentionOptionnel={t('commun.optionnel')} value={sku} onChange={(e) => setSku(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-texte-2">{t('articles.couleur')}</span>
          <div role="radiogroup" aria-label={t('articles.couleur')} className="grid grid-cols-8 gap-1.5">
            {COULEURS_ARTICLES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={couleur === c}
                aria-label={t(`articles.couleurs.${c}`)}
                onClick={() => setCouleur(c)}
                className={cn('flex h-9 items-center justify-center rounded-md border-2 transition-transform active:scale-95', classesTuile(c), couleur === c ? 'border-texte' : 'border-transparent')}
              >
                {couleur === c && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        <Interrupteur coche={actif} onChange={setActif} libelle={t('articles.actif')} voix="articles.actif" />
        <ErreurFormulaire message={erreur} />
      </form>
    </Dialogue>
  )
}
