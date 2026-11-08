import { ArrowRight, Mic, Receipt, Store, Timer, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatistiquesAdmin } from '@/api/admin'
import type { LangueAudio } from '@/api/types'
import { BoutonLien } from '@/composants/Bouton'
import { Carte } from '@/composants/Carte'
import { SqueletteIndicateurs } from '@/composants/Squelette'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

const NOMS: Record<LangueAudio, string> = { wo: 'Wolof', srr: 'Sérère', ff: 'Pulaar', dyo: 'Diola', fr: 'Français' }

function formaterDecimal(valeur: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 }).format(valeur)
}

function Indicateur({ icone, libelle, valeur, aide, voix }: { icone: ReactNode; libelle: string; valeur: ReactNode; aide?: string; voix: string }) {
  return (
    <Carte rembourrage="sm" className="flex flex-col gap-1">
      <span className="flex items-start gap-1.5 text-xs leading-tight font-medium text-texte-3 [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0">
        {icone}
        <span className="min-w-0">{libelle}</span>
        <HautParleur cle={voix} className="-my-2 ml-auto" />
      </span>
      <span className="text-2xl font-semibold tracking-tight text-texte tabulaire">{valeur}</span>
      {aide && <span className="text-2xs text-texte-3">{aide}</span>}
    </Carte>
  )
}

/** Indicateurs du pitch (adoption) + couverture audio. Aucun montant des boutiques. */
export function VueEnsemble({ actif }: { actif: boolean }) {
  const { t, i18n } = useTranslation()
  const { data, isPending } = useStatistiquesAdmin()
  if (!actif) return null
  if (isPending || !data)
    return (
      <div data-chargement="statistiques" aria-busy="true">
        <SqueletteIndicateurs nombre={4} />
      </div>
    )

  const delai = data.delai_median_confirmation_ms
  const sats = Math.round(data.part_sats_pct)
  const mm = Math.round(data.part_mobile_money_pct)
  const couverture = Object.entries(data.couverture_audio) as Array<[LangueAudio, number]>

  return (
    <div className="flex flex-col gap-3" data-vue="ensemble">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicateur icone={<Store />} libelle={t('admin.stats.actifs')} valeur={data.commercants_actifs_semaine} aide={t('admin.stats.actifsAide')} voix="admin.stats.actifs" />
        <Indicateur icone={<Receipt />} libelle={t('admin.stats.paiements')} valeur={formaterDecimal(data.paiements_par_commercant_semaine, i18n.language)} aide={t('admin.stats.paiementsAide')} voix="admin.stats.paiements" />
        <Indicateur
          icone={<Timer />}
          libelle={t('admin.stats.delai')}
          valeur={delai === null ? '—' : t('admin.stats.secondes', { valeur: formaterDecimal(delai / 1000, i18n.language) })}
          aide={t('admin.stats.delaiAide')}
          voix="admin.stats.delai"
        />
        <Carte rembourrage="sm" className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-texte-3">
            <Zap size={14} aria-hidden="true" />
            <span className="truncate">{t('admin.stats.repartition')}</span>
            <HautParleur cle="admin.stats.repartition" className="-my-2 ml-auto" />
          </span>
          <span className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={t('admin.stats.repartitionAria', { sats, mm })}>
            <span className="bg-accent" style={{ width: `${sats}%` }} />
            <span className="bg-mm" style={{ width: `${mm}%` }} />
          </span>
          <span className="mt-1 flex justify-between text-xs tabulaire">
            <span className="flex items-center gap-1 text-accent-texte">
              <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
              {t('admin.stats.sats', { pct: sats })}
            </span>
            <span className="flex items-center gap-1 text-mm-texte">
              <span className="size-2 rounded-full bg-mm" aria-hidden="true" />
              {t('admin.stats.mobileMoney', { pct: mm })}
            </span>
          </span>
        </Carte>
      </div>

      <Carte rembourrage="sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-texte">
            <Mic size={15} className="text-texte-3" aria-hidden="true" />
            {t('admin.stats.couverture')}
          </h2>
          <BoutonLien to="/admin/studio" variante="fantome" taille="sm" iconeDroite={<ArrowRight />} voix="admin.ouvrirStudio">
            {t('admin.ouvrirStudio')}
          </BoutonLien>
        </div>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
          {couverture.map(([langue, pct]) => (
            <li key={langue} className="flex flex-col gap-1">
              <span className="flex justify-between text-xs">
                <span className="font-medium text-texte-2">{NOMS[langue] ?? langue}</span>
                <span className={cn('tabulaire', pct >= 80 ? 'text-succes-texte' : pct >= 40 ? 'text-attente-texte' : 'text-danger-texte')}>{pct} %</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <span className={cn('block h-full', pct >= 80 ? 'bg-succes' : pct >= 40 ? 'bg-attente' : 'bg-danger')} style={{ width: `${pct}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </Carte>
      <p className="text-2xs text-texte-3">
        {data.boutiques && `${t('admin.stats.parc', { total: data.boutiques.total, actives: data.boutiques.actives, nouvelles: data.boutiques.nouvelles_7j })} · `}
        {t('admin.stats.confidentialite')}
      </p>
    </div>
  )
}
