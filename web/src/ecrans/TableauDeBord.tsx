import { ArrowRight, LayoutDashboard, Receipt, ShoppingBag, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CLE_TABLEAU, PERIODES_TABLEAU, useTableauDeBord, type PeriodeTableau } from '@/api/tableauDeBord'
import type { VenteCourte } from '@/api/types'
import { peut, roleBoutique, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Segment } from '@/composants/Segment'
import { Squelette, SqueletteIndicateurs, SqueletteListe } from '@/composants/Squelette'
import { cn } from '@/lib/cn'
import { formaterFCFA } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { formaterPourcentage } from '@/lib/temps'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { Courbe } from './tableau/Courbe'
import { DetailVente } from './ventes/DetailVente'
import { CLE_PERIODE } from './ventes/filtres'
import { LigneVente, ListeVentes } from './ventes/LigneVente'
import { useGuideVocal } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'

function Indicateur({ libelle, valeur, icone, ton = 'neutre', detail }: { libelle: string; valeur: ReactNode; icone: ReactNode; ton?: 'accent' | 'succes' | 'mm' | 'neutre'; detail?: ReactNode }) {
  const tons = { accent: 'bg-accent-doux text-accent-texte', succes: 'bg-succes-doux text-succes-texte', mm: 'bg-mm-doux text-mm-texte', neutre: 'bg-neutre-doux text-neutre-texte' }
  return (
    <Carte rembourrage="sm" className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-texte-3">
        <span className={cn('inline-flex size-5 items-center justify-center rounded-sm [&>svg]:size-3', tons[ton])} aria-hidden="true">
          {icone}
        </span>
        <span className="truncate">{libelle}</span>
      </div>
      <p className="truncate text-xl font-semibold text-texte tabulaire md:text-2xl">{valeur}</p>
      {detail && <div className="min-h-4 text-xs">{detail}</div>}
    </Carte>
  )
}

/** Tableau de bord : indicateurs compacts, répartition, courbe maison, dernières ventes en direct. */
export default function TableauDeBord() {
  const { t, i18n } = useTranslation()
  useGuideVocal('guide.tableau')
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const caissier = roleBoutique(utilisateur) === 'caissier'
  const gestion = peut(utilisateur, ['proprietaire', 'gerant'])
  const [periode, setPeriode] = useState<PeriodeTableau>('aujourdhui')
  const [detail, setDetail] = useState<string | null>(null)

  const periodeEffective: PeriodeTableau = caissier ? 'aujourdhui' : periode
  const { data, isPending, isError, refetch } = useTableauDeBord(periodeEffective)
  useDonneesEnDirect(['ventes', 'paiements'], () => void queryClient.invalidateQueries({ queryKey: CLE_TABLEAU }))

  const total = data ? data.repartition.lightning.montant_xof + data.repartition.mobile_money.montant_xof : 0
  const partLightning = total > 0 ? Math.round((data!.repartition.lightning.montant_xof / total) * 100) : 0
  const comparaison = data?.comparaison_pct ?? null
  const ouvrir = (v: VenteCourte) => setDetail(v.ulid)

  return (
    <div className="anim-apparition flex flex-col gap-3" data-ecran="tableau-de-bord">
      <EnTetePage titre={t('tableau.titre')} sousTitre={caissier ? t('tableau.mesChiffresDuJour') : undefined} voix="tableau.titre" className="mb-0" />

      {!caissier && (
        <Segment<PeriodeTableau>
          libelle={t('periodes.titre')}
          taille="sm"
          valeur={periode}
          onChange={setPeriode}
          options={PERIODES_TABLEAU.map((p) => ({ valeur: p, libelle: t(CLE_PERIODE[p]), voix: `periodes.${CLE_PERIODE[p].slice('periodes.'.length)}` }))}
          className="md:w-auto md:self-start"
        />
      )}

      {isPending ? (
        <div className="flex flex-col gap-3" data-chargement="tableau-de-bord" aria-busy="true">
          <SqueletteIndicateurs nombre={4} className="md:grid-cols-4" />
          <Squelette className="h-32 w-full rounded-lg" />
          <SqueletteListe lignes={4} />
        </div>
      ) : isError || !data ? (
        <EtatVide
          ton="neutre"
          icone={<LayoutDashboard />}
          titre={t('erreurs.inattendue')}
          action={
            <Bouton variante="secondaire" voix="commun.reessayer" onClick={() => void refetch()}>
              {t('commun.reessayer')}
            </Bouton>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Indicateur
              libelle={periodeEffective === 'aujourdhui' ? t('tableau.chiffreDuJour') : t('tableau.chiffreAffaires')}
              valeur={formaterFCFA(data.chiffre_affaires_xof)}
              icone={<Wallet />}
              ton="accent"
              detail={
                comparaison !== null && (
                  <span className={cn('inline-flex items-center gap-1 font-medium', comparaison >= 0 ? 'text-succes-texte' : 'text-danger-texte')}>
                    {comparaison >= 0 ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                    <span className="tabulaire">{formaterPourcentage(comparaison)}</span>
                    <span className="hidden font-normal text-texte-3 lg:inline">{t('tableau.vsPrecedente')}</span>
                  </span>
                )
              }
            />
            <Indicateur libelle={t('tableau.nombreVentes')} valeur={data.nombre_ventes} icone={<Receipt />} ton="succes" />
            <Indicateur libelle={t('tableau.panierMoyen')} valeur={formaterFCFA(data.panier_moyen_xof)} icone={<ShoppingBag />} ton="neutre" />
            <Carte rembourrage="sm" className="flex min-w-0 flex-col gap-1.5">
              <p className="text-xs text-texte-3">{t('tableau.repartition')}</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${t('tableau.bitcoin')} ${partLightning} % · ${t('tableau.mobileMoney')} ${100 - partLightning} %`}>
                {total > 0 && (
                  <>
                    <span className="h-full bg-accent" style={{ width: `${partLightning}%` }} />
                    <span className="h-full bg-mm" style={{ width: `${100 - partLightning}%` }} />
                  </>
                )}
              </div>
              <dl className="flex flex-col gap-0.5 text-xs tabulaire">
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1 whitespace-nowrap text-texte-3">
                    <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {t('tableau.bitcoin')}
                  </dt>
                  <dd className="shrink-0 font-medium text-texte">{formaterFCFA(data.repartition.lightning.montant_xof)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1 whitespace-nowrap text-texte-3">
                    <span className="size-1.5 rounded-full bg-mm" aria-hidden="true" />
                    {t('tableau.mobileMoney')}
                  </dt>
                  <dd className="shrink-0 font-medium text-texte">{formaterFCFA(data.repartition.mobile_money.montant_xof)}</dd>
                </div>
              </dl>
            </Carte>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
            <Carte rembourrage="sm">
              <CarteEnTete titre={t('tableau.courbe')} className="mb-1" />
              <Courbe serie={data.serie} />
            </Carte>

            <Carte rembourrage="sm" className="flex flex-col">
              <CarteEnTete
                titre={t('tableau.dernieresVentes')}
                className="mb-2"
                actions={
                  <span className="inline-flex items-center gap-0.5">
                    <Link to="/ventes" className="inline-flex items-center gap-1 text-sm font-medium text-accent-texte hover:underline">
                      {t('tableau.voirVentes')}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                    <HautParleur cle="tableau.voirVentes" />
                  </span>
                }
              />
              {data.dernieres_ventes.length === 0 ? (
                <p className="py-4 text-center text-sm text-texte-3">{t('tableau.vide.texte')}</p>
              ) : (
                <ListeVentes aria-label={t('tableau.dernieresVentes')} compacte>
                  {data.dernieres_ventes.map((v) => (
                    <LigneVente key={v.ulid} vente={v} onOuvrir={ouvrir} sansCaissier={caissier} compacte />
                  ))}
                </ListeVentes>
              )}
            </Carte>
          </div>
        </>
      )}

      <DetailVente ulid={detail} onFermer={() => setDetail(null)} gestion={gestion} />
    </div>
  )
}
