import { useMutation } from '@tanstack/react-query'
import { Camera, Check, ChevronDown, Images, Shapes, X } from 'lucide-react'
import { type ChangeEvent, type FormEvent, lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_ARTICLES } from '@/api/articles'
import { creerArticle, envoyerPhotoArticle, envoyerVoixArticle, modifierArticle, supprimerPhotoArticle, supprimerVoixArticle, type CorpsArticle } from '@/api/articlesEcriture'
import { ErreurApi } from '@/api/client'
import type { Article } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { Interrupteur } from '@/composants/Interrupteur'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { Pave } from '@/ecrans/caisse/Pave'
import { cn } from '@/lib/cn'
import { classesTuile, COULEURS_ARTICLES, couleurDepuis, versHex, type CouleurArticle } from '@/lib/couleursArticles'
import { formaterNombre } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { jouerGuide } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'
import { useVoix } from '@/voix/store'
import { EnregistreurNom, type ValeurVoix } from './EnregistreurNom'
import { GaleriePictogrammes } from './GaleriePictogrammes'
import { ErreurPhoto, preparerPhoto } from './photo'
import { VignetteArticle } from './VignetteArticle'

const DicteePrix = lazy(() => import('@/voix/DicteePrix'))

interface ValeurPhoto {
  url: string
  blob?: Blob
}

/** Étape suivante du guide vocal : ce qui manque encore, dans l'ordre où on le fait. */
export type EtapeGuide = 'visuel' | 'nom' | 'prix' | 'enregistrer'

export function etapeGuide({ visuel, nom, prix }: { visuel: boolean; nom: boolean; prix: boolean }): EtapeGuide {
  if (!visuel) return 'visuel'
  if (!nom) return 'nom'
  if (!prix) return 'prix'
  return 'enregistrer'
}

/**
 * Guide vocal du formulaire (création) : annonce l'étape suivante quand elle change, si l'aide vocale est active.
 * `jouerGuide` (aide vocale guidée) lit l'enregistrement publié au studio dans la langue de la personne, sinon le
 * texte par la voix du téléphone : le guide parle dès aujourd'hui, avant même l'enregistrement des audios.
 */
const CLES_GUIDE: Record<EtapeGuide, string> = {
  visuel: 'guide.formulaireArticle.debut',
  nom: 'guide.formulaireArticle.nom',
  prix: 'guide.formulaireArticle.prix',
  enregistrer: 'guide.formulaireArticle.enregistrer',
}

function useGuideArticle(etape: EtapeGuide, actif: boolean) {
  useEffect(() => {
    if (!actif || !useVoix.getState().activee) return
    const minuterie = setTimeout(() => void jouerGuide(CLES_GUIDE[etape]), 350)
    return () => clearTimeout(minuterie)
  }, [etape, actif])
}

/** Codes d'erreur des fichiers → message utile (le texte du serveur est en français : on traduit ici). */
const MESSAGES_CODES: Record<string, string> = {
  PHOTO_TYPE_INVALIDE: 'articles.form.photoIllisible',
  PHOTO_ILLISIBLE: 'articles.form.photoIllisible',
  PHOTO_TROP_GRANDE: 'articles.form.photoIllisible',
  AUDIO_TYPE_INVALIDE: 'articles.form.voixIllisible',
  AUDIO_ILLISIBLE: 'articles.form.voixIllisible',
  AUDIO_TROP_LONG: 'articles.form.voixIllisible',
  ARTICLE_SANS_IDENTITE: 'articles.form.identiteRequise',
}

function Section({ titre, voix, mention, children, className }: { titre: string; voix: string; mention?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className="flex items-center gap-1 text-sm font-bold text-texte">
        {titre}
        <HautParleur cle={voix} />
        {mention && <span className="ml-auto text-xs font-normal text-texte-3">{mention}</span>}
      </h3>
      {children}
    </section>
  )
}

/**
 * Créer ou modifier un article SANS ÉCRIRE (CONTRAT_API § 15) : photo prise au téléphone ou pictogramme,
 * nom dit à voix haute, prix tapé sur le grand pavé de la caisse. Le nom écrit reste possible pour qui lit.
 * Chaque titre et chaque bouton a son haut-parleur ; le guide vocal annonce l'étape suivante.
 */
export default function FormulaireArticle({ article, onFermer }: { article: Article | null; onFermer: () => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours()

  const [photo, setPhoto] = useState<ValeurPhoto | null>(article?.photo_url ? { url: article.photo_url } : null)
  const [photoEnCours, setPhotoEnCours] = useState(false)
  const [pictogramme, setPictogramme] = useState<string | null>(article?.pictogramme ?? null)
  const [galerie, setGalerie] = useState(false)
  const [voix, setVoix] = useState<ValeurVoix | null>(article?.voix_url ? { url: article.voix_url } : null)
  const [prix, setPrix] = useState(article ? String(article.prix_xof) : '')
  const [nom, setNom] = useState(article?.nom ?? '')
  const [couleur, setCouleur] = useState<CouleurArticle>(article?.couleur ? couleurDepuis(article.couleur) : 'orange')
  const [categorie, setCategorie] = useState(article?.categorie ?? '')
  const [sku, setSku] = useState(article?.sku ?? '')
  const [actif, setActif] = useState(article?.actif ?? true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [champs, setChamps] = useState<{ nom?: string; prix?: string; photo?: string }>({})
  const camera = useRef<HTMLInputElement>(null)
  const fichiers = useRef<HTMLInputElement>(null)
  const urlsLocales = useRef<string[]>([])

  useEffect(() => () => urlsLocales.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const etape = etapeGuide({ visuel: Boolean(photo || pictogramme), nom: Boolean(voix || nom.trim()), prix: Number(prix) > 0 })
  useGuideArticle(etape, !article)

  const choisirPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    setPhotoEnCours(true)
    setChamps((c) => ({ ...c, photo: undefined }))
    try {
      const blob = await preparerPhoto(fichier)
      const url = URL.createObjectURL(blob)
      urlsLocales.current.push(url)
      setPhoto({ url, blob })
      setGalerie(false)
    } catch (err) {
      setChamps((c) => ({ ...c, photo: t(err instanceof ErreurPhoto && err.motif === 'lourde' ? 'articles.form.photoTropLourde' : 'articles.form.photoIllisible') }))
    } finally {
      setPhotoEnCours(false)
    }
  }

  const enregistrement = useMutation({
    mutationFn: async (corps: CorpsArticle) => {
      if (!article) return void (await creerArticle(corps, { photo: photo?.blob, voix: voix?.blob }))
      // Modification : ajouts d'abord (l'article garde toujours une identité côté serveur), puis les champs, puis les retraits.
      if (photo?.blob) await envoyerPhotoArticle(article.ulid, photo.blob)
      if (voix?.blob) await envoyerVoixArticle(article.ulid, voix.blob)
      await modifierArticle(article.ulid, corps)
      if (article.photo_url && !photo) await supprimerPhotoArticle(article.ulid)
      if (article.voix_url && !voix) await supprimerVoixArticle(article.ulid)
    },
    onSuccess: () => {
      notifier({ type: 'succes', titre: t('articles.enregistre'), voix: 'articles.enregistre' })
      void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES })
      onFermer()
    },
    onError: (e) => {
      void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES })
      const cle = e instanceof ErreurApi && e.code ? MESSAGES_CODES[e.code] : undefined
      if (e instanceof ErreurApi && e.estValidation && !cle) setChamps({ nom: e.champ('nom'), prix: e.champ('prix_xof'), photo: e.champ('photo') ?? e.champ('fichier') })
      setErreur(cle ? t(cle) : messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const c: typeof champs = {}
    const prixNombre = Number(prix)
    if (!nom.trim() && !pictogramme && !photo && !voix) c.nom = t('articles.form.identiteRequise')
    if (!Number.isInteger(prixNombre) || prixNombre <= 0) c.prix = t('articles.form.prixRequis')
    setChamps(c)
    if (Object.keys(c).length) {
      setErreur(c.nom ?? c.prix ?? null)
      return
    }
    enregistrement.mutate({ nom: nom.trim() || null, prix_xof: prixNombre, categorie: categorie.trim() || null, couleur: versHex(couleur), pictogramme, sku: sku.trim() || null, actif })
  }

  const apercu = useMemo(() => ({ photo_url: photo?.url ?? null, pictogramme, couleur: versHex(couleur) }), [photo, pictogramme, couleur])

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && onFermer()}
      titre={article ? t('articles.modifier') : t('articles.ajouter')}
      voix={article ? 'articles.modifier' : 'articles.ajouter'}
      taille="lg"
      pied={
        <>
          <Bouton variante="secondaire" voix="commun.annuler" onClick={onFermer}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton type="submit" form="formulaire-article" icone={<Check />} voix="commun.enregistrer" chargement={enregistrement.isPending} disabled={photoEnCours}>
            {t('commun.enregistrer')}
          </Bouton>
        </>
      }
    >
      {/* Mobile : une colonne dans l'ordre du guide. Bureau : le pavé du prix à droite, tout tient sans défiler. */}
      <form id="formulaire-article" onSubmit={soumettre} noValidate className="flex flex-col gap-5 pb-1 md:grid md:grid-cols-[minmax(0,1fr)_16.5rem] md:items-start md:gap-x-7 md:gap-y-4 [&>*]:md:col-start-1" data-etape-guide={etape}>
        {/* 1. Photo ou image */}
        <Section titre={t('articles.form.etapeVisuel')} voix="articles.form.etapeVisuel">
          <div className="flex items-start gap-3">
            <div className="relative">
              <VignetteArticle article={apercu} taille="lg" className={cn(!photo && !pictogramme && 'opacity-60')} />
              {(photo || pictogramme) && (
                <span className="absolute -top-2 -right-2">
                <BoutonIcone
                  taille="sm"
                  variante="secondaire"
                  libelle={photo ? t('articles.form.retirerPhoto') : t('articles.form.retirerImage')}
                  icone={<X />}
                  voix={photo ? 'articles.form.retirerPhoto' : 'articles.form.retirerImage'}
                  onClick={() => (photo ? setPhoto(null) : setPictogramme(null))}
                  className="shadow-sm"
                  sansInfobulle
                />
                </span>
              )}
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <Bouton variante="secondaire" taille="sm" icone={<Camera />} voix="articles.form.prendrePhoto" onClick={() => camera.current?.click()} chargement={photoEnCours} className="justify-start">
                {t('articles.form.prendrePhoto')}
              </Bouton>
              <div className="grid grid-cols-2 gap-2">
                <Bouton variante="secondaire" taille="sm" icone={<Images />} voix="articles.form.galerie" onClick={() => fichiers.current?.click()} disabled={photoEnCours}>
                  {t('articles.form.galerie')}
                </Bouton>
                <Bouton variante={galerie ? 'primaire' : 'secondaire'} taille="sm" icone={<Shapes />} voix="articles.form.images" onClick={() => setGalerie((g) => !g)} aria-expanded={galerie} aria-label={t('articles.form.choisirImage')}>
                  {t('articles.form.images')}
                </Bouton>
              </div>
            </div>
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choisirPhoto} data-entree-photo="camera" />
          <input ref={fichiers} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choisirPhoto} data-entree-photo="galerie" />
          {champs.photo && (
            <p role="alert" className="rounded-md bg-danger-doux px-2.5 py-1.5 text-xs font-medium text-danger-texte">
              {champs.photo}
            </p>
          )}
          {galerie && (
            <div className="rounded-2xl border border-bordure bg-surface-2/60 p-2.5">
              <GaleriePictogrammes
                valeur={pictogramme}
                onChoisir={(p) => {
                  setPictogramme(p.id)
                  setCouleur(p.couleur)
                  setGalerie(false)
                }}
              />
            </div>
          )}
        </Section>

        {/* 2. Nom dit à voix haute */}
        <Section titre={t('articles.form.etapeNom')} voix="articles.form.etapeNom">
          <EnregistreurNom valeur={voix} onChange={setVoix} />
        </Section>

        {/* 3. Prix sur le grand pavé */}
        <Section titre={t('articles.form.etapePrix')} voix="articles.form.etapePrix" className="md:col-start-2! md:row-span-6 md:row-start-1">
          <label className="sr-only" htmlFor="prix-article">
            {t('articles.prix')}
          </label>
          <div className={cn('flex items-baseline justify-center gap-1.5 rounded-2xl border bg-surface px-4 py-2', champs.prix ? 'border-danger' : 'border-bordure')}>
            <input
              id="prix-article"
              value={prix ? formaterNombre(Number(prix)) : ''}
              placeholder="0"
              inputMode="none"
              autoComplete="off"
              onChange={(e) => setPrix(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9))}
              aria-invalid={Boolean(champs.prix)}
              className="w-full min-w-0 bg-transparent text-right text-4xl font-extrabold text-texte tabulaire outline-none placeholder:text-texte-3"
            />
            <span className="text-lg font-bold text-accent-texte">FCFA</span>
          </div>
          <Pave valeur={prix} onChange={setPrix} className="gap-2 [&_button]:h-12 md:[&_button]:h-11" />
          <Suspense fallback={null}>
            <DicteePrix onPrix={(n) => setPrix(String(n))} pleineLargeur />
          </Suspense>
        </Section>

        {/* 4. Nom écrit (pour qui lit) */}
        <Champ
          libelle={t('articles.form.etapeNomEcrit')}
          voix="articles.form.etapeNomEcrit"
          mentionOptionnel={t('commun.optionnel')}
          aide={t('articles.form.nomFacultatif')}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          erreur={champs.nom}
          maxLength={120}
          autoComplete="off"
        />

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-sm font-semibold text-texte-2">
            {t('articles.couleur')}
            <HautParleur cle="articles.couleur" />
          </span>
          <div role="radiogroup" aria-label={t('articles.couleur')} className="grid grid-cols-8 gap-1.5">
            {COULEURS_ARTICLES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={couleur === c}
                aria-label={t(`articles.couleurs.${c}`)}
                onClick={() => setCouleur(c)}
                className={cn('flex h-10 items-center justify-center rounded-lg border-2 transition-transform active:scale-95', classesTuile(c), couleur === c ? 'border-texte' : 'border-transparent')}
              >
                {couleur === c && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>

        <Interrupteur coche={actif} onChange={setActif} libelle={t('articles.actif')} voix="articles.actif" />

        <details className="group rounded-xl border border-bordure px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-texte-2 select-none">
            {t('articles.form.plusOptions')}
            <HautParleur cle="articles.form.plusOptions" />
            <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Champ libelle={t('articles.categorie')} voix="articles.categorie" mentionOptionnel={t('commun.optionnel')} value={categorie} onChange={(e) => setCategorie(e.target.value)} autoComplete="off" maxLength={60} />
            <Champ libelle={t('articles.sku')} voix="articles.sku" mentionOptionnel={t('commun.optionnel')} value={sku} onChange={(e) => setSku(e.target.value)} autoComplete="off" maxLength={40} />
          </div>
        </details>

        <ErreurFormulaire message={erreur} />
      </form>
    </Dialogue>
  )
}
