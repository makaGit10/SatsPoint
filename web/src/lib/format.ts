/**
 * Formats d'affichage : montants FCFA / sats et dates au fuseau `Africa/Dakar`.
 * Tous les montants sont des entiers (jamais de flottant pour l'argent).
 */

export const FUSEAU = 'Africa/Dakar'
export type Locale = 'fr' | 'en'

const ESPACE_FINE = ' ' // séparateur de milliers insécable fin
const ESPACE_INSECABLE = ' '

/** `15000` → `15 000` (groupes de trois séparés par une espace fine insécable, quelle que soit la langue). */
export function formaterNombre(valeur: number): string {
  if (!Number.isFinite(valeur)) return '—'
  const entier = Math.trunc(valeur)
  const signe = entier < 0 ? '-' : ''
  const chiffres = String(Math.abs(entier))
  const groupes = chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE)
  return signe + groupes
}

/** `15000` → `15 000 FCFA`. */
export function formaterFCFA(montant: number): string {
  return `${formaterNombre(montant)}${ESPACE_INSECABLE}FCFA`
}

/** `23450` → `23 450 sats` ; avec `{ approx: true }` → `≈ 23 450 sats`. */
export function formaterSats(sats: number, options: { approx?: boolean } = {}): string {
  const base = `${formaterNombre(sats)}${ESPACE_INSECABLE}sats`
  return options.approx ? `≈${ESPACE_INSECABLE}${base}` : base
}

/** Conversion FCFA → sats, arrondie au sat supérieur (le commerçant reçoit au moins le prix affiché). */
export function convertirEnSats(montantXof: number, coursXofParBtc: number): number {
  if (!(coursXofParBtc > 0)) return 0
  return Math.ceil((montantXof * 100_000_000) / coursXofParBtc)
}

type Parties = { jour: string; mois: string; annee: string; heure: string; minute: string }

function partiesDakar(date: Date): Parties {
  const parties = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const lire = (type: Intl.DateTimeFormatPartTypes) => parties.find((p) => p.type === type)?.value ?? '00'
  // Certains moteurs renvoient « 24 » pour minuit en hourCycle h24 ; on normalise.
  const heure = lire('hour') === '24' ? '00' : lire('hour')
  return { jour: lire('day'), mois: lire('month'), annee: lire('year'), heure, minute: lire('minute') }
}

function enDate(valeur: string | number | Date): Date | null {
  const d = valeur instanceof Date ? valeur : new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d
}

/** FR : `08/11/2026 14:32` · EN : `11/08/2026 14:32` (heure de Dakar). */
export function formaterDateHeure(valeur: string | number | Date, locale: Locale = 'fr'): string {
  const d = enDate(valeur)
  if (!d) return '—'
  const p = partiesDakar(d)
  const date = locale === 'en' ? `${p.mois}/${p.jour}/${p.annee}` : `${p.jour}/${p.mois}/${p.annee}`
  return `${date} ${p.heure}:${p.minute}`
}

/** `14:32` (heure de Dakar). */
export function formaterHeure(valeur: string | number | Date): string {
  const d = enDate(valeur)
  if (!d) return '—'
  const p = partiesDakar(d)
  return `${p.heure}:${p.minute}`
}

/** FR : `08/11/2026` · EN : `11/08/2026`. */
export function formaterDate(valeur: string | number | Date, locale: Locale = 'fr'): string {
  const d = enDate(valeur)
  if (!d) return '—'
  const p = partiesDakar(d)
  return locale === 'en' ? `${p.mois}/${p.jour}/${p.annee}` : `${p.jour}/${p.mois}/${p.annee}`
}

/** Date longue lisible : FR `8 novembre 2026` · EN `November 8, 2026`. */
export function formaterDateLongue(valeur: string | number | Date, locale: Locale = 'fr'): string {
  const d = enDate(valeur)
  if (!d) return '—'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', {
    timeZone: FUSEAU,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** Deux instants tombent-ils le même jour à Dakar ? */
export function memeJourDakar(a: string | number | Date, b: string | number | Date): boolean {
  const da = enDate(a)
  const db = enDate(b)
  if (!da || !db) return false
  const pa = partiesDakar(da)
  const pb = partiesDakar(db)
  return pa.jour === pb.jour && pa.mois === pb.mois && pa.annee === pb.annee
}

/** Durée restante `4:59` à partir de secondes. */
export function formaterCompteARebours(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Initiales pour un avatar : « Awa Ndiaye » → « AN ». */
export function initiales(nom: string): string {
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((m) => m.charAt(0).toUpperCase())
    .join('')
}
