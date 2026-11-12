import { useMutation } from '@tanstack/react-query'
import { Download, FileSpreadsheet, FileText, ListFilter, Receipt, Search, Sheet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import type { FormatExport } from '@/api/exports'
import type { FiltresVentes as TypeFiltres, VenteCourte } from '@/api/types'
import { CLE_VENTES, exporterVentes, useVentes, VENTES_PAR_PAGE } from '@/api/ventes'
import { peut, roleBoutique, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Menu } from '@/composants/Menu'
import { Pagination } from '@/composants/Pagination'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { cn } from '@/lib/cn'
import { formaterFCFA } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useCorrectionPage, usePageUrl } from '@/lib/usePagination'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { DetailVente } from './ventes/DetailVente'
import { FILTRES_DEFAUT, filtresActifs } from './ventes/filtres'
import { FiltresVentes } from './ventes/FiltresVentes'
import { LigneVente, ListeVentes } from './ventes/LigneVente'
import { useGuideVocal } from '@/voix/guide'

const DEBOUNCE_RECHERCHE = 300

/** Ventes : liste compacte, filtres, recherche, pagination par numéro de page (`?page=`), totaux, détail et actions, export. */
export default function Ventes() {
  const { t, i18n } = useTranslation()
  useGuideVocal('guide.ventes')
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const caissier = roleBoutique(utilisateur) === 'caissier'
  const gestion = peut(utilisateur, ['proprietaire', 'gerant'])

  const [filtres, setFiltres] = useState<TypeFiltres>({ ...FILTRES_DEFAUT })
  const { page, allerA, reinitialiser } = usePageUrl()
  const haut = useRef<HTMLDivElement>(null)
  // Un filtre qui change ramène à la page 1 (dans le même rendu : une seule requête).
  const changerFiltres = (suivants: TypeFiltres) => {
    setFiltres(suivants)
    reinitialiser()
  }
  const [recherche, setRecherche] = useState('')
  const [filtresVisibles, setFiltresVisibles] = useState(false)
  const [params, setParams] = useSearchParams()
  const [detail, setDetail] = useState<string | null>(() => params.get('vente'))

  // Lien direct (recherche globale) : `/ventes?vente=…` ouvre le détail (ajusté au rendu), puis l'adresse est nettoyée.
  const venteDemandee = params.get('vente')
  const [venteVue, setVenteVue] = useState(venteDemandee)
  if (venteDemandee && venteDemandee !== venteVue) {
    setVenteVue(venteDemandee)
    setDetail(venteDemandee)
  }
  useEffect(() => {
    if (!venteDemandee) return
    const suivant = new URLSearchParams(params)
    suivant.delete('vente')
    setParams(suivant, { replace: true })
  }, [venteDemandee, params, setParams])

  // Recherche avec délai : le filtre `q` ne change qu'après 300 ms sans frappe (et ramène à la page 1).
  const qActuel = filtres.q ?? ''
  useEffect(() => {
    const q = recherche.trim()
    if (q === qActuel) return
    const id = setTimeout(() => {
      setFiltres((f) => {
        const suivant = { ...f }
        if (q) suivant.q = q
        else delete suivant.q
        return suivant
      })
      reinitialiser()
    }, DEBOUNCE_RECHERCHE)
    return () => clearTimeout(id)
  }, [recherche, qActuel, reinitialiser])

  const requete = useVentes(filtres, page)
  // Rechargement silencieux de la page courante (filtres et page conservés).
  useDonneesEnDirect(['ventes', 'paiements'], () => void queryClient.invalidateQueries({ queryKey: CLE_VENTES }))

  const donnees = requete.data
  const ventes = useMemo(() => donnees?.ventes ?? [], [donnees])
  const totaux = donnees?.totaux
  const pagination = donnees?.pagination
  useCorrectionPage(pagination, allerA)
  const caissiers = useMemo(() => {
    const vus = new Map<string, string>()
    for (const v of ventes) vus.set(v.caissier.ulid, v.caissier.nom)
    if (filtres.caissier && !vus.has(filtres.caissier)) vus.set(filtres.caissier, filtres.caissier)
    return [...vus].map(([ulid, nom]) => ({ ulid, nom })).sort((a, b) => a.nom.localeCompare(b.nom))
  }, [ventes, filtres.caissier])

  const actifs = filtresActifs(filtres)

  const exportation = useMutation({
    mutationFn: (format: FormatExport) => exporterVentes(filtres, format),
    onSuccess: () => notifier({ type: 'succes', titre: t('ventes.exportOk'), voix: 'ventes.exportOk' }),
    onError: () => notifier({ type: 'erreur', titre: t('ventes.exportErreur'), voix: 'ventes.exportErreur' }),
  })

  const ouvrir = (v: VenteCourte) => setDetail(v.ulid)

  return (
    <div className="anim-apparition flex flex-col" data-ecran="ventes">
      <EnTetePage
        titre={t('ventes.titre')}
        sousTitre={caissier ? t('ventes.mesVentesDuJour') : undefined}
        voix="ventes.titre"
        actions={
          <>
            <BoutonIcone libelle={t('ventes.filtrer')} icone={<ListFilter />} voix="ventes.filtrer" actif={filtresVisibles || actifs} onClick={() => setFiltresVisibles((v) => !v)} />
            {gestion && (
              <Menu
                libelle={t('ventes.exporter')}
                icone={<Download />}
                voix="ventes.exporter"
                titre={actifs ? t('export.titreFiltres') : t('export.titre')}
                occupe={exportation.isPending}
                elements={[
                  { id: 'csv', libelle: t('export.csv'), detail: t('export.csvDetail'), icone: <FileText />, voix: 'export.csv', onChoisir: () => exportation.mutate('csv') },
                  { id: 'xlsx', libelle: t('export.xlsx'), detail: t('export.xlsxDetail'), icone: <FileSpreadsheet />, voix: 'export.xlsx', onChoisir: () => exportation.mutate('xlsx') },
                  { id: 'pdf', libelle: t('export.pdf'), detail: t('export.pdfDetail'), icone: <Sheet />, voix: 'export.pdf', onChoisir: () => exportation.mutate('pdf') },
                ]}
              />
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-2">
        <Champ
          libelle={t('ventes.rechercher')} voix="ventes.rechercher"
          type="search"
          inputMode="search"
          icone={<Search />}
          placeholder={t('ventes.rechercher')}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 md:h-9"
          classeConteneur="[&>label]:sr-only"
          autoComplete="off"
        />
        {filtresVisibles && <FiltresVentes filtres={filtres} onChange={changerFiltres} caissiers={caissiers} restreint={caissier} />}
      </div>

      {totaux && (
        <dl className="mb-3 grid grid-cols-3 divide-x divide-bordure verre rounded-xl py-2 text-center">
          <div className="px-2">
            <dt className="text-xs text-texte-3">{t('ventes.titre')}</dt>
            <dd className="text-base font-semibold text-texte tabulaire">{t('ventes.nombre', { count: totaux.nombre })}</dd>
          </div>
          <div className="px-2">
            <dt className="text-xs text-texte-3">{t('ventes.total')}</dt>
            <dd className="truncate text-base font-semibold text-texte tabulaire">{formaterFCFA(totaux.montant_xof)}</dd>
          </div>
          <div className="px-2">
            <dt className="text-xs text-texte-3">{t('ventes.encaisse')}</dt>
            <dd className="truncate text-base font-semibold text-succes-texte tabulaire">{formaterFCFA(totaux.payees_xof)}</dd>
          </div>
        </dl>
      )}

      {requete.isPending ? (
        <div data-chargement="ventes" aria-busy="true">
          <SqueletteListe lignes={6} />
        </div>
      ) : requete.isError ? (
        <EtatVide
          ton="neutre"
          icone={<Receipt />}
          titre={t('erreurs.inattendue')}
          action={
            <Bouton variante="secondaire" voix="commun.reessayer" onClick={() => void requete.refetch()}>
              {t('commun.reessayer')}
            </Bouton>
          }
        />
      ) : ventes.length === 0 && (pagination?.total ?? 0) === 0 ? (
        <EtatVide icone={<Receipt />} titre={t('ventes.vide.titre')} texte={actifs ? t('ventes.vide.filtres') : t('ventes.vide.texte')} />
      ) : (
        <div ref={haut} className={cn('transition-opacity duration-150', requete.isPlaceholderData && 'opacity-70')}>
          <ListeVentes aria-label={t('ventes.titre')}>
            {ventes.map((v) => (
              <LigneVente key={v.ulid} vente={v} onOuvrir={ouvrir} sansCaissier={caissier} />
            ))}
          </ListeVentes>
          {pagination && (
            <Pagination
              page={page}
              parPage={pagination.par_page || VENTES_PAR_PAGE}
              total={pagination.total}
              pages={pagination.pages}
              onChange={allerA}
              ancre={haut}
              chargement={requete.isPlaceholderData}
            />
          )}
        </div>
      )}

      <DetailVente ulid={detail} onFermer={() => setDetail(null)} gestion={gestion} />
    </div>
  )
}
