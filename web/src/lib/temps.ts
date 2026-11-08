/** Temps relatif → clé i18n + paramètre (`t(cle, { count })`). Toujours sans texte en dur. */
export function tempsRelatif(valeur: string | number | Date, maintenant: number = Date.now()): { cle: string; count: number } {
  const d = valeur instanceof Date ? valeur.getTime() : new Date(valeur).getTime()
  if (Number.isNaN(d)) return { cle: 'temps.aLInstant', count: 0 }
  const ecart = Math.round((maintenant - d) / 60_000)
  const futur = ecart < 0
  const minutes = Math.abs(ecart)
  if (minutes < 1) return { cle: 'temps.aLInstant', count: 0 }
  if (minutes < 60) return { cle: futur ? 'temps.dansMinutes' : 'temps.minutes', count: minutes }
  const heures = Math.round(minutes / 60)
  if (heures < 24) return { cle: futur ? 'temps.dansHeures' : 'temps.heures', count: heures }
  return { cle: futur ? 'temps.dansJours' : 'temps.jours', count: Math.round(heures / 24) }
}

/** Secondes restantes avant une échéance ISO (0 si dépassée, `null` si aucune). */
export function secondesRestantes(expireLe: string | null | undefined, maintenant: number = Date.now()): number | null {
  if (!expireLe) return null
  const fin = new Date(expireLe).getTime()
  if (Number.isNaN(fin)) return null
  return Math.max(0, Math.ceil((fin - maintenant) / 1000))
}

/** `+12 %` / `-8 %` / `0 %`. */
export function formaterPourcentage(pct: number): string {
  const arrondi = Math.round(pct)
  return `${arrondi > 0 ? '+' : ''}${arrondi} %`
}
