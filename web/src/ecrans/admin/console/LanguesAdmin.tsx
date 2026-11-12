import { useMutation } from '@tanstack/react-query'
import { Languages, Mic, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { creerLangue, modifierLangue, supprimerLangue, useLanguesAdmin } from '@/api/admin'
import { ErreurApi } from '@/api/client'
import { useCatalogue } from '@/api/catalogue'
import type { CodePays, LangueAdmin } from '@/api/types'
import { Bouton, BoutonLien } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EtatVide } from '@/composants/EtatVide'
import { Interrupteur } from '@/composants/Interrupteur'
import { Selection } from '@/composants/Selection'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { MOTIF_CODE_LANGUE, nomPays } from '@/lib/catalogue'
import { cn } from '@/lib/cn'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { invaliderCatalogue, useMessageCatalogue } from './catalogue'
import { ChoixPays } from './ChoixPays'

/**
 * Onglet « Langues » de la console : les langues de l'aide vocale (ajouter, renommer, associer à des pays,
 * activer / désactiver ; suppression seulement sans aucun audio). Le nom de chaque langue s'enregistre au studio.
 */
export function LanguesAdmin({ actif }: { actif: boolean }) {
  const { t, i18n } = useTranslation()
  const { pays } = useCatalogue()
  const requete = useLanguesAdmin(actif)
  const message = useMessageCatalogue()
  const [filtre, setFiltre] = useState<CodePays | ''>('')
  const [edition, setEdition] = useState<LangueAdmin | 'nouvelle' | null>(null)
  const [aSupprimer, setASupprimer] = useState<LangueAdmin | null>(null)

  const bascule = useMutation({
    mutationFn: (l: LangueAdmin) => modifierLangue(l.code, { actif: !l.actif }),
    onSuccess: () => {
      invaliderCatalogue()
      notifier({ type: 'succes', titre: t('admin.langues.enregistree'), voix: 'admin.langues.enregistree' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: message(e) }),
  })
  const suppression = useMutation({
    mutationFn: (l: LangueAdmin) => supprimerLangue(l.code),
    onSuccess: () => {
      setASupprimer(null)
      invaliderCatalogue()
      notifier({ type: 'succes', titre: t('admin.langues.supprimee'), voix: 'admin.langues.supprimee' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: message(e) }),
  })

  if (!actif) return null
  const langues = (requete.data ?? []).filter((l) => !filtre || l.pays.length === 0 || l.pays.includes(filtre))
  const libellePays = (codes: CodePays[]) => (codes.length ? codes.map((c) => nomPays(pays.find((p) => p.code === c), i18n.language) || c).join(', ') : t('admin.langues.tousPays'))

  return (
    <div className="flex flex-col gap-2" data-vue="langues">
      <p className="text-sm text-texte-2">{t('admin.langues.aide')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Selection
          libelle={t('admin.langues.filtrePays')} voix="admin.langues.filtrePays"
          libelleVisible={false}
          taille="sm"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as CodePays | '')}
          options={[{ valeur: '', libelle: t('admin.langues.tousPays') }, ...pays.map((p) => ({ valeur: p.code, libelle: nomPays(p, i18n.language) }))]}
          classeConteneur="min-w-0 flex-1 sm:flex-none sm:basis-48"
        />
        <Bouton taille="sm" icone={<Plus />} voix="admin.langues.ajouter" onClick={() => setEdition('nouvelle')}>
          {t('admin.langues.ajouter')}
        </Bouton>
      </div>

      {requete.isPending ? (
        <div data-chargement="langues" aria-busy="true">
          <SqueletteListe lignes={5} />
        </div>
      ) : langues.length === 0 ? (
        <EtatVide ton="neutre" icone={<Languages />} titre={t('admin.langues.vide')} />
      ) : (
        <ul className="divide-y divide-bordure verre rounded-xl" aria-label={t('admin.onglets.langues')}>
          {langues.map((l) => (
            <li key={l.code} className={cn('flex items-center gap-3 px-3 py-2', !l.actif && 'opacity-70')} data-langue={l.code}>
              <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1.5 font-mono text-xs font-semibold text-texte-2 uppercase">{l.code}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 text-sm font-medium text-texte">
                  <span className="truncate" lang={l.code}>
                    {l.nom_local}
                  </span>
                  <span className="hidden shrink-0 truncate text-xs font-normal text-texte-3 sm:inline">
                    · {l.nom_fr} / {l.nom_en}
                  </span>
                </p>
                <p className="line-clamp-2 text-xs text-texte-3">
                  {libellePays(l.pays)} · {t('admin.langues.audios', { count: l.audios_publies })}
                </p>
              </div>
              <Interrupteur
                coche={l.actif}
                onChange={() => bascule.mutate(l)}
                desactive={l.code === 'fr' || bascule.isPending}
                libelle={<span className="sr-only">{t('admin.langues.active')}</span>}
                voix="admin.langues.active"
                className="shrink-0"
              />
              <BoutonIcone libelle={t('admin.langues.modifier')} icone={<Pencil />} voix="admin.langues.modifier" taille="sm" onClick={() => setEdition(l)} />
              {l.code !== 'fr' && l.audios_publies === 0 ? (
                <BoutonIcone libelle={t('admin.langues.supprimer')} icone={<Trash2 />} voix="admin.langues.supprimer" variante="danger" taille="sm" onClick={() => setASupprimer(l)} />
              ) : (
                // Place réservée : les interrupteurs restent alignés d'une ligne à l'autre.
                <span className="size-9 shrink-0" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}
      <BoutonLien to="/admin/studio" variante="fantome" taille="sm" icone={<Mic />} voix="admin.langues.enregistrerNom" className="self-start">
        {t('admin.langues.enregistrerNom')}
      </BoutonLien>

      {edition && <FormulaireLangue langue={edition === 'nouvelle' ? null : edition} onFermer={() => setEdition(null)} />}

      <Dialogue
        ouvert={Boolean(aSupprimer)}
        onOuvertChange={(o) => !o && setASupprimer(null)}
        titre={t('admin.langues.supprimerTitre', { nom: aSupprimer?.nom_local ?? '' })} voix="admin.langues.supprimerTitre"
        description={t('admin.langues.supprimerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setASupprimer(null)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<Trash2 />} voix="admin.langues.supprimer" chargement={suppression.isPending} onClick={() => aSupprimer && suppression.mutate(aSupprimer)}>
              {t('admin.langues.supprimer')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}

/** Fenêtre d'ajout / de modification d'une langue (le code ne change plus après la création). */
function FormulaireLangue({ langue, onFermer }: { langue: LangueAdmin | null; onFermer: () => void }) {
  const { t } = useTranslation()
  const message = useMessageCatalogue()
  const [code, setCode] = useState(langue?.code ?? '')
  const [nomLocal, setNomLocal] = useState(langue?.nom_local ?? '')
  const [nomFr, setNomFr] = useState(langue?.nom_fr ?? '')
  const [nomEn, setNomEn] = useState(langue?.nom_en ?? '')
  const [pays, setPays] = useState<CodePays[]>(langue?.pays ?? [])
  const [actif, setActif] = useState(langue?.actif ?? true)
  const [erreurs, setErreurs] = useState<Record<string, string | undefined>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  useSaisieEnCours(true)

  const mutation = useMutation({
    mutationFn: () => {
      const corps = { nom_local: nomLocal.trim(), nom_fr: nomFr.trim(), nom_en: nomEn.trim(), pays, actif }
      return langue ? modifierLangue(langue.code, corps) : creerLangue({ ...corps, code: code.trim() })
    },
    onSuccess: () => {
      invaliderCatalogue()
      notifier({ type: 'succes', titre: langue ? t('admin.langues.enregistree') : t('admin.langues.creee'), voix: langue ? 'admin.langues.enregistree' : 'admin.langues.creee' })
      onFermer()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) {
        setErreurs({ code: e.champ('code'), nom_local: e.champ('nom_local'), nom_fr: e.champ('nom_fr'), nom_en: e.champ('nom_en'), pays: e.champ('pays') })
        setErreur(null)
      } else setErreur(message(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    const champs: Record<string, string | undefined> = {}
    if (!langue && !MOTIF_CODE_LANGUE.test(code.trim())) champs.code = t('admin.langues.codeAide')
    for (const [cle, v] of [['nom_local', nomLocal], ['nom_fr', nomFr], ['nom_en', nomEn]] as const) if (v.trim().length < 2) champs[cle] = t('auth.champRequis')
    setErreurs(champs)
    if (Object.values(champs).some(Boolean)) return
    mutation.mutate()
  }

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && onFermer()}
      titre={langue ? t('admin.langues.modifierTitre', { nom: langue.nom_local }) : t('admin.langues.ajouter')} voix={langue ? 'admin.langues.modifierTitre' : 'admin.langues.ajouter'}
      taille="md"
    >
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3" data-formulaire-langue>
        {!langue && (
          <Champ
            libelle={t('admin.langues.code')} voix="admin.langues.code"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z-]/g, ''))}
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            placeholder="bm"
            aide={t('admin.langues.codeAide')}
            erreur={erreurs.code}
            className="font-mono"
          />
        )}
        <Champ libelle={t('admin.langues.nomLocal')} voix="admin.langues.nomLocal" value={nomLocal} onChange={(e) => setNomLocal(e.target.value)} maxLength={40} aide={t('admin.langues.nomLocalAide')} erreur={erreurs.nom_local} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle={t('admin.langues.nomFr')} voix="admin.langues.nomFr" value={nomFr} onChange={(e) => setNomFr(e.target.value)} maxLength={40} erreur={erreurs.nom_fr} />
          <Champ libelle={t('admin.langues.nomEn')} voix="admin.langues.nomEn" value={nomEn} onChange={(e) => setNomEn(e.target.value)} maxLength={40} erreur={erreurs.nom_en} />
        </div>
        <ChoixPays valeur={pays} onChange={setPays} libelle={t('admin.langues.pays')} aide={t('admin.langues.paysAide')} erreur={erreurs.pays} />
        <Interrupteur coche={actif} onChange={setActif} desactive={langue?.code === 'fr'} libelle={t('admin.langues.active')} description={t('admin.langues.activeAide')} voix="admin.langues.active" />
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
