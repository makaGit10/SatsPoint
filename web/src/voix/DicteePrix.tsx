import { Mic } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { notifier } from '@/composants/toastStore'
import { formaterFCFA } from '@/lib/format'
import { arreter } from './lecteur'
import { prixDepuisTexte } from './prixParle'

/** Reconnaissance vocale du navigateur (Chrome, Android) : absente ailleurs → le bouton ne s'affiche pas. */
interface Reconnaissance {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}
type ConstructeurReconnaissance = new () => Reconnaissance

function constructeur(): ConstructeurReconnaissance | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: ConstructeurReconnaissance; webkitSpeechRecognition?: ConstructeurReconnaissance }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * « Dire le prix » : la personne touche le micro et dit « cent francs », « deux mille cinq cents »… ; le prix
 * compris s'écrit tout seul (en chiffres) et reste modifiable au pavé. Rien de compris → on le dit, rien n'est écrit.
 * Reconnaissance en français (les moteurs du téléphone ne connaissent pas le wolof) ; chargé à la demande.
 */
export default function DicteePrix({ onPrix, className, pleineLargeur, compact }: { onPrix: (prix: number) => void; className?: string; pleineLargeur?: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  const [ecoute, setEcoute] = useState(false)
  const reco = useRef<Reconnaissance | null>(null)
  useEffect(() => () => reco.current?.abort(), [])
  const Reco = constructeur()
  if (!Reco) return null

  const demarrer = () => {
    if (ecoute) {
      reco.current?.abort()
      return
    }
    arreter()
    const r = new Reco()
    r.lang = 'fr-FR'
    r.interimResults = false
    r.continuous = false
    r.maxAlternatives = 5
    let compris = false
    r.onresult = (e) => {
      const alternatives = Array.from(e.results[0] ?? []).map((a) => a.transcript)
      for (const texte of alternatives) {
        const prix = prixDepuisTexte(texte)
        if (prix !== null) {
          compris = true
          onPrix(prix)
          notifier({ type: 'succes', titre: t('dictee.compris', { prix: formaterFCFA(prix) }), voix: 'dictee.comprisCourt' })
          return
        }
      }
    }
    r.onerror = () => undefined
    r.onend = () => {
      setEcoute(false)
      reco.current = null
      if (!compris) notifier({ type: 'erreur', titre: t('dictee.incompris'), voix: 'dictee.incompris' })
    }
    reco.current = r
    setEcoute(true)
    try {
      r.start()
    } catch {
      setEcoute(false)
    }
  }

  if (compact)
    return (
      <BoutonIcone
        libelle={ecoute ? t('dictee.ecoute') : t('dictee.dire')}
        icone={<Mic className={ecoute ? 'anim-pulsation' : undefined} />}
        voix={ecoute ? 'dictee.ecoute' : 'dictee.dire'}
        actif={ecoute}
        onClick={demarrer}
        className={className}
        data-dictee-prix={ecoute ? 'ecoute' : 'pret'}
      />
    )
  return (
    <Bouton
      type="button"
      variante={ecoute ? 'primaire' : 'secondaire'}
      icone={<Mic className={ecoute ? 'anim-pulsation' : undefined} />}
      voix={ecoute ? 'dictee.ecoute' : 'dictee.dire'}
      onClick={demarrer}
      pleineLargeur={pleineLargeur}
      className={className}
      aria-pressed={ecoute}
      data-dictee-prix={ecoute ? 'ecoute' : 'pret'}
    >
      {ecoute ? t('dictee.ecoute') : t('dictee.dire')}
    </Bouton>
  )
}
