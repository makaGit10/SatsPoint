import { useMutation } from '@tanstack/react-query'
import { Hash, Link2, Pencil, Plus, Save, Smartphone, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { creerMoyen, modifierMoyen, modifierPays, supprimerMoyen, useMoyensAdmin, usePaysAdmin } from '@/api/admin'
import { ErreurApi } from '@/api/client'
import type { CodePays, CouleurMoyen, MoyenCatalogue, TypeMoyen } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EtatVide } from '@/composants/EtatVide'
import { Interrupteur } from '@/composants/Interrupteur'
import { Segment } from '@/composants/Segment'
import { Selection } from '@/composants/Selection'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { nomPays, PAYS_DEFAUT } from '@/lib/catalogue'
import { cn } from '@/lib/cn'
import { classesCouleur, COULEURS_MOYEN, instructionsMoyen } from '@/lib/couleursMoyens'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { invaliderCatalogue, useMessageCatalogue } from './catalogue'

const INSTRUCTIONS_MAX = 160
/** Texte brut uniquement (le serveur refuse aussi `<`, `>` et les retours à la ligne). */
const nettoyer = (v: string) => v.replace(/[<>\r\n]/g, '')

/**
 * Onglet « Moyens de paiement » : par pays, le catalogue que les commerçants activent avec leur numéro ou lien marchand
 * (confirmation manuelle). Le Sénégal garde PayTech et le Wave direct, inchangés.
 */
export function MoyensAdmin({ actif }: { actif: boolean }) {
  const { t, i18n } = useTranslation()
  const message = useMessageCatalogue()
  const listePays = usePaysAdmin(actif)
  const [pays, setPays] = useState<CodePays>('CI')
  const requete = useMoyensAdmin(pays, actif)
  const [edition, setEdition] = useState<MoyenCatalogue | 'nouveau' | null>(null)
  const [aSupprimer, setASupprimer] = useState<MoyenCatalogue | null>(null)

  const paysCourant = listePays.data?.find((p) => p.code === pays)
  const basculePays = useMutation({
    mutationFn: () => modifierPays(pays, { actif: !paysCourant?.actif }),
    onSuccess: () => {
      invaliderCatalogue()
      notifier({ type: 'succes', titre: t('admin.moyens.paysEnregistre'), voix: 'admin.moyens.paysEnregistre' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: message(e) }),
  })
  const bascule = useMutation({
    mutationFn: (m: MoyenCatalogue) => modifierMoyen(m.ulid, { actif: !m.actif }),
    onSuccess: () => {
      invaliderCatalogue()
      notifier({ type: 'succes', titre: t('admin.moyens.enregistre'), voix: 'admin.moyens.enregistre' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: message(e) }),
  })
  const suppression = useMutation({
    mutationFn: (m: MoyenCatalogue) => supprimerMoyen(m.ulid),
    onSuccess: () => {
      setASupprimer(null)
      invaliderCatalogue()
      notifier({ type: 'succes', titre: t('admin.moyens.supprime'), voix: 'admin.moyens.supprime' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: message(e) }),
  })

  if (!actif) return null
  const moyens = requete.data ?? []

  return (
    <div className="flex flex-col gap-2" data-vue="moyens">
      <p className="text-sm text-texte-2">{t('admin.moyens.aide')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Selection
          libelle={t('admin.moyens.pays')} voix="admin.moyens.pays"
          libelleVisible={false}
          taille="sm"
          value={pays}
          onChange={(e) => setPays(e.target.value as CodePays)}
          options={(listePays.data ?? []).map((p) => ({ valeur: p.code, libelle: `${nomPays(p, i18n.language)}${p.actif ? '' : ` · ${t('admin.moyens.paysFerme')}`}` }))}
          classeConteneur="min-w-0 flex-1 sm:flex-none sm:basis-56"
          data-filtre-pays
        />
        <Bouton taille="sm" icone={<Plus />} voix="admin.moyens.ajouter" onClick={() => setEdition('nouveau')}>
          {t('admin.moyens.ajouter')}
        </Bouton>
      </div>

      {paysCourant && (
        <div className="verre rounded-xl px-3 py-2">
          <Interrupteur
            coche={paysCourant.actif}
            onChange={() => basculePays.mutate()}
            desactive={paysCourant.code === PAYS_DEFAUT || basculePays.isPending}
            libelle={t('admin.moyens.paysActif', { pays: nomPays(paysCourant, i18n.language) })}
            description={`${t('admin.moyens.paysBoutiques', { count: paysCourant.boutiques })} · ${paysCourant.indicatif}`}
            voix="admin.moyens.paysOuvert"
          />
        </div>
      )}
      {pays === PAYS_DEFAUT && (
        // Au Sénégal, les moyens intégrés (PayTech et le lien Wave direct) sont déjà proposés à toutes les boutiques :
        // on les montre pour que la liste ne paraisse jamais vide.
        <section className="flex flex-col gap-2" aria-label={t('admin.moyens.integresTitre')}>
          <h3 className="text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('admin.moyens.integresTitre')}</h3>
          <ul className="divide-y divide-bordure verre rounded-xl" data-moyens-integres>
            {(['wave', 'orange_money', 'free_money', 'wave_direct'] as const).map((code) => (
              <li key={code} className="flex items-center gap-3 px-3 py-2">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-mm-doux text-mm-texte [&>svg]:size-4" aria-hidden="true">
                  {code === 'wave_direct' ? <Link2 /> : <Smartphone />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texte">{t(`admin.moyens.integres.${code}`)}</p>
                  <p className="text-xs text-texte-3">{t(code === 'wave_direct' ? 'admin.moyens.integreLien' : 'admin.moyens.integrePaytech')}</p>
                </div>
                <span className="rounded-full bg-succes-doux px-2.5 py-1 text-xs font-semibold text-succes-texte">{t('admin.moyens.integreActif')}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-texte-3">{t('admin.moyens.senegal')}</p>
        </section>
      )}

      {requete.isPending ? (
        <div data-chargement="moyens" aria-busy="true">
          <SqueletteListe lignes={4} />
        </div>
      ) : moyens.length === 0 ? (
        pays === PAYS_DEFAUT ? null : <EtatVide ton="neutre" icone={<Smartphone />} titre={t('admin.moyens.vide')} />
      ) : (
        <ul className={cn('divide-y divide-bordure verre rounded-xl', requete.isPlaceholderData && 'opacity-70')} aria-label={t('admin.onglets.moyens')}>
          {moyens.map((m) => {
            const couleur = classesCouleur(m.couleur)
            return (
              <li key={m.ulid} className={cn('flex items-center gap-3 px-3 py-2', !m.actif && 'opacity-70')} data-moyen={m.nom}>
                <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4', couleur.doux)} aria-hidden="true">
                  {m.type === 'lien' ? <Link2 /> : <Hash />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texte">{m.nom}</p>
                  <p className="line-clamp-2 text-xs text-texte-3">
                    {t(`admin.moyens.types.${m.type}`)} · {t('admin.moyens.boutiques', { count: m.boutiques_actives ?? 0 })}
                  </p>
                  {instructionsMoyen(m, i18n.language) && <p className="hidden truncate text-xs text-texte-3 sm:block">{instructionsMoyen(m, i18n.language)}</p>}
                </div>
                <Interrupteur coche={m.actif} onChange={() => bascule.mutate(m)} desactive={bascule.isPending} libelle={<span className="sr-only">{t('admin.moyens.actif')}</span>} voix="admin.moyens.actif" className="shrink-0" />
                <BoutonIcone libelle={t('admin.moyens.modifier')} icone={<Pencil />} voix="admin.moyens.modifier" taille="sm" onClick={() => setEdition(m)} />
                {(m.boutiques_actives ?? 0) === 0 ? (
                  <BoutonIcone libelle={t('admin.moyens.supprimer')} icone={<Trash2 />} voix="admin.moyens.supprimer" variante="danger" taille="sm" onClick={() => setASupprimer(m)} />
                ) : (
                  <span className="size-9 shrink-0" aria-hidden="true" />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {edition && <FormulaireMoyen moyen={edition === 'nouveau' ? null : edition} pays={pays} onFermer={() => setEdition(null)} />}

      <Dialogue
        ouvert={Boolean(aSupprimer)}
        onOuvertChange={(o) => !o && setASupprimer(null)}
        titre={t('admin.moyens.supprimerTitre', { nom: aSupprimer?.nom ?? '' })} voix="admin.moyens.supprimerTitre"
        description={t('admin.moyens.supprimerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setASupprimer(null)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<Trash2 />} voix="admin.moyens.supprimer" chargement={suppression.isPending} onClick={() => aSupprimer && suppression.mutate(aSupprimer)}>
              {t('admin.moyens.supprimer')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}

/** Fenêtre d'ajout / de modification d'un moyen (pays et type figés après la création). */
function FormulaireMoyen({ moyen, pays, onFermer }: { moyen: MoyenCatalogue | null; pays: CodePays; onFermer: () => void }) {
  const { t } = useTranslation()
  const message = useMessageCatalogue()
  const [nom, setNom] = useState(moyen?.nom ?? '')
  const [type, setType] = useState<TypeMoyen>(moyen?.type ?? 'numero')
  const [couleur, setCouleur] = useState<CouleurMoyen>(moyen?.couleur ?? 'orange')
  const [instructionsFr, setInstructionsFr] = useState(moyen?.instructions_fr ?? '')
  const [instructionsEn, setInstructionsEn] = useState(moyen?.instructions_en ?? '')
  const [actif, setActif] = useState(moyen?.actif ?? true)
  const [erreurs, setErreurs] = useState<Record<string, string | undefined>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  useSaisieEnCours(true)

  const mutation = useMutation({
    mutationFn: () => {
      const corps = { nom: nom.trim(), couleur, instructions_fr: instructionsFr.trim() || null, instructions_en: instructionsEn.trim() || null, actif }
      return moyen ? modifierMoyen(moyen.ulid, corps) : creerMoyen({ ...corps, pays, type })
    },
    onSuccess: () => {
      invaliderCatalogue()
      notifier({ type: 'succes', titre: moyen ? t('admin.moyens.enregistre') : t('admin.moyens.cree'), voix: moyen ? 'admin.moyens.enregistre' : 'admin.moyens.cree' })
      onFermer()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) {
        setErreurs({ nom: e.champ('nom'), instructions_fr: e.champ('instructions_fr'), instructions_en: e.champ('instructions_en') })
        setErreur(e.champ('nom') || e.champ('instructions_fr') || e.champ('instructions_en') ? null : message(e))
      } else setErreur(message(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    const champs: Record<string, string | undefined> = {}
    if (nom.trim().length < 2) champs.nom = t('auth.champRequis')
    setErreurs(champs)
    if (champs.nom) return
    mutation.mutate()
  }

  return (
    <Dialogue ouvert onOuvertChange={(o) => !o && onFermer()} titre={moyen ? t('admin.moyens.modifierTitre', { nom: moyen.nom }) : t('admin.moyens.ajouter')} voix={moyen ? 'admin.moyens.modifierTitre' : 'admin.moyens.ajouter'} taille="md">
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3" data-formulaire-moyen>
        <Champ libelle={t('admin.moyens.nom')} voix="admin.moyens.nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={40} placeholder="Orange Money" erreur={erreurs.nom} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-texte-2">{t('admin.moyens.type')}</span>
          <Segment<TypeMoyen>
            libelle={t('admin.moyens.type')}
            valeur={type}
            onChange={setType}
            taille="sm"
            options={[
              { valeur: 'numero', libelle: t('admin.moyens.types.numero'), icone: <Hash />, desactive: Boolean(moyen), voix: 'admin.moyens.types.numero' },
              { valeur: 'lien', libelle: t('admin.moyens.types.lien'), icone: <Link2 />, desactive: Boolean(moyen), voix: 'admin.moyens.types.lien' },
            ]}
          />
          <p className="text-xs text-texte-3">{t('admin.moyens.typeAide')}</p>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-texte-2">{t('admin.moyens.couleur')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('admin.moyens.couleur')}>
            {COULEURS_MOYEN.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={couleur === c}
                aria-label={t(`admin.moyens.couleurs.${c}`)}
                title={t(`admin.moyens.couleurs.${c}`)}
                onClick={() => setCouleur(c)}
                className={cn('size-8 rounded-full ring-offset-2 ring-offset-surface transition-shadow', classesCouleur(c).pastille, couleur === c ? 'ring-2 ring-texte' : 'hover:ring-2 hover:ring-bordure-forte')}
              />
            ))}
          </div>
        </fieldset>
        <Champ
          libelle={t('admin.moyens.instructionsFr')} voix="admin.moyens.instructionsFr"
          value={instructionsFr}
          onChange={(e) => setInstructionsFr(nettoyer(e.target.value))}
          maxLength={INSTRUCTIONS_MAX}
          aide={`${t('admin.moyens.instructionsAide')} ${instructionsFr.length}/${INSTRUCTIONS_MAX}`}
          erreur={erreurs.instructions_fr}
        />
        <Champ
          libelle={t('admin.moyens.instructionsEn')} voix="admin.moyens.instructionsEn"
          value={instructionsEn}
          onChange={(e) => setInstructionsEn(nettoyer(e.target.value))}
          maxLength={INSTRUCTIONS_MAX}
          aide={`${instructionsEn.length}/${INSTRUCTIONS_MAX}`}
          erreur={erreurs.instructions_en}
        />
        <Interrupteur coche={actif} onChange={setActif} libelle={t('admin.moyens.actif')} description={t('admin.moyens.actifAide')} voix="admin.moyens.actif" />
        <ErreurFormulaire message={erreur} />
        <div className="flex justify-end gap-2">
          <Bouton type="button" variante="secondaire" voix="commun.annuler" onClick={onFermer}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton type="submit" icone={<Save />} voix="commun.enregistrer" chargement={mutation.isPending}>
            {t('commun.enregistrer')}
          </Bouton>
        </div>
      </form>
    </Dialogue>
  )
}
