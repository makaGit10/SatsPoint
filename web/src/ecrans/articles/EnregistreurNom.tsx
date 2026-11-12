import { Check, Mic, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { useEnregistreur } from '@/ecrans/admin/studio/useEnregistreur'
import { cn } from '@/lib/cn'
import { arreter as arreterLecteur } from '@/voix/lecteur'
import { HautParleur } from '@/voix/HautParleur'
import { couperSilences } from './decoupeSilences'

/** Le nom d'un article se dit en quelques secondes : arrêt automatique à 5 s (le serveur accepte 7 s au plus). */
export const DUREE_NOM_MS = 5_000

export interface ValeurVoix {
  /** URL d'écoute (enregistrement local ou fichier déjà publié). */
  url: string
  /** Nouvel enregistrement à envoyer ; absent pour la voix déjà enregistrée sur le serveur. */
  blob?: Blob
}

/**
 * Nom dit à voix haute : un gros bouton micro → décompte 3-2-1 → « Parlez maintenant » (vumètre, 5 s au plus)
 * → réécoute automatique → garder ✓ ou recommencer ↻. Les silences sont coupés avant l'envoi.
 * Le micro est piloté par l'enregistreur du studio audio (même autorisation, même décompte).
 */
export function EnregistreurNom({ valeur, onChange }: { valeur: ValeurVoix | null; onChange: (v: ValeurVoix | null) => void }) {
  const { t } = useTranslation()
  const rec = useEnregistreur()
  const { phase, decompte, dureeMs, historique, blob, erreur } = rec.etat
  const [prise, setPrise] = useState<ValeurVoix | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const urlsCreees = useRef<string[]>([])

  // Arrêt automatique à 5 s.
  useEffect(() => {
    if (phase === 'enregistrement' && dureeMs >= DUREE_NOM_MS) rec.arreter()
  }, [phase, dureeMs, rec])

  // Fin d'enregistrement : silences coupés, puis réécoute automatique (la personne entend ce qu'elle a dit).
  useEffect(() => {
    if (phase !== 'pret' || !blob) return
    let annule = false
    void couperSilences(blob).then(({ blob: coupe }) => {
      if (annule) return
      const url = URL.createObjectURL(coupe)
      urlsCreees.current.push(url)
      setPrise({ url, blob: coupe })
      rec.reinitialiser()
      jouer(url)
    })
    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, blob])

  useEffect(
    () => () => {
      audio.current?.pause()
      for (const u of urlsCreees.current) URL.revokeObjectURL(u)
    },
    [],
  )

  function jouer(url: string) {
    arreterLecteur()
    audio.current?.pause()
    const a = new Audio(url)
    audio.current = a
    a.onended = () => setEnLecture(false)
    a.onerror = () => setEnLecture(false)
    setEnLecture(true)
    void a.play().catch(() => setEnLecture(false))
  }
  function basculerLecture(url: string) {
    if (enLecture) {
      audio.current?.pause()
      setEnLecture(false)
    } else jouer(url)
  }

  const actif = phase === 'demande' || phase === 'decompte' || phase === 'enregistrement'
  const message =
    phase === 'refuse' ? t('articles.form.micRefuse') : phase === 'indisponible' ? t('articles.form.micIndisponible') : phase === 'erreur' ? t(erreur === 'tropCourt' ? 'articles.form.tropCourt' : 'articles.form.enregistrementErreur') : null

  // Prise à valider (réécoute / garder / recommencer).
  if (prise && !actif) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent-doux p-2" data-enregistreur="prise">
        <BoutonIcone taille="lg" variante="secondaire" libelle={t('articles.form.reecouter')} icone={enLecture ? <Pause /> : <Play />} voix="articles.form.reecouter" onClick={() => basculerLecture(prise.url)} />
        <span className="min-w-0 flex-1 text-sm font-semibold text-texte">{t('articles.form.voixPrete')}</span>
        <BoutonIcone taille="lg" variante="secondaire" libelle={t('articles.form.refaire')} icone={<RotateCcw />} voix="articles.form.refaire" onClick={() => { setPrise(null); rec.demarrer() }} />
        <BoutonIcone taille="lg" variante="primaire" libelle={t('articles.form.garder')} icone={<Check />} voix="articles.form.garder" onClick={() => { audio.current?.pause(); onChange(prise); setPrise(null) }} />
      </div>
    )
  }

  // Voix déjà gardée (nouvelle ou enregistrée sur le serveur).
  if (valeur && !actif) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-bordure bg-surface p-2" data-enregistreur="garde">
        <BoutonIcone taille="lg" variante="secondaire" libelle={t('articles.form.reecouter')} icone={enLecture ? <Pause /> : <Play />} voix="articles.form.reecouter" onClick={() => basculerLecture(valeur.url)} />
        <span className="min-w-0 flex-1 text-sm font-semibold text-texte">{t('articles.form.voixPrete')}</span>
        <BoutonIcone taille="lg" variante="secondaire" libelle={t('articles.form.refaire')} icone={<Mic />} voix="articles.form.refaire" onClick={() => rec.demarrer()} />
        <BoutonIcone taille="lg" variante="danger" libelle={t('articles.form.supprimerVoix')} icone={<Trash2 />} voix="articles.form.supprimerVoix" onClick={() => onChange(null)} />
      </div>
    )
  }

  const progression = Math.min(1, dureeMs / DUREE_NOM_MS)
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-bordure bg-surface p-3" data-enregistreur={phase}>
      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          onClick={() => (actif ? rec.arreter() : rec.demarrer())}
          aria-label={actif ? t('articles.form.arreter') : t('articles.form.parler')}
          data-bouton-micro
          className={cn(
            'relative flex size-16 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform active:scale-95',
            phase === 'enregistrement' ? 'bg-danger text-white' : 'fond-or text-sur-accent',
          )}
        >
          {phase === 'decompte' ? <span className="text-3xl font-extrabold tabulaire">{decompte}</span> : phase === 'enregistrement' ? <Square size={24} fill="currentColor" aria-hidden="true" /> : <Mic size={30} aria-hidden="true" />}
          {phase === 'enregistrement' && (
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeOpacity="0.9" strokeWidth="3" strokeDasharray={`${progression * 188.5} 188.5`} />
            </svg>
          )}
          <HautParleur cle={actif ? 'articles.form.arreter' : 'articles.form.parler'} dansBouton />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texte" aria-live="polite">
            {phase === 'decompte' || phase === 'demande' ? t('articles.form.preparezVous') : phase === 'enregistrement' ? t('articles.form.parlezMaintenant') : t('articles.form.parler')}
          </p>
          {/* Vumètre : la personne voit que le téléphone l'entend. */}
          <div className="mt-1.5 flex h-6 items-end gap-[3px]" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => {
              const n = historique[historique.length - 16 + i] ?? 0
              return <span key={i} className={cn('w-1.5 rounded-full', phase === 'enregistrement' ? 'bg-danger' : 'bg-bordure')} style={{ height: `${Math.max(12, Math.round(n * 100))}%` }} />
            })}
          </div>
        </div>
      </div>
      {message && (
        <p role="alert" className="w-full rounded-md bg-danger-doux px-2.5 py-1.5 text-xs font-medium text-danger-texte">
          {message}
        </p>
      )}
    </div>
  )
}
