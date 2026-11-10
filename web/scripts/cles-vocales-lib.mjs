// Registre des clés vocales (CONTRAT_API § V3.1) : logique pure, partagée par le script `cles-vocales.mjs`
// et par le test Vitest `src/voix/cles-vocales.test.ts`. Aucune dépendance.
//
// Sources reconnues dans le code (commentaires ignorés) :
// - prop `voix="…"` / `voix={'…'}` / `voix={cond ? '…' : '…'}` sur n'importe quel composant ;
// - propriété d'objet `voix: '…'` (notifications, options de `Segment`, entrées de menu) ;
// - `<HautParleur cle="…">` ;
// - `annoncer('…')` ;
// - entrées de navigation (`cle: '…'`, `cleCourte: '…'` dans `coquille/navigation.ts`) ;
// - tuiles de langue (`cle={`langue.${…}`}`), développées avec la liste des langues.

/** Écrans dans l'ordre d'apparition (parcours d'encaissement d'abord). `essentielle` = parcours d'encaissement + langue. */
export const ECRANS = [
  { motif: 'ecrans/Langue.tsx', ecran: 'langue', libelle: 'Choix de la langue', essentielle: true },
  { motif: 'ecrans/landing/', ecran: 'landing', libelle: 'Page de présentation', essentielle: true },
  { motif: 'ecrans/Accueil.tsx', ecran: 'accueil', libelle: 'Accueil', essentielle: true },
  { motif: 'ecrans/auth/Connexion.tsx', ecran: 'connexion', libelle: 'Connexion', essentielle: true },
  { motif: 'ecrans/Caisse.tsx', ecran: 'caisse', libelle: 'Caisse', essentielle: true },
  { motif: 'ecrans/caisse/', ecran: 'caisse', libelle: 'Caisse', essentielle: true },
  { motif: 'ecrans/paiement/Paiement.tsx', ecran: 'paiement', libelle: 'Paiement', essentielle: true },
  { motif: 'ecrans/paiement/Succes.tsx', ecran: 'succes', libelle: 'Paiement reçu', essentielle: true },
  { motif: 'ecrans/paiement/', ecran: 'paiement', libelle: 'Paiement', essentielle: true },
  { motif: 'coquille/navigation.ts', ecran: 'navigation', libelle: 'Menu', essentielle: false },
  { motif: 'coquille/', ecran: 'navigation', libelle: 'En-tête et menus', essentielle: false },
  { motif: 'ecrans/auth/', ecran: 'compte', libelle: 'Compte', essentielle: false },
  { motif: 'ecrans/Ventes.tsx', ecran: 'ventes', libelle: 'Ventes', essentielle: false },
  { motif: 'ecrans/ventes/', ecran: 'ventes', libelle: 'Ventes', essentielle: false },
  { motif: 'ecrans/TableauDeBord.tsx', ecran: 'tableau', libelle: 'Tableau de bord', essentielle: false },
  { motif: 'ecrans/tableau/', ecran: 'tableau', libelle: 'Tableau de bord', essentielle: false },
  { motif: 'ecrans/Portefeuille.tsx', ecran: 'portefeuille', libelle: 'Portefeuille', essentielle: false },
  { motif: 'ecrans/portefeuille/', ecran: 'portefeuille', libelle: 'Portefeuille', essentielle: false },
  { motif: 'ecrans/Articles.tsx', ecran: 'articles', libelle: 'Articles', essentielle: false },
  { motif: 'ecrans/articles/', ecran: 'articles', libelle: 'Articles', essentielle: false },
  { motif: 'ecrans/Equipe.tsx', ecran: 'equipe', libelle: 'Équipe', essentielle: false },
  { motif: 'ecrans/Invitation.tsx', ecran: 'invitation', libelle: 'Invitation', essentielle: false },
  { motif: 'ecrans/Reglages.tsx', ecran: 'reglages', libelle: 'Réglages', essentielle: false },
  { motif: 'ecrans/reglages/', ecran: 'reglages', libelle: 'Réglages', essentielle: false },
  { motif: 'ecrans/Demarrage.tsx', ecran: 'demarrage', libelle: 'Démarrage guidé', essentielle: false },
  { motif: 'ecrans/Recu.tsx', ecran: 'recu', libelle: 'Reçu', essentielle: false },
  { motif: 'ecrans/securite/', ecran: 'securite', libelle: 'Sécurité du compte', essentielle: false },
  { motif: 'ecrans/admin/', ecran: 'admin', libelle: 'Console plateforme', essentielle: false },
  { motif: '', ecran: 'divers', libelle: 'Divers', essentielle: false },
]

/** Langues des tuiles (`langue.${code}`), dans l'ordre de l'écran de choix. */
export const CODES_LANGUE = ['wo', 'srr', 'ff', 'dyo', 'fr', 'en']

/** Composants dont chaque utilisation doit porter une clé vocale. */
export const COMPOSANTS_ACTION = ['Bouton', 'BoutonLien', 'BoutonIcone', 'Onglet']

const TYPES = {
  Bouton: 'Bouton',
  BoutonLien: 'Bouton',
  BoutonIcone: 'Bouton icône',
  Onglet: 'Onglet',
  EnTetePage: "Titre de l'écran",
  TitreAuth: "Titre de l'écran",
  Interrupteur: 'Interrupteur',
  HautParleur: 'Texte lu',
}

const MOTIF_CLE = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/

/** Remplace les commentaires par des espaces (indices conservés) en respectant chaînes et gabarits. */
export function sansCommentaires(source) {
  const sortie = source.split('')
  const pile = []
  let etat = 'code'
  let profondeur = 0
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const s = source[i + 1]
    if (etat === 'code') {
      if (c === '/' && s === '/') {
        while (i < source.length && source[i] !== '\n') sortie[i++] = ' '
        continue
      }
      if (c === '/' && s === '*') {
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
          if (source[i] !== '\n') sortie[i] = ' '
          i++
        }
        if (i < source.length) {
          sortie[i] = ' '
          sortie[i + 1] = ' '
          i += 2
        }
        continue
      }
      if (c === '"' || c === "'") {
        const fin = c
        i++
        while (i < source.length && source[i] !== fin && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1
        i++
        continue
      }
      if (c === '`') {
        pile.push({ etat, profondeur })
        etat = 'gabarit'
        i++
        continue
      }
      if (c === '{') profondeur++
      if (c === '}') {
        if (profondeur === 0 && pile.length) {
          const prec = pile.pop()
          etat = prec.etat
          profondeur = prec.profondeur
          i++
          continue
        }
        profondeur--
      }
      i++
      continue
    }
    // Gabarit `…${…}…`
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`') {
      const prec = pile.pop()
      etat = prec ? prec.etat : 'code'
      profondeur = prec ? prec.profondeur : 0
      i++
      continue
    }
    if (c === '$' && s === '{') {
      pile.push({ etat: 'gabarit', profondeur: 0 })
      etat = 'code'
      profondeur = 0
      i += 2
      continue
    }
    i++
  }
  return sortie.join('')
}

/** Balises JSX ouvrantes de composants : { nom, debut, fin, attributs } (accolades, chaînes et JSX imbriqué respectés). */
export function balisesJsx(code) {
  const balises = []
  const re = /<([A-Z][A-Za-z0-9.]*)(?=[\s/>])/g
  let m
  while ((m = re.exec(code))) {
    const debut = m.index
    let i = re.lastIndex
    let profondeur = 0
    let guillemet = null
    while (i < code.length) {
      const c = code[i]
      if (guillemet) {
        if (c === '\\') i++
        else if (c === guillemet) guillemet = null
      } else if (profondeur > 0 && (c === '"' || c === "'" || c === '`')) guillemet = c
      else if (profondeur === 0 && (c === '"' || c === "'")) guillemet = c
      else if (c === '{') profondeur++
      else if (c === '}') profondeur--
      else if (c === '>' && profondeur === 0) break
      i++
    }
    balises.push({ nom: m[1], debut, fin: i, attributs: code.slice(re.lastIndex, i) })
  }
  return balises
}

function litterauxCles(expression) {
  return [...expression.matchAll(/["']([^"'\s]+)["']/g)].map((x) => x[1]).filter((c) => MOTIF_CLE.test(c))
}

/** Expression qui suit une position (jusqu'à `,` `}` `)` ou fin de ligne au niveau 0). */
function expressionApres(code, i) {
  let profondeur = 0
  let guillemet = null
  const debut = i
  while (i < code.length) {
    const c = code[i]
    if (guillemet) {
      if (c === '\\') i++
      else if (c === guillemet) guillemet = null
    } else if (c === '"' || c === "'" || c === '`') guillemet = c
    else if (c === '(' || c === '{' || c === '[') profondeur++
    else if (c === ')' || c === '}' || c === ']') {
      if (profondeur === 0) break
      profondeur--
    } else if ((c === ',' || c === '\n') && profondeur === 0) break
    i++
  }
  return code.slice(debut, i)
}

/** Valeur d'un attribut JSX à partir de la position qui suit `nom=` : chaîne ou expression entre accolades. */
function valeurAttribut(code, i) {
  if (code[i] === '"' || code[i] === "'") {
    const fin = code.indexOf(code[i], i + 1)
    return code.slice(i, fin + 1)
  }
  if (code[i] === '{') {
    let profondeur = 0
    let j = i
    while (j < code.length) {
      if (code[j] === '{') profondeur++
      else if (code[j] === '}') {
        profondeur--
        if (profondeur === 0) break
      }
      j++
    }
    return code.slice(i, j + 1)
  }
  return ''
}

function ligneDe(code, index) {
  let n = 1
  for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) n++
  return n
}

function balisePour(balises, index) {
  let meilleure = null
  for (const b of balises) if (b.debut < index && index < b.fin && (!meilleure || b.debut > meilleure.debut)) meilleure = b
  return meilleure
}

/** Occurrences de clés vocales dans un fichier : [{ cle, index, type, ligne }] dans l'ordre du texte. */
export function occurrencesFichier(chemin, source) {
  const code = sansCommentaires(source)
  const balises = balisesJsx(code)
  const occurrences = []
  const ajouter = (cle, index, type) => occurrences.push({ cle, index, type, ligne: ligneDe(code, index) })

  // Props `voix=` (tout composant) et `cle=` (HautParleur).
  for (const m of code.matchAll(/\b(voix|cle)=/g)) {
    const balise = balisePour(balises, m.index)
    if (!balise) continue
    if (m[1] === 'cle' && balise.nom !== 'HautParleur') continue
    const valeur = valeurAttribut(code, m.index + m[0].length)
    const type = TYPES[balise.nom] ?? "Élément d'action"
    for (const cle of litterauxCles(valeur)) ajouter(cle, m.index, type)
    if (/`langue\.\$\{/.test(valeur)) for (const c of CODES_LANGUE) ajouter(`langue.${c}`, m.index, 'Langue')
    // Autre gabarit `prefixe.${…}` : développé avec les clés de traduction du préfixe (voir construireRegistre).
    else for (const g of valeur.matchAll(/`([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\.\$\{[^}]+\}`/g)) ajouter(`${g[1]}.*`, m.index, type)
  }

  // Propriétés d'objet `voix: …` (notifications, options, entrées de menu).
  for (const m of code.matchAll(/\bvoix:\s*/g)) {
    const expression = expressionApres(code, m.index + m[0].length)
    const avant = code.slice(Math.max(0, m.index - 240), m.index)
    const dernierNotifier = avant.lastIndexOf('notifier(')
    const type = dernierNotifier >= 0 && !/\}\s*\)/.test(avant.slice(dernierNotifier)) ? 'Message' : 'Choix'
    for (const cle of litterauxCles(expression)) ajouter(cle, m.index, type)
  }

  // Annonces automatiques.
  for (const m of code.matchAll(/\bannoncer\(\s*["']([^"']+)["']/g)) if (MOTIF_CLE.test(m[1])) ajouter(m[1], m.index, 'Annonce automatique')

  // Entrées de navigation.
  if (chemin.replace(/\\/g, '/').endsWith('coquille/navigation.ts')) {
    for (const m of code.matchAll(/\b(?:cle|cleCourte):\s*["']([^"']+)["']/g)) if (MOTIF_CLE.test(m[1])) ajouter(m[1], m.index, 'Menu')
  }

  return occurrences.sort((a, b) => a.index - b.index)
}

export function ecranPour(chemin) {
  const c = chemin.replace(/\\/g, '/')
  const indice = ECRANS.findIndex((e) => c.includes(e.motif))
  return { ...ECRANS[indice], rang: indice }
}

/** Arbre i18n → Map aplatie. */
export function aplatir(objet, prefixe = '', resultat = new Map()) {
  for (const [cle, valeur] of Object.entries(objet)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle
    if (typeof valeur === 'string') resultat.set(chemin, valeur)
    else if (valeur && typeof valeur === 'object') aplatir(valeur, chemin, resultat)
  }
  return resultat
}

function texte(traductions, cle) {
  return traductions.get(cle) ?? traductions.get(`${cle}_other`) ?? traductions.get(`${cle}_one`) ?? null
}

/**
 * Construit le registre à partir des fichiers source et des traductions.
 * `fichiers` : [{ chemin (relatif à src), contenu }] ; `fr`, `en` : arbres JSON (paquets compris) ou Map aplaties.
 * Retourne { registre, manquantes } — `manquantes` = clés vocales sans texte FR ou EN.
 */
export function construireRegistre(fichiers, fr, en) {
  const FR = fr instanceof Map ? fr : aplatir(fr)
  const EN = en instanceof Map ? en : aplatir(en)
  const tries = fichiers
    .map((f) => ({ ...f, chemin: f.chemin.replace(/\\/g, '/'), infos: ecranPour(f.chemin) }))
    .sort((a, b) => a.infos.rang - b.infos.rang || (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0))

  const vues = new Map()
  const manquantes = []
  for (const f of tries) {
    const occurrences = occurrencesFichier(f.chemin, f.contenu).flatMap((o) => {
      if (!o.cle.endsWith('.*')) return [o]
      const prefixe = o.cle.slice(0, -1)
      return [...FR.keys()].filter((c) => c.startsWith(prefixe) && !c.slice(prefixe.length).includes('.')).map((cle) => ({ ...o, cle }))
    })
    for (const o of occurrences) {
      if (vues.has(o.cle)) continue
      const texte_fr = texte(FR, o.cle)
      const texte_en = texte(EN, o.cle)
      if (!texte_fr || !texte_en) manquantes.push({ cle: o.cle, fichier: f.chemin, ligne: o.ligne, fr: Boolean(texte_fr), en: Boolean(texte_en) })
      vues.set(o.cle, {
        cle: o.cle,
        ecran: f.infos.ecran,
        contexte: `${o.type} — ${f.infos.libelle}`,
        texte_fr: texte_fr ?? '',
        texte_en: texte_en ?? '',
        essentielle: f.infos.essentielle,
      })
    }
  }
  return { registre: [...vues.values()], manquantes }
}

/** Utilisations de Bouton / BoutonLien / BoutonIcone / Onglet sans prop `voix` (les relais `{...reste}` sont tolérés). */
export function boutonsSansVoix(fichiers) {
  const resultats = []
  for (const f of fichiers) {
    const code = sansCommentaires(f.contenu)
    for (const b of balisesJsx(code)) {
      if (!COMPOSANTS_ACTION.includes(b.nom)) continue
      if (/\bvoix=/.test(b.attributs) || /\{\s*\.\.\./.test(b.attributs)) continue
      resultats.push({ fichier: f.chemin.replace(/\\/g, '/'), ligne: ligneDe(code, b.debut), composant: b.nom })
    }
  }
  return resultats
}

/** Sérialisation stable (une entrée par ligne : diff lisible). */
export function serialiser(registre) {
  return `[\n${registre.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]\n`
}
