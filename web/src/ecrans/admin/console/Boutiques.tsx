import { useMutation } from '@tanstack/react-query'
import { ChevronDown, FlaskConical, PauseCircle, PlayCircle, Search, Smartphone, Store, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_ADMIN, changerStatutBoutique, useBoutiquesAdmin, type FiltresBoutiquesAdmin } from '@/api/admin'
import type { BoutiqueAdmin } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EtatVide } from '@/composants/EtatVide'
import { Infobulle } from '@/composants/Infobulle'
import { Pastille } from '@/composants/Pastille'
import { Segment } from '@/composants/Segment'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { queryClient } from '@/lib/queryClient'
import { tempsRelatif } from '@/lib/temps'

type FiltreStatut = 'toutes' | BoutiqueAdmin['statut']

function Voyant({ actif, icone, libelle }: { actif: boolean; icone: ReactNode; libelle: string }) {
  return (
    <Infobulle contenu={libelle}>
      <span
        role="img"
        aria-label={libelle}
        tabIndex={0}
        className={cn('inline-flex size-6 items-center justify-center rounded-md [&>svg]:size-3.5', actif ? 'bg-succes-doux text-succes-texte' : 'bg-surface-2 text-texte-3 opacity-60')}
      >
        {icone}
      </span>
    </Infobulle>
  )
}

/** Version compacte (mobile) : icône colorée, libellé pour les lecteurs d'écran. */
function MiniVoyant({ actif, icone, libelle }: { actif: boolean; icone: ReactNode; libelle: string }) {
  return (
    <span role="img" aria-label={libelle} className={cn('inline-flex [&>svg]:size-3.5', actif ? 'text-succes-texte' : 'text-texte-3 opacity-50')}>
      {icone}
    </span>
  )
}

/** Boutiques de la plateforme : recherche, statut, configuration, activité en nombre de ventes, suspendre / réactiver. */
export function BoutiquesAdmin({ actif }: { actif: boolean }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState<FiltreStatut>('toutes')
  const [q, setQ] = useState('')
  const [cible, setCible] = useState<BoutiqueAdmin | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setQ(recherche.trim()), 250)
    return () => clearTimeout(id)
  }, [recherche])

  const filtres: FiltresBoutiquesAdmin = useMemo(() => ({ ...(q ? { q } : {}), ...(statut !== 'toutes' ? { statut } : {}) }), [q, statut])
  const requete = useBoutiquesAdmin(filtres, actif)
  const boutiques = useMemo(() => (requete.data?.pages ?? []).flatMap((p) => p.boutiques), [requete.data])

  const changement = useMutation({
    mutationFn: (b: BoutiqueAdmin) => changerStatutBoutique(b.ulid, b.statut === 'active' ? 'suspendue' : 'active'),
    onSuccess: ({ boutique }) => {
      setCible(null)
      void queryClient.invalidateQueries({ queryKey: CLE_ADMIN })
      const cle = boutique.statut === 'suspendue' ? 'admin.boutiques.suspendueOk' : 'admin.boutiques.reactiveeOk'
      notifier({ type: 'succes', titre: t(cle, { nom: boutique.nom }), voix: cle })
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  if (!actif) return null
  const suspendre = cible?.statut === 'active'

  return (
    <div className="flex flex-col gap-2" data-vue="boutiques">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Champ
          libelle={t('admin.boutiques.rechercher')}
          type="search"
          icone={<Search />}
          placeholder={t('admin.boutiques.rechercher')}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-9 text-sm md:h-8"
          classeConteneur="flex-1 [&>label]:sr-only"
          autoComplete="off"
        />
        <Segment<FiltreStatut>
          libelle={t('admin.boutiques.statut')}
          taille="sm"
          valeur={statut}
          onChange={setStatut}
          className="sm:w-auto"
          options={[
            { valeur: 'toutes', libelle: t('admin.boutiques.toutes'), voix: 'admin.boutiques.toutes' },
            { valeur: 'active', libelle: t('admin.boutiques.actives'), voix: 'admin.boutiques.actives' },
            { valeur: 'suspendue', libelle: t('admin.boutiques.suspendues'), voix: 'admin.boutiques.suspendues' },
          ]}
        />
      </div>

      {requete.isPending ? (
        <div data-chargement="boutiques" aria-busy="true">
          <SqueletteListe lignes={6} />
        </div>
      ) : boutiques.length === 0 ? (
        <EtatVide ton="neutre" icone={<Store />} titre={t('admin.boutiques.vide')} />
      ) : (
        <>
          <ul className="divide-y divide-bordure verre rounded-xl" aria-label={t('admin.onglets.boutiques')}>
            {boutiques.map((b) => {
              const derniere = b.activite.derniere_vente_le ? tempsRelatif(b.activite.derniere_vente_le) : null
              return (
                <li key={b.ulid} className={cn('flex items-center gap-3 px-3 py-2', b.statut === 'suspendue' && 'bg-danger-doux/30')}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-texte">
                      <span className="truncate">{b.nom}</span>
                      <span className="shrink-0 text-xs font-normal text-texte-3">· {b.ville}</span>
                    </p>
                    <p className="truncate text-xs text-texte-3">{b.proprietaire ? `${b.proprietaire.nom} · ${b.proprietaire.contact}` : t('admin.boutiques.sansProprietaire')}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-texte-2 sm:hidden">
                      <span className="flex items-center gap-1">
                        <MiniVoyant actif={b.configuration.wallet} icone={<Wallet />} libelle={b.configuration.wallet ? t('admin.boutiques.wallet') : t('admin.boutiques.walletNon')} />
                        <MiniVoyant actif={b.configuration.paytech} icone={<Smartphone />} libelle={b.configuration.paytech ? t('admin.boutiques.paytech') : t('admin.boutiques.paytechNon')} />
                        <MiniVoyant actif={b.configuration.paiement_test} icone={<FlaskConical />} libelle={b.configuration.paiement_test ? t('admin.boutiques.test') : t('admin.boutiques.testNon')} />
                      </span>
                      <span className="truncate tabulaire">
                        {t('admin.boutiques.ventes7j', { count: b.activite.ventes_7j })} · {derniere ? t(derniere.cle, { count: derniere.count }) : t('admin.boutiques.aucuneVente')}
                      </span>
                    </div>
                  </div>
                  <div className="hidden items-center gap-1 sm:flex">
                    <Voyant actif={b.configuration.wallet} icone={<Wallet />} libelle={b.configuration.wallet ? t('admin.boutiques.wallet') : t('admin.boutiques.walletNon')} />
                    <Voyant actif={b.configuration.paytech} icone={<Smartphone />} libelle={b.configuration.paytech ? t('admin.boutiques.paytech') : t('admin.boutiques.paytechNon')} />
                    <Voyant actif={b.configuration.paiement_test} icone={<FlaskConical />} libelle={b.configuration.paiement_test ? t('admin.boutiques.test') : t('admin.boutiques.testNon')} />
                  </div>
                  <div className="hidden w-28 text-right text-xs sm:block">
                    <p className="font-medium text-texte tabulaire">{t('admin.boutiques.ventes7j', { count: b.activite.ventes_7j })}</p>
                    <p className="truncate text-texte-3">{derniere ? t(derniere.cle, { count: derniere.count }) : t('admin.boutiques.aucuneVente')}</p>
                  </div>
                  <Pastille ton={b.statut === 'active' ? 'succes' : 'danger'} point className="shrink-0 justify-center sm:w-[86px]">
                    {t(`admin.boutiques.statuts.${b.statut}`)}
                  </Pastille>
                  <BoutonIcone
                    libelle={b.statut === 'active' ? t('admin.boutiques.suspendre') : t('admin.boutiques.reactiver')}
                    icone={b.statut === 'active' ? <PauseCircle /> : <PlayCircle />}
                    voix={b.statut === 'active' ? 'admin.boutiques.suspendre' : 'admin.boutiques.reactiver'}
                    variante={b.statut === 'active' ? 'danger' : 'fantome'}
                    taille="sm"
                    onClick={() => setCible(b)}
                  />
                </li>
              )
            })}
          </ul>
          {requete.hasNextPage && (
            <div className="flex justify-center">
              <Bouton variante="secondaire" icone={<ChevronDown />} voix="commun.voirPlus" chargement={requete.isFetchingNextPage} onClick={() => void requete.fetchNextPage()}>
                {t('commun.voirPlus')}
              </Bouton>
            </div>
          )}
        </>
      )}

      <Dialogue
        ouvert={Boolean(cible)}
        onOuvertChange={(o) => !o && setCible(null)}
        titre={suspendre ? t('admin.boutiques.suspendreTitre', { nom: cible?.nom ?? '' }) : t('admin.boutiques.reactiverTitre', { nom: cible?.nom ?? '' })}
        description={suspendre ? t('admin.boutiques.suspendreTexte') : t('admin.boutiques.reactiverTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setCible(null)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton
              variante={suspendre ? 'danger' : 'primaire'}
              icone={suspendre ? <PauseCircle /> : <PlayCircle />}
              voix={suspendre ? 'admin.boutiques.suspendre' : 'admin.boutiques.reactiver'}
              chargement={changement.isPending}
              onClick={() => cible && changement.mutate(cible)}
            >
              {suspendre ? t('admin.boutiques.suspendre') : t('admin.boutiques.reactiver')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}
