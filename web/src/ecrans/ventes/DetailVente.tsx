import { useMutation } from '@tanstack/react-query'
import { BadgeCheck, Play, Receipt, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Paiement, Vente } from '@/api/types'
import { CLE_TABLEAU } from '@/api/tableauDeBord'
import { annulerVente, CLE_VENTES, cleVente, confirmerManuellement, useVente } from '@/api/ventes'
import { Bouton } from '@/composants/Bouton'
import { Dialogue } from '@/composants/Dialogue'
import { Squelette, SqueletteTexte } from '@/composants/Squelette'
import { IconeMethode, PastilleAlerte, PastilleStatutPaiement, PastilleStatutVente } from '@/composants/Statuts'
import { libelleMethode } from '@/lib/methodes'
import { notifier } from '@/composants/toastStore'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { localeCourante } from '@/i18n'
import { formaterDateHeure, formaterFCFA, formaterSats } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'

export interface PropsDetailVente {
  ulid: string | null
  onFermer: () => void
  /** Propriétaire ou gérant : confirmation manuelle Wave direct. */
  gestion: boolean
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-texte-3">{libelle}</dt>
      <dd className="min-w-0 text-right text-texte">{children}</dd>
    </>
  )
}

function Tentative({ paiement }: { paiement: Paiement }) {
  const { t } = useTranslation()
  const locale = localeCourante()
  return (
    <li className="flex flex-col gap-1 rounded-md border border-bordure bg-fond-2 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        <IconeMethode methode={paiement.methode} taille={13} />
        <span className="flex-1 text-sm font-medium text-texte">{libelleMethode(t, paiement.methode, paiement.operateur, paiement.moyen?.nom)}</span>
        {paiement.simule && <span className="text-texte-3">{t('ventes.simule')}</span>}
        <PastilleStatutPaiement statut={paiement.statut} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabulaire">
        {paiement.montant_sats !== null && paiement.cours_xof_par_btc !== null && (
          <>
            <Ligne libelle={t('ventes.cours')}>{t('ventes.coursValeur', { cours: formaterFCFA(paiement.cours_xof_par_btc) })}</Ligne>
            <Ligne libelle={t('caisse.equivalent')}>{formaterSats(paiement.montant_sats)}</Ligne>
          </>
        )}
        {paiement.payment_hash_abrege && <Ligne libelle={t('ventes.hash')}>{paiement.payment_hash_abrege}</Ligne>}
        <Ligne libelle={t('ventes.creeLe')}>{formaterDateHeure(paiement.cree_le, locale)}</Ligne>
        {paiement.regle_le ? (
          <Ligne libelle={t('ventes.regleLe')}>{formaterDateHeure(paiement.regle_le, locale)}</Ligne>
        ) : (
          paiement.expire_le && <Ligne libelle={t('ventes.expireLe')}>{formaterDateHeure(paiement.expire_le, locale)}</Ligne>
        )}
      </dl>
    </li>
  )
}

function Corps({ vente, gestion, onFermer }: { vente: Vente; gestion: boolean; onFermer: () => void }) {
  const { t } = useTranslation()
  const locale = localeCourante()
  const navigate = useNavigate()
  const messageErreur = useMessageErreur()
  const [annulationOuverte, setAnnulationOuverte] = useState(false)
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)

  const enAttente = vente.statut === 'en_attente'
  const tentativeEnAttente = vente.paiements.find((p) => p.statut === 'en_attente') ?? null
  // Confirmation à la main : Wave direct et moyens du pays (CONTRAT_API § 14.4).
  const waveAConfirmer = gestion && enAttente && (tentativeEnAttente?.methode === 'wave_manuel' || tentativeEnAttente?.methode === 'moyen_pays') ? tentativeEnAttente : null

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_VENTES })
    void queryClient.invalidateQueries({ queryKey: cleVente(vente.ulid) })
    void queryClient.invalidateQueries({ queryKey: CLE_TABLEAU })
  }
  const annulation = useMutation({
    mutationFn: () => annulerVente(vente.ulid),
    onSuccess: () => {
      setAnnulationOuverte(false)
      rafraichir()
      notifier({ type: 'succes', titre: t('ventes.annulee'), voix: 'ventes.annulee' })
    },
    onError: (e) => {
      notifier({ type: 'erreur', titre: messageErreur(e) })
      rafraichir()
    },
  })
  const confirmation = useMutation({
    mutationFn: () => confirmerManuellement(waveAConfirmer!.ulid),
    onSuccess: () => {
      setConfirmationOuverte(false)
      rafraichir()
      notifier({ type: 'succes', titre: t('ventes.confirmee'), voix: 'ventes.confirmee' })
    },
    onError: (e) => {
      notifier({ type: 'erreur', titre: messageErreur(e) })
      rafraichir()
    },
  })

  return (
    <div className="flex flex-col gap-3 pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold text-texte tabulaire">{formaterFCFA(vente.montant_xof)}</p>
          {vente.montant_sats_reussi !== null && <p className="text-sm text-texte-2 tabulaire">{formaterSats(vente.montant_sats_reussi)}</p>}
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-texte-2">
            <IconeMethode methode={vente.methode_reussie ?? tentativeEnAttente?.methode ?? null} taille={14} />
            {libelleMethode(t, vente.methode_reussie ?? tentativeEnAttente?.methode ?? null, vente.operateur_reussi ?? tentativeEnAttente?.operateur ?? null, vente.moyen_reussi ?? tentativeEnAttente?.moyen?.nom)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PastilleStatutVente statut={vente.statut} />
          {vente.alerte && <PastilleAlerte alerte={vente.alerte} />}
        </div>
      </div>

      {vente.alerte && (
        <p role="alert" className="rounded-md bg-danger-doux px-3 py-2 text-sm text-danger-texte">
          {vente.alerte === 'trop_percu' ? t('succes.tropPercu', { montant: formaterFCFA(vente.montant_xof) }) : t('succes.payeeApresAnnulation')}
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-bordure pt-2 text-sm tabulaire">
        <Ligne libelle={t('ventes.caissier')}>{vente.caissier.nom}</Ligne>
        <Ligne libelle={t('ventes.creeLe')}>{formaterDateHeure(vente.cree_le, locale)}</Ligne>
        {vente.payee_le && <Ligne libelle={t('ventes.payeeLe')}>{formaterDateHeure(vente.payee_le, locale)}</Ligne>}
        {vente.note && <Ligne libelle={t('ventes.note')}>{vente.note}</Ligne>}
      </dl>

      {vente.lignes.length > 0 && (
        <section className="border-t border-bordure pt-2">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('ventes.lignes')}</h3>
          <ul className="flex flex-col gap-0.5 text-sm">
            {vente.lignes.map((l, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-texte">{l.libelle}</span>
                <span className="text-xs text-texte-3 tabulaire">× {l.quantite}</span>
                <span className="w-24 text-right font-medium text-texte tabulaire">{formaterFCFA(l.quantite * l.prix_unitaire_xof)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vente.paiements.length > 0 && (
        <section className="border-t border-bordure pt-2">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('ventes.tentatives')}</h3>
          <ul className="flex flex-col gap-1.5">
            {vente.paiements.map((p) => (
              <Tentative key={p.ulid} paiement={p} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-bordure pt-3">
        {vente.recu_url && (
          <a
            href={vente.recu_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-bordure bg-surface px-3.5 text-base font-medium text-texte shadow-xs hover:bg-surface-2 md:h-9"
          >
            <Receipt size={17} aria-hidden="true" />
            {t('ventes.voirRecu')}
          </a>
        )}
        {enAttente && (
          <Bouton variante="danger" icone={<X />} voix="ventes.annuler" onClick={() => setAnnulationOuverte(true)}>
            {t('ventes.annuler')}
          </Bouton>
        )}
        {waveAConfirmer && (
          <Bouton variante="secondaire" icone={<BadgeCheck />} voix="ventes.confirmer" onClick={() => setConfirmationOuverte(true)}>
            {t('ventes.confirmer')}
          </Bouton>
        )}
        {enAttente && tentativeEnAttente && (
          <Bouton
            icone={<Play />}
            voix="ventes.reprendre"
            onClick={() => {
              onFermer()
              navigate(`/caisse/paiement/${tentativeEnAttente.ulid}`)
            }}
          >
            {t('ventes.reprendre')}
          </Bouton>
        )}
      </div>

      <Dialogue
        ouvert={annulationOuverte}
        onOuvertChange={setAnnulationOuverte}
        titre={t('paiement.annulerTitre')}
        description={t('paiement.annulerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="paiement.garder" onClick={() => setAnnulationOuverte(false)}>
              {t('paiement.garder')}
            </Bouton>
            <Bouton variante="danger" icone={<X />} voix="ventes.annuler" chargement={annulation.isPending} onClick={() => annulation.mutate()}>
              {t('ventes.annuler')}
            </Bouton>
          </>
        }
      />
      <Dialogue
        ouvert={confirmationOuverte}
        onOuvertChange={setConfirmationOuverte}
        titre={t('paiement.confirmerTitre', { montant: formaterFCFA(vente.montant_xof) })}
        description={waveAConfirmer?.moyen ? t('paiement.confirmerTexteMoyen', { moyen: waveAConfirmer.moyen.nom }) : t('paiement.confirmerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setConfirmationOuverte(false)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton icone={<BadgeCheck />} voix="ventes.confirmer" chargement={confirmation.isPending} onClick={() => confirmation.mutate()}>
              {t('ventes.confirmer')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}

/** Fenêtre de détail d'une vente : lignes, tentatives, cours, horodatages, reçu, actions. */
export function DetailVente({ ulid, onFermer, gestion }: PropsDetailVente) {
  const { t } = useTranslation()
  const { data: vente, isPending, isError } = useVente(ulid)
  return (
    <Dialogue ouvert={ulid !== null} onOuvertChange={(o) => !o && onFermer()} titre={vente ? `${t('ventes.detail')} · ${vente.numero}` : t('ventes.detail')} taille="md">
      {isPending && (
        <div className="flex flex-col gap-3 pb-2" aria-busy="true" data-chargement="detail-vente">
          <Squelette className="h-8 w-40" />
          <SqueletteTexte lignes={4} />
        </div>
      )}
      {isError && <p className="pb-2 text-sm text-danger-texte">{t('erreurs.inattendue')}</p>}
      {vente && <Corps vente={vente} gestion={gestion} onFermer={onFermer} />}
    </Dialogue>
  )
}
