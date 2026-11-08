import { MailCheck, Phone, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useDemandeReinitialisation } from '@/auth/useMoi'
import { Bouton, BoutonLien } from '@/composants/Bouton'
import { Champ } from '@/composants/Champ'
import { EtatVide } from '@/composants/EtatVide'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { ErreurFormulaire, TitreAuth } from './communs'
import { useMessageErreur } from './useMessageErreur'

export default function MotDePasseOublie() {
  const { t } = useTranslation()
  const demande = useDemandeReinitialisation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours(!demande.isSuccess)

  const [identifiant, setIdentifiant] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreurChamp, setErreurChamp] = useState<string | undefined>()

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    if (!identifiant.trim()) {
      setErreurChamp(t('auth.champRequis'))
      return
    }
    setErreurChamp(undefined)
    demande.mutate(identifiant.trim(), { onError: (err) => setErreur(messageErreur(err)) })
  }

  if (demande.isSuccess) {
    return (
      <MiseEnPageInvite ecran="oubli-envoye">
        <EtatVide
          ton="succes"
          icone={<MailCheck />}
          titre={t('auth.oubli.envoyeTitre')}
          texte={t('auth.oubli.envoye')}
          action={
            <BoutonLien to="/connexion" variante="secondaire">
              {t('auth.oubli.retourConnexion')}
            </BoutonLien>
          }
        />
      </MiseEnPageInvite>
    )
  }

  return (
    <MiseEnPageInvite ecran="oubli">
      <TitreAuth titre={t('auth.oubli.titre')} sousTitre={t('auth.oubli.sousTitre')} voix="auth.oubli.titre" />
      <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
        <Champ
          libelle={t('auth.oubli.identifiant')}
          name="identifiant"
          autoComplete="username"
          inputMode="email"
          icone={<Phone />}
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          erreur={erreurChamp}
          autoCapitalize="none"
          spellCheck={false}
        />
        <ErreurFormulaire message={erreur} />
        <Bouton type="submit" taille="lg" pleineLargeur chargement={demande.isPending} icone={<Send />} voix="auth.oubli.valider">
          {t('auth.oubli.valider')}
        </Bouton>
      </form>
      <Link to="/connexion" className="mt-6 self-center text-sm font-medium text-accent-texte hover:underline">
        {t('auth.oubli.retourConnexion')}
      </Link>
    </MiseEnPageInvite>
  )
}
