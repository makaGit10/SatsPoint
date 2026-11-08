import { useEffect, useState, useSyncExternalStore } from 'react'
import { DECOMPTE, DUREE_MAX_MS, ETAT_INITIAL, reduireEnregistreur, type ActionEnregistreur, type EtatEnregistreur } from './enregistreur'

const PAS_DECOMPTE_MS = 1000
const PAS_MESURE_MS = 100

/** Type MIME préféré (Chrome / Firefox : webm-opus ; Safari : mp4). */
function typeMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t))
}

export interface Enregistreur {
  etat: EtatEnregistreur
  /** Demande le micro (une fois), décompte 3-2-1, puis enregistre. */
  demarrer: () => void
  /** Pendant le décompte : annule ; pendant l'enregistrement : arrête et garde la prise. */
  arreter: () => void
  /** Jette la prise et recommence (décompte compris). */
  refaire: () => void
  /** Revient au repos (prise jetée), micro conservé pour la prise suivante. */
  reinitialiser: () => void
}

/**
 * Pilote du micro hors React : MediaRecorder + AnalyserNode (vumètre), décompte, arrêt automatique à 15 s.
 * L'état passe par `reduireEnregistreur` ; React s'y abonne (`useSyncExternalStore`).
 * Le flux du micro est gardé entre deux prises (mode rafale sans redemander l'autorisation).
 */
export class ControleurMicro {
  private etat: EtatEnregistreur = ETAT_INITIAL
  private readonly ecouteurs = new Set<() => void>()
  private flux: MediaStream | null = null
  private enregistreur: MediaRecorder | null = null
  private contexteAudio: AudioContext | null = null
  private analyseur: AnalyserNode | null = null
  private minuteries: Array<ReturnType<typeof setTimeout>> = []
  private urlPrise: string | null = null
  private generation = 0

  abonner = (ecouteur: () => void) => {
    this.ecouteurs.add(ecouteur)
    return () => {
      this.ecouteurs.delete(ecouteur)
    }
  }

  lire = () => this.etat

  private envoyer(action: ActionEnregistreur) {
    const suivant = reduireEnregistreur(this.etat, action)
    if (suivant === this.etat) return
    this.etat = suivant
    for (const e of [...this.ecouteurs]) e()
  }

  private nettoyerMinuteries() {
    for (const m of this.minuteries) {
      clearTimeout(m)
      clearInterval(m)
    }
    this.minuteries = []
  }

  private jeterPrise() {
    if (this.urlPrise) URL.revokeObjectURL(this.urlPrise)
    this.urlPrise = null
  }

  private niveauActuel(): number {
    const a = this.analyseur
    if (!a) return 0
    const donnees = new Uint8Array(a.fftSize)
    a.getByteTimeDomainData(donnees)
    let somme = 0
    for (const v of donnees) somme += ((v - 128) / 128) ** 2
    return Math.min(1, Math.sqrt(somme / donnees.length) * 3)
  }

  private brancherAnalyseur(stream: MediaStream) {
    const fenetre = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Contexte = fenetre.AudioContext ?? fenetre.webkitAudioContext
    if (!Contexte || this.analyseur) return
    try {
      const ctx = new Contexte()
      const source = ctx.createMediaStreamSource(stream)
      const a = ctx.createAnalyser()
      a.fftSize = 512
      source.connect(a)
      this.contexteAudio = ctx
      this.analyseur = a
    } catch {
      /* vumètre facultatif */
    }
  }

  private lancerEnregistrement(stream: MediaStream, maGeneration: number) {
    const morceaux: Blob[] = []
    const mime = typeMime()
    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch {
      this.envoyer({ type: 'echec', erreur: 'enregistrement' })
      return
    }
    this.enregistreur = recorder
    const debut = Date.now()
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) morceaux.push(e.data)
    }
    recorder.onstop = () => {
      this.nettoyerMinuteries()
      this.enregistreur = null
      if (maGeneration !== this.generation) return
      const blob = new Blob(morceaux, { type: recorder.mimeType || mime || 'audio/webm' })
      this.jeterPrise()
      const url = URL.createObjectURL(blob)
      this.urlPrise = url
      this.envoyer({ type: 'termine', blob, url, dureeMs: Date.now() - debut })
    }
    recorder.start(250)
    const mesure = setInterval(() => this.envoyer({ type: 'ticEnregistrement', dureeMs: Date.now() - debut, niveau: this.niveauActuel() }), PAS_MESURE_MS)
    const limite = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, DUREE_MAX_MS)
    this.minuteries.push(mesure, limite)
  }

  private decompter(stream: MediaStream, maGeneration: number) {
    this.envoyer({ type: 'microPret' })
    let restant = DECOMPTE
    const pas = setInterval(() => {
      if (maGeneration !== this.generation) return
      restant -= 1
      this.envoyer({ type: 'ticDecompte' })
      if (restant <= 0) {
        clearInterval(pas)
        this.lancerEnregistrement(stream, maGeneration)
      }
    }, PAS_DECOMPTE_MS)
    this.minuteries.push(pas)
  }

  demarrer = () => {
    const phase = this.etat.phase
    if (phase === 'demande' || phase === 'decompte' || phase === 'enregistrement') return
    this.nettoyerMinuteries()
    this.jeterPrise()
    const maGeneration = ++this.generation
    this.envoyer({ type: 'demander' })
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.envoyer({ type: 'microIndisponible' })
      return
    }
    const existant = this.flux
    if (existant && existant.getAudioTracks().some((p) => p.readyState === 'live')) {
      this.decompter(existant, maGeneration)
      return
    }
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      .then((stream) => {
        if (maGeneration !== this.generation) {
          for (const p of stream.getTracks()) p.stop()
          return
        }
        this.flux = stream
        this.brancherAnalyseur(stream)
        this.decompter(stream, maGeneration)
      })
      .catch((e: unknown) => {
        if (maGeneration !== this.generation) return
        const nom = e instanceof DOMException || (e && typeof e === 'object' && 'name' in e) ? String((e as { name: unknown }).name) : ''
        this.envoyer({ type: nom === 'NotFoundError' || nom === 'NotReadableError' ? 'microIndisponible' : 'microRefuse' })
      })
  }

  arreter = () => {
    const phase = this.etat.phase
    if (phase === 'enregistrement' && this.enregistreur && this.enregistreur.state !== 'inactive') {
      this.enregistreur.stop()
      return
    }
    if (phase === 'decompte' || phase === 'demande') {
      this.generation++
      this.nettoyerMinuteries()
      this.envoyer({ type: 'annuler' })
    }
  }

  reinitialiser = () => {
    this.generation++
    this.nettoyerMinuteries()
    if (this.enregistreur && this.enregistreur.state !== 'inactive') this.enregistreur.stop()
    this.jeterPrise()
    this.envoyer({ type: 'annuler' })
  }

  refaire = () => {
    this.reinitialiser()
    this.demarrer()
  }

  /** Libère tout (démontage) ; le pilote reste réutilisable (le micro sera redemandé). */
  liberer = () => {
    this.reinitialiser()
    for (const p of this.flux?.getTracks() ?? []) p.stop()
    this.flux = null
    void this.contexteAudio?.close().catch(() => undefined)
    this.contexteAudio = null
    this.analyseur = null
  }
}

/** Enregistrement au micro pour un écran (un pilote par écran, libéré au démontage). */
export function useEnregistreur(): Enregistreur {
  const [pilote] = useState(() => new ControleurMicro())
  const etat = useSyncExternalStore(pilote.abonner, pilote.lire, pilote.lire)
  useEffect(() => () => pilote.liberer(), [pilote])
  return { etat, demarrer: pilote.demarrer, arreter: pilote.arreter, refaire: pilote.refaire, reinitialiser: pilote.reinitialiser }
}
