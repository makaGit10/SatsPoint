/** Accès sûr au localStorage (navigation privée, quota, SSR…). Jamais de jeton de session ici. */

const PREFIXE = 'satspoint.'

export const CLES_STOCKAGE = {
  theme: `${PREFIXE}theme`,
  locale: `${PREFIXE}locale`,
  langueAudio: `${PREFIXE}langue-audio`,
  aideVocale: `${PREFIXE}aide-vocale`,
  langueChoisie: `${PREFIXE}langue-choisie`,
  pays: `${PREFIXE}pays`,
  lateraleRepliee: `${PREFIXE}laterale-repliee`,
} as const

export function lireStockage(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle)
  } catch {
    return null
  }
}

export function ecrireStockage(cle: string, valeur: string | null) {
  try {
    if (valeur === null) window.localStorage.removeItem(cle)
    else window.localStorage.setItem(cle, valeur)
  } catch {
    /* stockage indisponible : on continue sans persistance */
  }
}

/** Le premier lancement (choix de la langue) a-t-il été fait sur cet appareil ? */
export function langueChoisie(): boolean {
  return lireStockage(CLES_STOCKAGE.langueChoisie) !== null
}
