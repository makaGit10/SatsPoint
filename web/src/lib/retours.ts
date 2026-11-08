/** Retours sensoriels (son) et partage : tous facultatifs, jamais bloquants. La vibration est dans `./vibrer` (chargée par la caisse). */

export { vibrer } from './vibrer'

let contexteAudio: AudioContext | null = null

/** Court carillon à deux notes (WebAudio, aucun fichier) pour « Paiement reçu ». */
export function jouerSonSucces() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    contexteAudio ??= new Ctx()
    const ctx = contexteAudio
    if (ctx.state === 'suspended') void ctx.resume()
    const debut = ctx.currentTime
    for (const [frequence, depart, duree] of [
      [880, 0, 0.16],
      [1318.5, 0.14, 0.28],
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequence
      gain.gain.setValueAtTime(0.0001, debut + depart)
      gain.gain.exponentialRampToValueAtTime(0.25, debut + depart + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, debut + depart + duree)
      osc.connect(gain).connect(ctx.destination)
      osc.start(debut + depart)
      osc.stop(debut + depart + duree + 0.02)
    }
  } catch {
    /* audio indisponible */
  }
}

export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte)
    return true
  } catch {
    try {
      const zone = document.createElement('textarea')
      zone.value = texte
      zone.setAttribute('readonly', '')
      zone.style.position = 'fixed'
      zone.style.opacity = '0'
      document.body.appendChild(zone)
      zone.select()
      const ok = document.execCommand('copy')
      zone.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function peutPartager(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Web Share ; `false` si indisponible ou annulé par la personne. */
export async function partager(donnees: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!peutPartager()) return false
  try {
    await navigator.share(donnees)
    return true
  } catch {
    return false
  }
}

export async function lirePressePapier(): Promise<string | null> {
  try {
    return (await navigator.clipboard.readText()).trim()
  } catch {
    return null
  }
}

export function lienWhatsApp(texte: string) {
  return `https://wa.me/?text=${encodeURIComponent(texte)}`
}

export function lienSms(texte: string) {
  // `?body=` fonctionne sur Android et iOS récents ; `&body=` est l'ancienne forme iOS.
  return `sms:?body=${encodeURIComponent(texte)}`
}
