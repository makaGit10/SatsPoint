import { useMutation } from '@tanstack/react-query'
import { FlaskConical, Save, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { enregistrerPaytech, supprimerPaytech, verifierPaytech } from '@/api/boutique'
import { ErreurApi } from '@/api/client'
import type { BoutiqueDetail } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Carte, CarteEnTete } from '@/composants/Carte'
import { Dialogue } from '@/composants/Dialogue'
import { Pastille } from '@/composants/Pastille'
import { Segment } from '@/composants/Segment'
import { notifier } from '@/composants/toastStore'
import { ChampMotDePasse, ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'
import { invaliderBoutique } from './invalider'

type Environnement = 'test' | 'prod'

/** Carte PayTech : clés jamais réaffichées (champ vide = conserver), environnement, test, suppression. */
export function FormulairePaytech({ boutique, proprietaire }: { boutique: BoutiqueDetail; proprietaire: boolean }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const configure = boutique.paytech.configure

  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [environnement, setEnvironnement] = useState<Environnement>(boutique.paytech.environnement)
  useSaisieEnCours(proprietaire && (apiKey !== '' || apiSecret !== '' || environnement !== boutique.paytech.environnement))
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreursChamps, setErreursChamps] = useState<{ api_key?: string; api_secret?: string }>({})
  const [suppressionOuverte, setSuppressionOuverte] = useState(false)

  const enregistrement = useMutation({
    mutationFn: enregistrerPaytech,
    onSuccess: () => {
      setApiKey('')
      setApiSecret('')
      notifier({ type: 'succes', titre: t('reglages.enregistre'), voix: 'reglages.enregistre' })
      invaliderBoutique()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation) setErreursChamps({ api_key: e.champ('api_key'), api_secret: e.champ('api_secret') })
      else setErreur(messageErreur(e))
    },
  })
  const test = useMutation({
    mutationFn: verifierPaytech,
    onSuccess: (r) => notifier({ type: r.ok ? 'succes' : 'erreur', titre: t('reglages.tester'), description: r.message }),
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })
  const suppression = useMutation({
    mutationFn: supprimerPaytech,
    onSuccess: () => {
      setSuppressionOuverte(false)
      notifier({ type: 'info', titre: t('reglages.supprimerCles') })
      invaliderBoutique()
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    const champs: typeof erreursChamps = {}
    if (!configure) {
      if (!apiKey.trim()) champs.api_key = t('auth.champRequis')
      if (!apiSecret.trim()) champs.api_secret = t('auth.champRequis')
    }
    setErreursChamps(champs)
    if (champs.api_key || champs.api_secret) return
    enregistrement.mutate({
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      ...(apiSecret.trim() ? { api_secret: apiSecret.trim() } : {}),
      environnement,
    })
  }

  const etat = (
    <Pastille ton={configure ? 'succes' : 'neutre'} point>
      {configure ? `${t('reglages.configure')} · ${t(`reglages.${boutique.paytech.environnement}`)}` : t('reglages.nonConfigure')}
    </Pastille>
  )

  return (
    <Carte rembourrage="sm">
      <CarteEnTete titre={t('reglages.paytechTitre')} sousTitre={t('reglages.paytechTexte')} actions={etat} className="mb-2" />
      {proprietaire ? (
        <form onSubmit={soumettre} noValidate className="flex flex-col gap-3">
          <ChampMotDePasse libelle={t('reglages.apiKey')} name="paytech_api_key" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} erreur={erreursChamps.api_key} aide={configure ? t('reglages.secretAide') : undefined} />
          <ChampMotDePasse libelle={t('reglages.apiSecret')} name="paytech_api_secret" autoComplete="off" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} erreur={erreursChamps.api_secret} aide={configure ? t('reglages.secretAide') : undefined} />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-texte-2">{t('reglages.environnement')}</p>
            <Segment<Environnement>
              libelle={t('reglages.environnement')}
              valeur={environnement}
              onChange={setEnvironnement}
              options={[
                { valeur: 'test', libelle: t('reglages.test') },
                { valeur: 'prod', libelle: t('reglages.prod') },
              ]}
            />
          </div>
          <ErreurFormulaire message={erreur} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {configure && (
              <>
                <Bouton variante="fantome" taille="sm" icone={<Trash2 />} voix="reglages.supprimerCles" className="mr-auto text-danger-texte hover:bg-danger-doux" onClick={() => setSuppressionOuverte(true)}>
                  {t('reglages.supprimerCles')}
                </Bouton>
                <Bouton variante="secondaire" icone={<FlaskConical />} voix="reglages.tester" chargement={test.isPending} onClick={() => test.mutate()}>
                  {t('reglages.tester')}
                </Bouton>
              </>
            )}
            <Bouton type="submit" icone={<Save />} voix="commun.enregistrer" chargement={enregistrement.isPending}>
              {t('commun.enregistrer')}
            </Bouton>
          </div>
        </form>
      ) : (
        <p className="text-sm text-texte-3">{t('erreurs.accesRefuse')}</p>
      )}
      <Dialogue
        ouvert={suppressionOuverte}
        onOuvertChange={setSuppressionOuverte}
        titre={t('reglages.supprimerTitre')}
        description={t('reglages.supprimerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setSuppressionOuverte(false)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<Trash2 />} voix="reglages.supprimerCles" chargement={suppression.isPending} onClick={() => suppression.mutate()}>
              {t('reglages.supprimerCles')}
            </Bouton>
          </>
        }
      />
    </Carte>
  )
}
