import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FiltresVentes as TypeFiltres, MethodePaiement, Periode, StatutVente } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Segment } from '@/composants/Segment'
import { Selection } from '@/composants/Selection'
import { cn } from '@/lib/cn'
import { CLE_PERIODE, FILTRES_DEFAUT, filtresActifs, PERIODES } from './filtres'

const STATUTS: StatutVente[] = ['payee', 'en_attente', 'annulee', 'expiree']
const METHODES: MethodePaiement[] = ['lightning', 'paytech', 'wave_manuel', 'moyen_pays']

export interface PropsFiltresVentes {
  filtres: TypeFiltres
  onChange: (filtres: TypeFiltres) => void
  caissiers: { ulid: string; nom: string }[]
  /** Caissier connecté : ni période ni caissier (le serveur borne à ses ventes du jour). */
  restreint?: boolean
  className?: string
}

const CLASSE_DATE =
  'h-9 rounded-md border border-bordure bg-surface px-2 text-sm text-texte shadow-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 md:h-8'

export function FiltresVentes({ filtres, onChange, caissiers, restreint, className }: PropsFiltresVentes) {
  const { t } = useTranslation()
  const periode = filtres.periode ?? 'aujourdhui'
  const poser = (partiel: Partial<TypeFiltres>) => {
    const suivant: TypeFiltres = { ...filtres, ...partiel }
    for (const cle of Object.keys(suivant) as (keyof TypeFiltres)[]) if (suivant[cle] === undefined || suivant[cle] === '') delete suivant[cle]
    onChange(suivant)
  }

  return (
    <div className={cn('flex flex-col gap-2 verre rounded-xl p-2.5', className)} data-filtres>
      {!restreint && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Segment<Periode>
            libelle={t('periodes.titre')}
            taille="sm"
            valeur={periode}
            onChange={(p) => poser({ periode: p, du: undefined, au: undefined })}
            options={PERIODES.map((p) => ({ valeur: p, libelle: t(CLE_PERIODE[p]), voix: `periodes.${CLE_PERIODE[p].slice('periodes.'.length)}` }))}
            className="md:w-auto md:flex-1"
          />
          {periode === 'perso' && (
            <div className="flex items-center gap-1.5 text-sm text-texte-2">
              <label className="flex items-center gap-1">
                <span>{t('periodes.du')}</span>
                <input type="date" value={filtres.du ?? ''} max={filtres.au} onChange={(e) => poser({ du: e.target.value })} className={CLASSE_DATE} aria-label={t('periodes.du')} />
              </label>
              <label className="flex items-center gap-1">
                <span>{t('periodes.au')}</span>
                <input type="date" value={filtres.au ?? ''} min={filtres.du} onChange={(e) => poser({ au: e.target.value })} className={CLASSE_DATE} aria-label={t('periodes.au')} />
              </label>
            </div>
          )}
        </div>
      )}
      <div className={cn('grid gap-2', restreint ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto]')}>
        <Selection
          libelle={t('ventes.statut')} voix="ventes.statut"
          libelleVisible={false}
          taille="sm"
          value={filtres.statut ?? ''}
          onChange={(e) => poser({ statut: (e.target.value || undefined) as StatutVente | undefined })}
          options={[{ valeur: '', libelle: `${t('ventes.statut')} · ${t('ventes.tous')}` }, ...STATUTS.map((s) => ({ valeur: s, libelle: t(`statuts.${s}`) }))]}
        />
        <Selection
          libelle={t('ventes.methode')} voix="ventes.methode"
          libelleVisible={false}
          taille="sm"
          value={filtres.methode ?? ''}
          onChange={(e) => poser({ methode: (e.target.value || undefined) as MethodePaiement | undefined })}
          options={[{ valeur: '', libelle: `${t('ventes.methode')} · ${t('ventes.tous')}` }, ...METHODES.map((m) => ({ valeur: m, libelle: t(`methodes.${m}`) }))]}
        />
        {!restreint && (
          <Selection
            libelle={t('ventes.caissier')} voix="ventes.caissier"
            libelleVisible={false}
            taille="sm"
            value={filtres.caissier ?? ''}
            onChange={(e) => poser({ caissier: e.target.value || undefined })}
            options={[{ valeur: '', libelle: `${t('ventes.caissier')} · ${t('ventes.tous')}` }, ...caissiers.map((c) => ({ valeur: c.ulid, libelle: c.nom }))]}
          />
        )}
        {filtresActifs(filtres) && (
          <Bouton variante="fantome" taille="sm" icone={<RotateCcw />} voix="ventes.reinitialiser" onClick={() => onChange({ ...FILTRES_DEFAUT })} className="col-span-2 md:col-span-1">
            {t('ventes.reinitialiser')}
          </Bouton>
        )}
      </div>
    </div>
  )
}
