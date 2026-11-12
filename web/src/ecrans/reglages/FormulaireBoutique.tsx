import { useMutation } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { modifierBoutique, type ModificationBoutique } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import { useCatalogue } from '@/api/catalogue'
import type { BoutiqueDetail, CodePays } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Champ } from '@/composants/Champ'
import { Selection } from '@/composants/Selection'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { nomPays, PAYS_DEFAUT } from '@/lib/catalogue'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { invaliderBoutique } from './invalider'

/**
 * Carte « Ma boutique » : nom, téléphone, ville, pays (propriétaire seulement, CONTRAT_API § 14.3).
 * Remontée par `key` quand la boutique change (voir Reglages).
 */
export function FormulaireBoutique({ boutique, proprietaire }: { boutique: BoutiqueDetail; proprietaire: boolean }) {
  const { t, i18n } = useTranslation()
  const messageErreur = useMessageErreur()
  const catalogue = useCatalogue()
  const paysInitial = boutique.pays ?? PAYS_DEFAUT
  const [nom, setNom] = useState(boutique.nom)
  const [telephone, setTelephone] = useState(boutique.telephone ?? '')
  const [ville, setVille] = useState(boutique.ville)
  const [pays, setPays] = useState<CodePays>(paysInitial)
  // Saisie en cours seulement si le formulaire a été modifié : un formulaire intact ne bloque pas le temps réel.
  useSaisieEnCours(nom !== boutique.nom || telephone !== (boutique.telephone ?? '') || ville !== boutique.ville || pays !== paysInitial)
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<Record<string, string | undefined>>({})

  // Le pays de la boutique reste listé même s'il a été désactivé au catalogue.
  const optionsPays = catalogue.pays.some((p) => p.code === paysInitial) ? catalogue.pays : [...catalogue.pays, { code: paysInitial, nom_fr: paysInitial, nom_en: paysInitial, indicatif: '' }]

  const mutation = useMutation({
    mutationFn: modifierBoutique,
    onSuccess: () => {
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invaliderBoutique()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) {
        setErreursChamps({ nom: e.champ('nom'), telephone: e.champ('telephone'), ville: e.champ('ville'), pays: e.champ('pays') })
        setErreur(e.champ('nom') || e.champ('telephone') || e.champ('ville') || e.champ('pays') ? null : messageErreur(e))
      } else setErreur(messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: Record<string, string | undefined> = {}
    if (!nom.trim()) champs.nom = t('auth.champRequis')
    if (!ville.trim()) champs.ville = t('auth.champRequis')
    setErreursChamps(champs)
    if (champs.nom || champs.ville) return
    const corps: ModificationBoutique = { nom: nom.trim(), telephone: telephone.trim() || null, ville: ville.trim() }
    // Le pays n'est envoyé que s'il change, et seulement par le propriétaire (le serveur refuse le gérant).
    if (proprietaire && pays !== paysInitial) corps.pays = pays
    mutation.mutate(corps)
  }

  return (
    <Carte rembourrage="sm">
      <CarteEnTete titre={t('reglages.boutique')} className="mb-2" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <Champ libelle={t('reglages.nom')} voix="reglages.nom" value={nom} onChange={(e) => setNom(e.target.value)} erreur={erreursChamps.nom} autoComplete="organization" maxLength={60} />
        <Champ libelle={t('reglages.telephone')} voix="reglages.telephone" type="tel" inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} erreur={erreursChamps.telephone} mentionOptionnel={t('commun.optionnel')} autoComplete="tel" />
        <Champ libelle={t('reglages.ville')} voix="reglages.ville" value={ville} onChange={(e) => setVille(e.target.value)} erreur={erreursChamps.ville} autoComplete="address-level2" maxLength={60} />
        {optionsPays.length > 1 && (
          <Selection
            libelle={t('reglages.pays')} voix="reglages.pays"
            value={pays}
            onChange={(e) => setPays(e.target.value as CodePays)}
            disabled={!proprietaire}
            options={optionsPays.map((p) => ({ valeur: p.code, libelle: nomPays(p, i18n.language) }))}
            aide={!proprietaire ? t('reglages.paysProprietaire') : pays !== paysInitial ? t('reglages.paysAide') : undefined}
            erreur={erreursChamps.pays}
            data-champ-pays
          />
        )}
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" icone={<Save />} voix="commun.enregistrer" chargement={mutation.isPending} className="self-end">
          {t('commun.enregistrer')}
        </Bouton>
      </form>
    </Carte>
  )
}
