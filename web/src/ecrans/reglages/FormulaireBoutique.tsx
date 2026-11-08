import { useMutation } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { modifierBoutique } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import type { BoutiqueDetail } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Champ } from '@/composants/Champ'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { invaliderBoutique } from './invalider'

/** Carte « Ma boutique » : nom, téléphone, ville. Remontée par `key` quand la boutique change (voir Reglages). */
export function FormulaireBoutique({ boutique }: { boutique: BoutiqueDetail }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [nom, setNom] = useState(boutique.nom)
  const [telephone, setTelephone] = useState(boutique.telephone ?? '')
  const [ville, setVille] = useState(boutique.ville)
  // Saisie en cours seulement si le formulaire a été modifié : un formulaire intact ne bloque pas le temps réel.
  useSaisieEnCours(nom !== boutique.nom || telephone !== (boutique.telephone ?? '') || ville !== boutique.ville)
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<Record<string, string | undefined>>({})

  const mutation = useMutation({
    mutationFn: modifierBoutique,
    onSuccess: () => {
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invaliderBoutique()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) {
        setErreursChamps({ nom: e.champ('nom'), telephone: e.champ('telephone'), ville: e.champ('ville') })
        setErreur(e.champ('nom') || e.champ('telephone') || e.champ('ville') ? null : messageErreur(e))
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
    mutation.mutate({ nom: nom.trim(), telephone: telephone.trim() || null, ville: ville.trim() })
  }

  return (
    <Carte rembourrage="sm">
      <CarteEnTete titre={t('reglages.boutique')} className="mb-2" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <Champ libelle={t('reglages.nom')} value={nom} onChange={(e) => setNom(e.target.value)} erreur={erreursChamps.nom} autoComplete="organization" maxLength={60} />
        <Champ libelle={t('reglages.telephone')} type="tel" inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} erreur={erreursChamps.telephone} mentionOptionnel={t('commun.optionnel')} autoComplete="tel" />
        <Champ libelle={t('reglages.ville')} value={ville} onChange={(e) => setVille(e.target.value)} erreur={erreursChamps.ville} autoComplete="address-level2" maxLength={60} />
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" icone={<Save />} voix="commun.enregistrer" chargement={mutation.isPending} className="self-end">
          {t('commun.enregistrer')}
        </Bouton>
      </form>
    </Carte>
  )
}
