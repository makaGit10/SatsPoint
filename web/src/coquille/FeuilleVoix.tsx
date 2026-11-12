import { Square, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePaysCourant } from '@/api/catalogue'
import { Bouton } from '@/composants/Bouton'
import { Dialogue } from '@/composants/Dialogue'
import { Interrupteur } from '@/composants/Interrupteur'
import { ChoixPays, TuilesLangues, useTuilesLangues, type TuileLangue } from '@/ecrans/langue/ChoixLangue'
import { CLES_STOCKAGE, ecrireStockage, langueChoisie } from '@/lib/stockage'
import { jouerGuide, useGuideCourant } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'
import { useVoix } from '@/voix/store'
import { usePreferences } from './usePreferences'

/**
 * Feuille « Aide vocale » (bouton 🔊 + code de langue de l'en-tête) : écouter l'aide de la page, activer / couper la voix,
 * choisir le pays puis la langue de la voix (chaque langue avec son haut-parleur). Chargée à la demande avec le paquet `guide`.
 */
export default function FeuilleVoix({ onFermer }: { onFermer: () => void }) {
  const { t } = useTranslation()
  const guide = useGuideCourant()
  const activee = useVoix((s) => s.activee)
  const langueAudio = useVoix((s) => s.langueAudio)
  const guideEnLecture = useVoix((s) => guide !== null && s.cleEnLecture === guide)
  const paysCourant = usePaysCourant()
  const { changerLangueAudio, changerAideVocale } = usePreferences()
  const tuiles = useTuilesLangues({ anglais: false })

  const choisir = (tuile: TuileLangue) => {
    useVoix.getState().definirPays(paysCourant)
    changerLangueAudio(tuile.code)
    if (!activee) changerAideVocale(true)
    // Choisir une voix vaut choix de la langue au premier lancement (pas de passage forcé par /langue ensuite).
    if (!langueChoisie()) ecrireStockage(CLES_STOCKAGE.langueChoisie, tuile.code)
  }

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && onFermer()}
      taille="md"
      titre={
        <span className="flex items-center gap-2">
          {t('voix.feuille.titre')}
          <HautParleur cle="voix.feuille.titre" taille={16} />
        </span>
      }
      description={t('voix.feuille.sousTitre')}
    >
      <div className="flex flex-col gap-4 pb-1" data-feuille-voix>
        {guide ? (
          <Bouton
            taille="lg"
            pleineLargeur
            icone={guideEnLecture ? <Square className="fill-current" /> : <Volume2 />}
            voix="voix.feuille.ecouterPage"
            onClick={() => void jouerGuide(guide)}
            data-ecouter-page
          >
            {t('voix.feuille.ecouterPage')}
          </Bouton>
        ) : (
          <p className="text-sm text-texte-3">{t('voix.feuille.aucuneAide')}</p>
        )}

        <Interrupteur
          coche={activee}
          onChange={changerAideVocale}
          libelle={t('voix.feuille.activer')}
          description={t('voix.feuille.activerAide')}
          voix="voix.feuille.activer"
          className="rounded-xl border border-bordure bg-surface px-3 py-2.5"
        />

        <section className="flex flex-col gap-2" aria-label={t('voix.feuille.langues')}>
          <h3 className="flex items-center gap-1 text-xs font-semibold tracking-wide text-texte-3 uppercase">
            {t('voix.feuille.langues')}
            <HautParleur cle="voix.feuille.langues" />
          </h3>
          <ChoixPays className="mx-0 self-start" />
          <TuilesLangues tuiles={tuiles} actif={activee ? langueAudio : null} onChoisir={choisir} compactes libelle={t('voix.feuille.langues')} />
        </section>
      </div>
    </Dialogue>
  )
}
