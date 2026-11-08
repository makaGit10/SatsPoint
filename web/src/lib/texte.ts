/** Texte comparable : minuscules, sans accents, espaces simples. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distance d'édition (Levenshtein), arrêtée au-delà de `max`. */
export function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const courante = [i]
    let minimum = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(precedente[j]! + 1, courante[j - 1]! + 1, precedente[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      courante.push(v)
      if (v < minimum) minimum = v
    }
    if (minimum > max) return max + 1
    precedente = courante
  }
  return precedente[b.length]!
}

/**
 * Pertinence d'un texte pour un terme (0 = aucune) : tolère accents et petites fautes.
 * Début du texte > début d'un mot > contenu > mot à une faute près (deux fautes pour les mots longs).
 */
export function pertinence(texte: string, terme: string): number {
  const t = normaliser(texte)
  const q = normaliser(terme)
  if (!q) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 90
  const mots = t.split(/[\s\-·›/.,()]+/).filter(Boolean)
  if (mots.some((m) => m.startsWith(q))) return 75
  if (t.includes(q)) return 60
  const motsTerme = q.split(' ').filter(Boolean)
  let score = 0
  for (const mq of motsTerme) {
    if (mq.length < 3) continue
    const tolerance = mq.length >= 7 ? 2 : 1
    const meilleur = Math.min(...mots.map((m) => Math.min(distance(m, mq, tolerance), distance(m.slice(0, mq.length), mq, tolerance))))
    if (meilleur <= tolerance) score += 40 - meilleur * 10
    else return 0
  }
  return score > 0 ? Math.min(55, Math.round(score / Math.max(1, motsTerme.length))) : 0
}

/**
 * Découpe un texte pour surligner le terme (insensible aux accents et à la casse).
 * Retourne des segments `{ texte, surligne }` qui recomposent exactement le texte d'origine.
 */
export function surligner(texte: string, terme: string): Array<{ texte: string; surligne: boolean }> {
  const q = normaliser(terme)
  if (!q) return [{ texte, surligne: false }]
  // Texte normalisé caractère par caractère, avec l'indice d'origine de chaque caractère.
  let plat = ''
  const origine: number[] = []
  for (let i = 0; i < texte.length; i++) {
    const n = texte[i]!.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (const c of n) {
      plat += c
      origine.push(i)
    }
  }
  const segments: Array<{ texte: string; surligne: boolean }> = []
  let curseur = 0
  let depart = 0
  while (q.length > 0) {
    const trouve = plat.indexOf(q, depart)
    if (trouve < 0) break
    const debut = origine[trouve]!
    const fin = (origine[trouve + q.length - 1] ?? texte.length - 1) + 1
    if (debut > curseur) segments.push({ texte: texte.slice(curseur, debut), surligne: false })
    segments.push({ texte: texte.slice(debut, fin), surligne: true })
    curseur = fin
    depart = trouve + q.length
  }
  if (curseur < texte.length) segments.push({ texte: texte.slice(curseur), surligne: false })
  return segments.length ? segments : [{ texte, surligne: false }]
}
