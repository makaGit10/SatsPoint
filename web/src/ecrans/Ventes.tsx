import { useMutation } from '@tanstack/react-query'
import { ChevronDown, Download, ListFilter, Receipt, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FiltresVentes as TypeFiltres, VenteCourte } from '@/api/types'
import { CLE_VENTES, exporterVentes, useVentes } from '@/api/ventes'
import { peut, roleBoutique, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { cn } from '@/lib/cn'
import { formaterFCFA } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { DetailVente } from './ventes/DetailVente'
import { FILTRES_DEFAUT, filtresActifs } from './ventes/filtres'
import { FiltresVentes } from './ventes/FiltresVentes'
import { LigneVente, ListeVentes } from './ventes/LigneVente'

const DEBOUNCE_RECHERCHE = 300

/** Ventes : liste compacte, filtres, recherche, pagination par curseur, totaux, détail et actions, export CSV. */
export default function Ventes() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const caissier = roleBoutique(utilisateur) === 'caissier'
  const gestion = peut(utilisateur, ['proprietaire', 'gerant'])

  const [filtres, setFiltres] = useState<TypeFiltres>({ ...FILTRES_DEFAUT })
  const [recherche, setRecherche] = useState('')
  const [filtresVisibles, setFiltresVisibles] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

  // Recherche avec délai : le filtre `q` ne change qu'après 300 ms sans frappe.
  useEffect(() => {
    const id = setTimeout(() => {
      const q = recherche.trim()
      setFiltres((f) => {
        if ((f.q ?? '') === q) return f
        const suivant = { ...f }
        if (q) suivant.q = q
        else delete suivant.q
        return suivant
      })
    }, DEBOUNCE_RECHERCHE)
    return () => clearTimeout(id)
  }, [recherche])

  const requete = useVentes(filtres)
  useDonneesEnDirect(['ventes', 'paiements'], () => void queryClient.invalidateQueries({ queryKey: CLE_VENTES }))

  const pages = requete.data?.pages
  const ventes = useMemo(() => (pages ?? []).flatMap((p) => p.ventes), [pages])
  const totaux = pages?.[0]?.totaux
  const nombrePages = pages?.length ?? 0
  const caissiers = useMemo(() => {
    const vus = new Map<string, string>()
    for (const v of ventes) vus.set(v.caissier.ulid, v.caissier.nom)
    if (filtres.caissier && !vus.has(filtres.caissier)) vus.set(filtres.caissier, filtres.caissier)
    return [...vus].map(([ulid, nom]) => ({ ulid, nom })).sort((a, b) => a.nom.localeCompare(b.nom))
  }, [ventes, filtres.caissier])

  const actifs = filtresActifs(filtres)

  const exportation = useMutation({
    mutationFn: () => exporterVentes(filtres),
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
              <BoutonIcone
                libelle={t('ventes.exporterCsv')}
                icone={<Download className={cn(exportation.isPending && 'animate-pulse')} />}
                voix="ventes.exporter"
                variante="secondaire"
                disabled={exportation.isPending}
                onClick={() => exportation.mutate()}
              />
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-2">
        <Champ
          libelle={t('ventes.rechercher')}
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
        {filtresVisibles && <FiltresVentes filtres={filtres} onChange={setFiltres} caissiers={caissiers} restreint={caissier} />}
      </div>

      {totaux && (
        <dl className="mb-3 grid grid-cols-3 divide-x divide-bordure rounded-lg border border-bordure bg-surface py-2 text-center">
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
      ) : ventes.length === 0 ? (
        <EtatVide icone={<Receipt />} titre={t('ventes.vide.titre')} texte={actifs ? t('ventes.vide.filtres') : t('ventes.vide.texte')} />
      ) : (
        <>
          <ListeVentes aria-label={t('ventes.titre')}>
            {ventes.map((v) => (
              <LigneVente key={v.ulid} vente={v} onOuvrir={ouvrir} sansCaissier={caissier} />
            ))}
          </ListeVentes>
          <div className="mt-3 flex justify-center">
            {requete.hasNextPage ? (
              <Bouton variante="secondaire" icone={<ChevronDown />} voix="ventes.voirPlus" chargement={requete.isFetchingNextPage} onClick={() => void requete.fetchNextPage()}>
                {t('ventes.voirPlus')}
              </Bouton>
            ) : (
              nombrePages > 1 && <p className="text-xs text-texte-3">{t('ventes.finListe')}</p>
            )}
          </div>
        </>
      )}

      <DetailVente ulid={detail} onFermer={() => setDetail(null)} gestion={gestion} />
    </div>
  )
}
