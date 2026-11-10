import { ArrowDownUp, KeyRound, Mic, Package, ScrollText, ShieldAlert, Store, Users, Wallet, Zap } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { JOURNAL_PAR_PAGE, useJournalAdmin, type FiltresJournal } from '@/api/admin'
import type { EntreeJournal } from '@/api/types'
import { Champ } from '@/composants/Champ'
import { EtatVide } from '@/composants/EtatVide'
import { Pagination } from '@/composants/Pagination'
import { Selection } from '@/composants/Selection'
import { SqueletteListe } from '@/composants/Squelette'
import { cn } from '@/lib/cn'
import { formaterDateHeure, type Locale } from '@/lib/format'
import { useCorrectionPage, usePageUrl } from '@/lib/usePagination'

const FAMILLES = ['auth', 'audio', 'boutique', 'plateforme', 'equipe', 'wallet', 'paytech', 'vente', 'paiement', 'article', 'import', 'export'] as const

const ICONES: Record<string, ReactNode> = {
  auth: <KeyRound />,
  audio: <Mic />,
  boutique: <Store />,
  equipe: <Users />,
  wallet: <Wallet />,
  paytech: <Zap />,
  vente: <ScrollText />,
  paiement: <ScrollText />,
  plateforme: <Store />,
  article: <Package />,
  import: <ArrowDownUp />,
  export: <ArrowDownUp />,
}

/** Actions qui méritent l'œil (refus, échecs, suspensions). */
function sensible(action: string) {
  return /echec|refus|suspendue|2fa_desactivee|incoherent|insuffisant|apres_annulation|incertain/.test(action)
}

function details(valeur: EntreeJournal['details']): string | null {
  if (!valeur) return null
  if (typeof valeur === 'string') return valeur
  const morceaux = Object.entries(valeur).map(([cle, v]) => `${cle} : ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  return morceaux.length ? morceaux.join(' · ') : null
}

/** Journal d'audit global : filtres (famille d'action, période), pagination par numéro de page. */
export function JournalAdmin({ actif }: { actif: boolean }) {
  const { t, i18n } = useTranslation()
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'fr'
  const [filtres, setFiltres] = useState<FiltresJournal>({})
  const { page, allerA, reinitialiser } = usePageUrl()
  const haut = useRef<HTMLOListElement>(null)
  const requete = useJournalAdmin(filtres, page, actif)
  const entrees = requete.data?.entrees ?? []
  const pagination = requete.data?.pagination
  useCorrectionPage(actif ? pagination : undefined, allerA)
  if (!actif) return null

  // Un filtre qui change ramène à la page 1.
  const changer = (cle: keyof FiltresJournal, valeur: string) => {
    setFiltres((f) => {
      const suivant = { ...f }
      if (valeur) suivant[cle] = valeur
      else delete suivant[cle]
      return suivant
    })
    reinitialiser()
  }

  return (
    <div className="flex flex-col gap-2" data-vue="journal">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Selection
          libelle={t('admin.journal.action')}
          libelleVisible={false}
          taille="sm"
          value={filtres.action ?? ''}
          onChange={(e) => changer('action', e.target.value)}
          options={[{ valeur: '', libelle: t('admin.journal.toutes') }, ...FAMILLES.map((f) => ({ valeur: `${f}.`, libelle: t(`admin.journal.familles.${f}`) }))]}
          classeConteneur="col-span-2 sm:col-span-1"
        />
        <Champ libelle={t('admin.journal.du')} type="date" value={filtres.du ?? ''} max={filtres.au} onChange={(e) => changer('du', e.target.value)} className="h-9 text-sm md:h-8" classeConteneur="[&>label]:sr-only" />
        <Champ libelle={t('admin.journal.au')} type="date" value={filtres.au ?? ''} min={filtres.du} onChange={(e) => changer('au', e.target.value)} className="h-9 text-sm md:h-8" classeConteneur="[&>label]:sr-only" />
      </div>

      {requete.isPending ? (
        <div data-chargement="journal" aria-busy="true">
          <SqueletteListe lignes={8} />
        </div>
      ) : entrees.length === 0 && (pagination?.total ?? 0) === 0 ? (
        <EtatVide ton="neutre" icone={<ScrollText />} titre={t('admin.journal.vide')} />
      ) : (
        <>
          <ol ref={haut} className={cn('divide-y divide-bordure verre rounded-xl transition-opacity duration-150', requete.isPlaceholderData && 'opacity-70')} aria-label={t('admin.onglets.journal')}>
            {entrees.map((e) => {
              const famille = e.action.split('.')[0] ?? ''
              const alerte = sensible(e.action)
              const detail = details(e.details)
              return (
                <li key={e.id} className="flex items-start gap-3 px-3 py-2">
                  <span
                    className={cn('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md [&>svg]:size-3.5', alerte ? 'bg-danger-doux text-danger-texte' : 'bg-surface-2 text-texte-2')}
                    aria-hidden="true"
                  >
                    {alerte ? <ShieldAlert /> : (ICONES[famille] ?? <ScrollText />)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className={cn('font-medium', alerte ? 'text-danger-texte' : 'text-texte')}>{t(`admin.journal.actions.${e.action.replaceAll('.', '_')}`, { defaultValue: e.action })}</span>
                      <code className="font-mono text-2xs text-texte-3" data-technique>
                        {e.action}
                      </code>
                    </p>
                    <p className="truncate text-xs text-texte-3">
                      {[e.utilisateur?.nom ?? t('admin.journal.systeme'), e.boutique?.nom, e.ip].filter(Boolean).join(' · ')}
                    </p>
                    {detail && (
                      <p className="truncate font-mono text-2xs text-texte-3" data-technique>
                        {detail}
                      </p>
                    )}
                  </div>
                  <time dateTime={e.cree_le} className="shrink-0 text-xs text-texte-3 tabulaire">
                    {formaterDateHeure(e.cree_le, locale)}
                  </time>
                </li>
              )
            })}
          </ol>
          {pagination && (
            <Pagination
              page={page}
              parPage={pagination.par_page || JOURNAL_PAR_PAGE}
              total={pagination.total}
              pages={pagination.pages}
              onChange={allerA}
              ancre={haut}
              libelle={t('admin.onglets.journal')}
              chargement={requete.isPlaceholderData}
              className="mt-1"
            />
          )}
        </>
      )}
    </div>
  )
}
