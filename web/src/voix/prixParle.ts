/**
 * Prix dit à voix haute → nombre de francs CFA. La reconnaissance vocale du téléphone (français) rend des chiffres
 * (« 1500 francs », « 1 500 F ») ou des mots (« deux mille cinq cents »). Mots inutiles ignorés : francs, F, CFA…
 * Retourne `null` si rien d'exploitable n'a été compris (on ne devine jamais un prix).
 */

const UNITES: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90,
}

/** Minuscules, sans accents, tirets → espaces. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, ' ')
}

/** Nombre écrit en lettres (français), ou `null`. */
function depuisMots(mots: string[]): number | null {
  let total = 0
  let courant = 0
  let vu = false
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i]!.replace(/s$/, (s) => (mots[i] === 'trois' || mots[i] === 'six' ? s : ''))
    if (m === 'et') continue
    if (m in UNITES) {
      // « quatre vingt » = 80 ; « soixante dix » = 70.
      const v = UNITES[m]!
      if (v === 20 && courant % 100 === 4) courant = courant - 4 + 80
      else courant += v
      vu = true
    } else if (m === 'cent') {
      courant = (courant === 0 ? 1 : courant) * 100
      vu = true
    } else if (m === 'mille' || m === 'mil') {
      total += (courant === 0 ? 1 : courant) * 1000
      courant = 0
      vu = true
    } else if (m === 'million' || m === 'millions') {
      total += (courant === 0 ? 1 : courant) * 1_000_000
      courant = 0
      vu = true
    } else if (vu) {
      break
    }
  }
  return vu ? total + courant : null
}

export function prixDepuisTexte(texte: string): number | null {
  const t = normaliser(texte)
  // Chiffres : « 1500 », « 1 500 », « 1.500 », « 2 500 francs » (groupes de milliers séparés par espace ou point).
  const chiffres = t.match(/\d{1,3}(?:[ .  ]\d{3})+|\d+/)
  if (chiffres) {
    let n = Number(chiffres[0].replace(/[ .  ]/g, ''))
    // « 2 mille », « 3 millions » dits en chiffres + mot.
    const apres = t.slice((chiffres.index ?? 0) + chiffres[0].length).trim()
    if (/^(mille|mil)\b/.test(apres)) n *= 1000
    else if (/^millions?\b/.test(apres)) n *= 1_000_000
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const n = depuisMots(t.split(/[^a-z]+/).filter(Boolean))
  return n !== null && n > 0 ? n : null
}
