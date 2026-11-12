import { useTranslation } from 'react-i18next'
import { usePaysCourant } from '@/api/catalogue'
import { Bouton } from '@/composants/Bouton'
import { Dialogue } from '@/composants/Dialogue'
import { appliquerChoixLangue, ChoixPays, TuilesLangues, useTuilesLangues, type TuileLangue } from '@/ecrans/langue/ChoixLangue'
import { localeCourante } from '@/i18n'
import { HautParleur } from '@/voix/HautParleur'

/**
 * Première visite (aucune langue choisie sur cet appareil) : avant tout le reste, le choix de la langue, à voir ET à
 * entendre (haut-parleur sur chaque tuile). Une langue locale active l'aide vocale : le guide de la page est alors lu
 * (le toucher sur la tuile est le geste qui autorise le son). « Continuer en français » referme sans voix.
 * Mêmes tuiles et même effet que l'écran `/langue`.
 */
export default function PanneauPremiereVisite({ onFermer }: { onFermer: () => void }) {
  const { t } = useTranslation()
  const pays = usePaysCourant()
  const tuiles = useTuilesLangues({ anglais: true })
  const locale = localeCourante()

  const choisir = (tuile: TuileLangue) => {
    appliquerChoixLangue(tuile, pays)
    onFermer()
  }
  const continuer = () => choisir(tuiles.find((x) => x.code === locale) ?? tuiles.find((x) => x.code === 'fr')!)

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && continuer()}
      taille="lg"
      titre={
        <span className="flex items-center gap-2">
          {t('langue.titre')}
          <HautParleur cle="langue.titre" langue="fr" taille={16} />
        </span>
      }
      description={t('langue.sousTitre')}
    >
      <div className="flex flex-col gap-4 pb-1" data-premiere-visite>
        <ChoixPays className="mx-0 self-start" />
        <TuilesLangues tuiles={tuiles} actif={null} onChoisir={choisir} libelle={t('langue.titre')} />
        <Bouton variante="fantome" pleineLargeur voix="voix.premiere.continuer" onClick={continuer} data-continuer>
          {t('voix.premiere.continuer')}
        </Bouton>
      </div>
    </Dialogue>
  )
}
