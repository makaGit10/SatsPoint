import { useMutation } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Loader2, Mic, MicOff, Play, RotateCcw, Send, Square, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_MATRICE, deposerAudio, publierAudios, supprimerAudio } from '@/api/admin'
import type { CleAudio, LangueAudio, StatutAudio } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Pastille, type TonPastille } from '@/composants/Pastille'
import { notifier } from '@/composants/toastStore'
import { Touche } from '@/composants/Touche'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { queryClient } from '@/lib/queryClient'
import { HautParleur } from '@/voix/HautParleur'
import { lire } from '@/voix/lecteur'
import { useVoix } from '@/voix/store'
import { DUREE_MAX_MS, formaterDuree, NOMBRE_BARRES } from './enregistreur'
import { IconeStatut } from './IconeStatut'
import { EXTENSIONS_AUDIO, verifierFichierAudio, type RefusFichier } from './selection'
import type { Enregistreur } from './useEnregistreur'

const TONS: Record<StatutAudio, TonPastille> = { publie: 'succes', brouillon: 'attente', en_traitement: 'neutre', erreur: 'danger', manquant: 'neutre' }

/** Durée d'un fichier audio (métadonnées), `null` si illisible dans ce navigateur. */
function lireDuree(fichier: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(fichier)
    const audio = new Audio()
    const fin = (valeur: number | null) => {
      URL.revokeObjectURL(url)
      resolve(valeur)
    }
    const minuterie = setTimeout(() => fin(null), 3000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      clearTimeout(minuterie)
      fin(Number.isFinite(audio.duration) ? audio.duration * 1000 : null)
    }
    audio.onerror = () => {
      clearTimeout(minuterie)
      fin(null)
    }
    audio.src = url
  })
}

function extensionPour(blob: Blob): string {
  if (blob.type.includes('mp4')) return 'm4a'
  if (blob.type.includes('ogg')) return 'ogg'
  return 'webm'
}

/** Le raccourci s'applique-t-il ? (pas pendant une saisie, ni avec une touche de modification) */
function raccourciPermis(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  const cible = e.target as HTMLElement | null
  if (!cible) return true
  const balise = cible.tagName
  return !(balise === 'INPUT' || balise === 'TEXTAREA' || balise === 'SELECT' || cible.isContentEditable)
}

export interface PropsPanneau {
  cle: CleAudio
  langue: LangueAudio
  nomLangue: string
  /** Après validation : passer à la case suivante (mode rafale) ; `demarrer` relance aussitôt le décompte. */
  rafale: boolean
  onValide: () => void
  onSuivant: () => void
  onPrecedent: () => void
  /** Raccourcis clavier actifs. */
  clavier: boolean
  /** Enregistreur (porté par l'écran : le micro reste ouvert d'une case à l'autre en mode rafale). */
  rec: Enregistreur
}

/** Panneau d'enregistrement : textes de la clé, micro (3-2-1, vumètre, 15 s), dépôt de fichier, brouillon, publication. */
export function PanneauEnregistrement({ cle, langue, nomLangue, rafale, onValide, onSuivant, onPrecedent, clavier, rec }: PropsPanneau) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const { etat } = rec
  const cellule = cle.etats[langue] ?? { statut: 'manquant' as const }
  // Refus de fichier rattaché à sa case : il disparaît tout seul quand on change de case.
  const [refusCase, setRefusCase] = useState<{ case: string; refus: RefusFichier } | null>(null)
  const idCase = `${cle.cle}|${langue}`
  const refus = refusCase?.case === idCase ? refusCase.refus : null
  const setRefus = (r: RefusFichier | null) => setRefusCase(r ? { case: idCase, refus: r } : null)
  const [survol, setSurvol] = useState(false)
  const entreeFichier = useRef<HTMLInputElement>(null)
  const enLecture = useVoix((s) => s.cleEnLecture)

  const invalider = () => void queryClient.invalidateQueries({ queryKey: CLE_MATRICE })

  const envoi = useMutation({
    mutationFn: ({ fichier, nom }: { fichier: Blob; nom: string }) => deposerAudio(cle.cle, langue, fichier, nom),
    onSuccess: () => {
      rec.reinitialiser()
      invalider()
      if (!rafale) notifier({ type: 'succes', titre: t('studio.envoye'), description: t('studio.envoyeTexte'), voix: 'studio.envoye' })
      onValide()
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })
  const publication = useMutation({
    mutationFn: () => publierAudios({ cle: cle.cle, langue }),
    onSuccess: () => {
      invalider()
      notifier({ type: 'succes', titre: t('studio.publie'), voix: 'studio.publie' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })
  const suppression = useMutation({
    mutationFn: (id: number) => supprimerAudio(id),
    onSuccess: () => {
      invalider()
      notifier({ type: 'info', titre: t('studio.supprime'), voix: 'studio.supprime' })
    },
    onError: (e) => notifier({ type: 'erreur', titre: messageErreur(e) }),
  })

  const valider = () => {
    if (etat.phase !== 'pret' || !etat.blob || envoi.isPending) return
    envoi.mutate({ fichier: etat.blob, nom: `${cle.cle}.${extensionPour(etat.blob)}` })
  }
  const publier = () => {
    if (cellule.statut === 'brouillon' && !publication.isPending) publication.mutate()
  }

  const deposer = async (fichier: File | undefined) => {
    if (!fichier) return
    const r = verifierFichierAudio(fichier)
    if (r) return setRefus(r)
    const duree = await lireDuree(fichier)
    if (duree !== null && duree > DUREE_MAX_MS + 500) return setRefus('duree')
    setRefus(null)
    rec.reinitialiser()
    envoi.mutate({ fichier, nom: fichier.name })
  }

  // Raccourcis : Espace enregistrer / arrêter, Entrée valider, R refaire, → suivant, ← précédent, P publier.
  const racine = useRef<HTMLElement>(null)
  const surTouche = useEffectEvent((e: KeyboardEvent) => {
    if (!raccourciPermis(e)) return
    // Une autre fenêtre est ouverte (confirmation, recherche) : les raccourcis du studio se taisent.
    const dialogue = document.querySelector('[role="dialog"]')
    if (dialogue && !(racine.current && dialogue.contains(racine.current))) return
    const phase = etat.phase
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault()
      e.stopPropagation()
      if (e.type !== 'keydown' || e.repeat) return
      if (phase === 'enregistrement' || phase === 'decompte' || phase === 'demande') rec.arreter()
      else rec.demarrer()
      return
    }
    if (e.type !== 'keydown') return
    if (e.key === 'Enter' && phase === 'pret') {
      e.preventDefault()
      valider()
    } else if ((e.key === 'r' || e.key === 'R') && (phase === 'pret' || phase === 'erreur')) {
      e.preventDefault()
      rec.refaire()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onSuivant()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onPrecedent()
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      publier()
    }
  })
  useEffect(() => {
    if (!clavier) return
    const ecouteur = (e: KeyboardEvent) => surTouche(e)
    // Phase de capture + keyup : l'Espace ne « clique » pas en plus sur le bouton qui a le focus.
    window.addEventListener('keydown', ecouteur, true)
    window.addEventListener('keyup', ecouteur, true)
    return () => {
      window.removeEventListener('keydown', ecouteur, true)
      window.removeEventListener('keyup', ecouteur, true)
    }
  }, [clavier])

  const cleLecture = `studio:${cle.cle}:${langue}:${cellule.id ?? 0}`
  const surDepot = (e: DragEvent) => {
    e.preventDefault()
    setSurvol(false)
    void deposer(e.dataTransfer.files[0])
  }

  return (
    <section ref={racine} className="flex flex-col gap-3" aria-label={t('studio.panneau')} data-panneau="enregistrement" data-phase={etat.phase}>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pastille ton="accent">{nomLangue}</Pastille>
            <Pastille ton={TONS[cellule.statut]} icone={<IconeStatut statut={cellule.statut} taille="sm" className="bg-transparent border-0" />}>
              {t(`studio.statuts.${cellule.statut}`)}
            </Pastille>
            {cle.essentielle && (
              <Pastille ton="accent" icone={<Star className="fill-current" />}>
                {t('studio.essentielle')}
              </Pastille>
            )}
          </div>
          <p className="mt-2 text-lg leading-snug font-semibold text-texte" lang="fr">
            « {cle.texte_fr} »
          </p>
          <p className="mt-0.5 text-sm text-texte-2" lang="en">
            {cle.texte_en}
          </p>
          <p className="mt-1 truncate text-xs text-texte-3">
            <code className="font-mono" data-technique>
              {cle.cle}
            </code> · {cle.contexte}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <BoutonIcone libelle={t('studio.precedent')} icone={<ChevronLeft />} voix="studio.precedent" taille="sm" onClick={onPrecedent} />
          <BoutonIcone libelle={t('studio.suivant')} icone={<ChevronRight />} voix="studio.suivant" taille="sm" onClick={onSuivant} />
        </div>
      </header>

      {cellule.statut !== 'manquant' && (
        <div className="flex items-center gap-2 rounded-md border border-bordure bg-fond-2 px-2.5 py-1.5" data-version={cellule.statut}>
          {cellule.statut === 'en_traitement' ? <Loader2 size={16} className="shrink-0 animate-spin text-texte-3" aria-hidden="true" /> : <IconeStatut statut={cellule.statut} taille="sm" />}
          <p className="min-w-0 flex-1 truncate text-xs text-texte-2">
            {cellule.statut === 'erreur' ? (cellule.erreur ?? t('studio.versions.erreur')) : t(`studio.versions.${cellule.statut}`)}
            {cellule.duree_ms ? <span className="text-texte-3 tabulaire"> · {formaterDuree(cellule.duree_ms)}</span> : null}
          </p>
          {cellule.url && (
            <BoutonIcone
              libelle={cellule.statut === 'brouillon' ? t('studio.ecouterBrouillon') : t('studio.ecouterPublie')}
              icone={enLecture === cleLecture ? <Square /> : <Play />}
              voix="studio.ecouterBrouillon"
              taille="sm"
              onClick={() => lire(cellule.url!, cleLecture)}
            />
          )}
          {cellule.statut === 'brouillon' && (
            <Bouton taille="sm" icone={<Send />} voix="studio.publier" chargement={publication.isPending} onClick={publier}>
              {t('studio.publier')}
            </Bouton>
          )}
          {(cellule.statut === 'brouillon' || cellule.statut === 'erreur') && typeof cellule.id === 'number' && (
            <BoutonIcone libelle={t('studio.supprimer')} icone={<Trash2 />} voix="studio.supprimer" variante="danger" taille="sm" disabled={suppression.isPending} onClick={() => suppression.mutate(cellule.id!)} />
          )}
        </div>
      )}

      <ZoneMicro rec={rec} envoiEnCours={envoi.isPending} onValider={valider} cleLecture="studio:prise" enLecture={enLecture === 'studio:prise'} />

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={surDepot}
        className={cn(
          'relative flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-accent/40',
          survol ? 'border-accent bg-accent-doux' : 'border-bordure-forte hover:border-texte-3',
        )}
        data-depot
      >
        <Upload size={16} className="shrink-0 text-texte-3" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-texte">{t('studio.deposer')}</span>
          <span className="block truncate text-2xs text-texte-3">{t('studio.deposerAide', { formats: EXTENSIONS_AUDIO.join(', ') })}</span>
        </span>
        <HautParleur cle="studio.deposer" />
        <input ref={entreeFichier} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.opus,.webm" className="sr-only" onChange={(e) => void deposer(e.target.files?.[0]).finally(() => { if (entreeFichier.current) entreeFichier.current.value = '' })} />
      </label>
      {refus && (
        <p role="alert" className="-mt-1.5 text-xs text-danger-texte">
          {t(`studio.refus.${refus}`)}
        </p>
      )}

      <Raccourcis />
    </section>
  )
}

function ZoneMicro({ rec, envoiEnCours, onValider, cleLecture, enLecture }: { rec: Enregistreur; envoiEnCours: boolean; onValider: () => void; cleLecture: string; enLecture: boolean }) {
  const { t } = useTranslation()
  const { etat } = rec
  const progression = Math.min(100, (etat.dureeMs / DUREE_MAX_MS) * 100)

  let contenu: ReactNode
  if (etat.phase === 'demande') {
    contenu = (
      <p className="flex items-center gap-2 text-sm text-texte-2" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        {t('studio.micro.autoriser')}
      </p>
    )
  } else if (etat.phase === 'decompte') {
    contenu = (
      <div className="flex flex-col items-center gap-1" role="status" aria-live="assertive">
        <span className="text-5xl leading-none font-bold text-accent-texte tabulaire" data-decompte={etat.decompte}>
          {etat.decompte}
        </span>
        <span className="text-xs text-texte-3">{t('studio.micro.preparez')}</span>
        <Bouton variante="fantome" taille="sm" voix="commun.annuler" onClick={rec.arreter} className="mt-1">
          {t('commun.annuler')}
        </Bouton>
      </div>
    )
  } else if (etat.phase === 'enregistrement') {
    contenu = (
      <div className="flex w-full flex-col items-center gap-2" role="status">
        <Vumetre niveaux={etat.historique} actif />
        <div className="flex w-full max-w-60 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-danger anim-pulsation" aria-hidden="true" />
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <span className="block h-full bg-danger" style={{ width: `${progression}%` }} />
          </span>
          <span className="text-xs text-texte-2 tabulaire">
            {formaterDuree(etat.dureeMs)} / {formaterDuree(DUREE_MAX_MS)}
          </span>
        </div>
        <Bouton variante="danger" icone={<Square className="fill-current" />} voix="studio.micro.arreter" onClick={rec.arreter} data-action="arreter">
          {t('studio.micro.arreter')}
        </Bouton>
      </div>
    )
  } else if (etat.phase === 'pret') {
    contenu = (
      <div className="flex w-full flex-col items-center gap-2">
        <Vumetre niveaux={etat.historique} />
        <p className="text-xs text-texte-2 tabulaire">{t('studio.micro.prise', { duree: formaterDuree(etat.dureeMs) })}</p>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <BoutonIcone libelle={t('studio.micro.reecouter')} icone={enLecture ? <Square /> : <Play />} voix="studio.micro.reecouter" variante="secondaire" onClick={() => etat.url && lire(etat.url, cleLecture)} />
          <Bouton variante="secondaire" icone={<RotateCcw />} voix="studio.micro.refaire" onClick={rec.refaire} disabled={envoiEnCours}>
            {t('studio.micro.refaire')}
          </Bouton>
          <Bouton icone={<Check />} voix="studio.micro.valider" chargement={envoiEnCours} onClick={onValider} data-action="valider">
            {t('studio.micro.valider')}
          </Bouton>
        </div>
      </div>
    )
  } else {
    const message =
      etat.phase === 'refuse' ? t('studio.micro.refuse') : etat.phase === 'indisponible' ? t('studio.micro.indisponible') : etat.phase === 'erreur' ? t(`studio.micro.erreurs.${etat.erreur ?? 'enregistrement'}`) : null
    const bloque = etat.phase === 'refuse' || etat.phase === 'indisponible'
    contenu = (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={rec.demarrer}
          aria-label={t('studio.micro.enregistrer')}
          data-action="enregistrer"
          className={cn(
            'zone-tactile relative inline-flex size-16 items-center justify-center rounded-full shadow-sm transition-transform duration-150 active:scale-95',
            bloque ? 'bg-surface-3 text-texte-3' : 'bg-danger text-white hover:brightness-110',
          )}
        >
          {bloque ? <MicOff size={26} aria-hidden="true" /> : <Mic size={26} aria-hidden="true" />}
          <HautParleur cle="studio.micro.enregistrer" dansBouton />
        </button>
        {message ? (
          <p role="alert" className="max-w-72 text-center text-xs text-danger-texte">
            {message}
          </p>
        ) : (
          <p className="text-xs text-texte-3">{t('studio.micro.aide')}</p>
        )}
      </div>
    )
  }

  return <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-bordure bg-fond-2 px-3 py-4">{contenu}</div>
}

/** Vumètre : barres verticales (niveaux récents), centrées. */
function Vumetre({ niveaux, actif = false }: { niveaux: number[]; actif?: boolean }) {
  const barres = Array.from({ length: NOMBRE_BARRES }, (_, i) => niveaux[niveaux.length - NOMBRE_BARRES + i] ?? 0)
  return (
    <div className="flex h-10 items-center gap-[3px]" aria-hidden="true" data-vumetre>
      {barres.map((n, i) => (
        <span key={i} className={cn('w-1 rounded-full transition-[height] duration-100', actif ? 'bg-danger' : 'bg-texte-3')} style={{ height: `${Math.max(8, Math.round(n * 100))}%` }} />
      ))}
    </div>
  )
}

function Raccourcis() {
  const { t } = useTranslation()
  const liste: Array<[string, string]> = [
    [t('studio.touches.espace'), t('studio.raccourcis.enregistrer')],
    ['↵', t('studio.raccourcis.valider')],
    ['R', t('studio.raccourcis.refaire')],
    ['→', t('studio.raccourcis.suivant')],
    ['P', t('studio.raccourcis.publier')],
  ]
  return (
    <ul className="hidden grid-cols-3 gap-x-3 gap-y-1 border-t border-bordure pt-2 text-2xs text-texte-3 md:grid" aria-label={t('studio.raccourcis.titre')}>
      {liste.map(([touche, action]) => (
        <li key={action} className="inline-flex items-center gap-1">
          <Touche>{touche}</Touche>
          {action}
        </li>
      ))}
    </ul>
  )
}
