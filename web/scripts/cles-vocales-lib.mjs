// Registre des clés vocales (CONTRAT_API § V3.1) : logique pure, partagée par le script `cles-vocales.mjs`
// et par le test Vitest `src/voix/cles-vocales.test.ts`. Aucune dépendance.
//
// Sources reconnues dans le code (commentaires ignorés) :
// - prop `voix="…"` / `voix={'…'}` / `voix={cond ? '…' : '…'}` sur n'importe quel composant ;
// - propriété d'objet `voix: '…'` (notifications, options de `Segment`, entrées de menu) ;
// - `<HautParleur cle="…">` ;
// - `annoncer('…')` ;
// - entrées de navigation (`cle: '…'`, `cleCourte: '…'` dans `coquille/navigation.ts`) ;
// - tuiles de langue (`cle={`langue.${…}`}`), développées avec la liste des langues ;
// - guides vocaux des écrans : toute chaîne littérale `'guide.…'` (espace réservé, `useGuideVocal('guide.caisse')`),
//   toujours essentiels et rattachés à l'écran du fichier.

/** Écrans dans l'ordre d'apparition (parcours d'encaissement d'abord). `essentielle` = parcours d'encaissement + langue. */
export const ECRANS = [
  { motif: 'ecrans/Langue.tsx', ecran: 'langue', libelle: 'Choix de la langue', essentielle: true },
  { motif: 'ecrans/langue/', ecran: 'langue', libelle: 'Choix de la langue', essentielle: true },
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
export const COMPOSANTS_ACTION = ['Bouton', 'BoutonLien', 'BoutonIcone', 'Onglet', 'Champ', 'Selection', 'Interrupteur', 'ChampMotDePasse', 'ChampIdentifiant', 'ChampCode', 'Dialogue']

/**
 * Fichiers d'un AUTRE CHANTIER (agent « articles pour les personnes qui ne savent pas écrire ») : il pose lui-même
 * ses haut-parleurs ; exclus du garde-fou tant que son travail n'est pas fusionné (leurs clés restent au registre).
 */
export const FICHIERS_AUTRE_CHANTIER = []

function autreChantier(chemin) {
  const c = chemin.replace(/\\/g, '/')
  return FICHIERS_AUTRE_CHANTIER.some((m) => (m.endsWith('/') ? c.startsWith(m) || c.includes(`/${m}`) : c === m || c.endsWith(`/${m}`)))
}

/** Éléments bruts actionnables contrôlés par `elementsBrutsSansVoix`. */
export const ELEMENTS_BRUTS = ['button', 'a', 'summary', 'Link', 'NavLink']

/**
 * Exceptions au garde-fou des éléments bruts : fichier (ou dossier terminé par `/`) + motif cherché dans l'élément
 * (balise ouvrante et contenu) + raison. La plus courte possible : toute nouvelle exception doit être justifiée ici.
 */
export const EXCEPTIONS_ELEMENTS_BRUTS = [
  { fichier: 'composants/', motif: /./, raison: 'Primitives (Bouton, BoutonIcone, Segment, Menu, Pagination…) : elles reçoivent la clé `voix` en prop et posent elles-mêmes le haut-parleur ; leurs utilisations sont contrôlées.' },
  { fichier: 'ecrans/caisse/Pave.tsx', motif: /./, raison: 'Touches chiffrées du pavé : le chiffre se reconnaît sans lire ; un haut-parleur sur chaque touche gênerait la saisie rapide.' },
  { fichier: 'coquille/', motif: /<Marque\b/, raison: "Logo SatsPoint (et nom de la boutique) qui ramène à l'accueil : reconnaissable sans lire, comme dans toutes les applications." },
  { fichier: 'ecrans/landing/Landing.tsx', motif: /className="marque"/, raison: 'Logo SatsPoint qui ramène en haut de la même page (aucune action).' },
  { fichier: 'ecrans/landing/Landing.tsx', motif: /^<a href="#(comment|fonctions|securite|faq)">/, raison: "Menu d'ancres de la page de présentation (bureau) : il ne fait que défiler dans la page, que le guide vocal de l'écran explique." },
  { fichier: 'ecrans/articles/EcouterArticle.tsx', motif: /./, raison: "Bouton « écouter l'article » : c'est lui-même le haut-parleur (il dit le nom de l'article, enregistré par le marchand)." },
  { fichier: 'ecrans/articles/FormulaireArticle.tsx', motif: /role="radio"/, raison: "Pastilles de couleur de l'article : la couleur se voit sans lire ; le groupe a son haut-parleur (« Couleur »)." },
  { fichier: 'voix/BoutonGuide.tsx', motif: /./, raison: "Bouton « Réécouter l'aide » : c'est lui-même l'aide vocale (il parle quand on le touche)." },
  { fichier: 'ecrans/admin/console/MoyensAdmin.tsx', motif: /role="radio"[\s\S]*classesCouleur/, raison: 'Pastilles de couleur du moyen de paiement (console super-admin) : la couleur se voit, son nom est en infobulle.' },
  { fichier: 'ecrans/auth/ChampIdentifiant.tsx', motif: /tabIndex=\{-1\}/, raison: "Croix « oublier » d'une suggestion, non focalisable, à l'intérieur d'une ligne de suggestion (donnée saisie par la personne)." },
  { fichier: 'ecrans/ventes/LigneVente.tsx', motif: /./, raison: "Ligne de la liste des ventes : c'est une donnée (numéro, montant, statut en couleur et icône) ; le guide vocal de l'écran explique qu'on la touche pour le détail." },
  { fichier: 'ecrans/admin/studio/Matrice.tsx', motif: /./, raison: 'Cases de la matrice du studio (une par clé et par langue) : données de travail de la super-admin, pas des actions de l\'application.' },
]

/** Fin de la balise ouvrante (indice du `>`), accolades et chaînes respectées ; `auto` = balise auto-fermante. */
function finBaliseOuvrante(code, i) {
  let profondeur = 0
  let guillemet = null
  while (i < code.length) {
    const c = code[i]
    if (guillemet) {
      if (c === '\\') i++
      else if (c === guillemet) guillemet = null
    } else if (c === '"' || c === "'" || (profondeur > 0 && c === '`')) guillemet = c
    else if (c === '{') profondeur++
    else if (c === '}') profondeur--
    else if (c === '>' && profondeur === 0) return { fin: i, auto: code[i - 1] === '/' }
    i++
  }
  return { fin: code.length, auto: true }
}

/** Indice juste après la balise fermante correspondante `</nom>` (balises de même nom imbriquées comptées). */
function finElement(code, nom, depuis) {
  const re = new RegExp(`<(/?)${nom}(?=[\\s/>])`, 'g')
  re.lastIndex = depuis
  let profondeur = 1
  let m
  while ((m = re.exec(code))) {
    if (m[1] === '/') {
      profondeur--
      if (profondeur === 0) return code.indexOf('>', m.index) + 1
    } else {
      const { fin, auto } = finBaliseOuvrante(code, re.lastIndex)
      if (!auto) profondeur++
      re.lastIndex = fin
    }
  }
  return code.length
}

/** Attributs JSX sans le contenu des accolades (`pied={<Bouton voix="x" />}` → `pied={}`). */
function premierNiveau(attributs) {
  let sortie = ''
  let profondeur = 0
  for (const c of attributs) {
    if (c === '{') {
      if (profondeur === 0) sortie += c
      profondeur++
    } else if (c === '}') {
      profondeur--
      if (profondeur === 0) sortie += c
    } else if (profondeur === 0) sortie += c
  }
  return sortie
}

/** Indice de la parenthèse fermante qui correspond à celle ouverte en `i`. */
function parentheseFermante(code, i) {
  let profondeur = 0
  for (let j = i; j < code.length; j++) {
    if (code[j] === '(') profondeur++
    else if (code[j] === ')' && --profondeur === 0) return j
  }
  return code.length
}

/**
 * Un haut-parleur frère suit-il immédiatement l'élément (`<HautParleur`, `<span …><HautParleur`, `{x && <HautParleur`) ?
 * Les fins de condition ou de liste (`)}`) et la branche « sinon » d'une alternative (`) : (…)`) sont sautées :
 * `{lien ? <a>…</a> : <button>…</button>}<HautParleur/>` couvre les deux branches.
 */
function hautParleurApres(code, i) {
  let j = i
  for (let n = 0; n < 4; n++) {
    j += /^(\s|\{' '\}|\)|\})*/.exec(code.slice(j))[0].length
    if (code[j] !== ':') break
    const ouvrante = code.indexOf('(', j)
    if (ouvrante < 0 || ouvrante - j > 4) break
    j = parentheseFermante(code, ouvrante) + 1
  }
  const suite = code.slice(j, j + 400)
  return /^<(HautParleur|EcouterArticle)\b/.test(suite) || /^<span\b[^<]*>\s*<(HautParleur|EcouterArticle)\b/.test(suite) || /^\{[^{}<]*<(HautParleur|EcouterArticle)\b/.test(suite)
}

/**
 * Éléments bruts actionnables (`<button>`, `<a>`, `<summary>`, `<Link>`, `<NavLink>`) sans aide vocale.
 * Accepté si : l'élément contient `<HautParleur` ou porte `voix=` ; ou un `<HautParleur>` frère le suit immédiatement ;
 * ou il figure dans EXCEPTIONS_ELEMENTS_BRUTS. Heuristique textuelle volontairement simple (pas d'analyse du JSX complet).
 */
export function elementsBrutsSansVoix(fichiers, exceptions = EXCEPTIONS_ELEMENTS_BRUTS) {
  const resultats = []
  for (const f of fichiers) {
    const chemin = f.chemin.replace(/\\/g, '/')
    if (autreChantier(chemin) || !/\.tsx$/.test(chemin)) continue
    const code = sansCommentaires(f.contenu)
    const re = new RegExp(`<(${ELEMENTS_BRUTS.join('|')})(?=[\\s/>])`, 'g')
    let m
    while ((m = re.exec(code))) {
      const nom = m[1]
      const { fin, auto } = finBaliseOuvrante(code, re.lastIndex)
      const ouvrante = code.slice(m.index, fin + 1)
      const finEl = auto ? fin + 1 : finElement(code, nom, fin + 1)
      const element = code.slice(m.index, finEl)
      if (/\bvoix=/.test(ouvrante) || /<HautParleur\b/.test(element) || hautParleurApres(code, finEl)) continue
      if (exceptions.some((e) => (e.fichier.endsWith('/') ? chemin.startsWith(e.fichier) : chemin === e.fichier) && e.motif.test(element))) continue
      resultats.push({ fichier: chemin, ligne: ligneDe(code, m.index), element: nom })
    }
  }
  return resultats
}

const TYPES = {
  Bouton: 'Bouton',
  BoutonLien: 'Bouton',
  BoutonIcone: 'Bouton icône',
  Onglet: 'Onglet',
  EnTetePage: "Titre de l'écran",
  TitreAuth: "Titre de l'écran",
  Interrupteur: 'Interrupteur',
  HautParleur: 'Texte lu',
  Champ: 'Champ',
  Selection: 'Liste de choix',
}

/** Préfixe réservé aux guides vocaux des écrans (clés i18n du paquet `guide`). */
export const PREFIXE_GUIDE = 'guide.'
const TYPE_GUIDE = 'Guide vocal'

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
  for (const m of code.matchAll(/\b(voix|voixSousTitre|cle)=/g)) {
    const balise = balisePour(balises, m.index)
    if (!balise) continue
    if (m[1] === 'cle' && balise.nom !== 'HautParleur') continue
    const valeur = valeurAttribut(code, m.index + m[0].length)
    const type = m[1] === 'voixSousTitre' ? 'Texte lu' : (TYPES[balise.nom] ?? "Élément d'action")
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
    // Gabarit `prefixe.${…}` (périodes, opérateurs…) : développé avec les clés de traduction du préfixe.
    for (const g of expression.matchAll(/`([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\.\$\{[^`]+\}`/g)) ajouter(`${g[1]}.*`, m.index, type)
  }

  // Annonces automatiques.
  for (const m of code.matchAll(/\bannoncer\(\s*["']([^"']+)["']/g)) if (MOTIF_CLE.test(m[1])) ajouter(m[1], m.index, 'Annonce automatique')

  // Guides vocaux des écrans (chaînes littérales `'guide.…'`).
  for (const m of code.matchAll(/["'](guide\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)["']/g)) ajouter(m[1], m.index, TYPE_GUIDE)

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
        // Les guides (`guide.…`) sont essentiels : c'est lui qui explique l'écran à qui ne lit pas.
        essentielle: f.infos.essentielle || o.cle.startsWith(PREFIXE_GUIDE),
      })
    }
  }
  // Les essentielles d'abord (studio : à enregistrer en premier), chaque groupe dans l'ordre d'apparition.
  const entrees = [...vues.values()]
  return { registre: [...entrees.filter((e) => e.essentielle), ...entrees.filter((e) => !e.essentielle)], manquantes }
}

/** Utilisations des composants d'action (boutons, onglets, champs, listes, interrupteurs) sans prop `voix` (les relais `{...reste}` sont tolérés). */
export function boutonsSansVoix(fichiers) {
  const resultats = []
  for (const f of fichiers) {
    const code = sansCommentaires(f.contenu)
    if (autreChantier(f.chemin)) continue
    for (const b of balisesJsx(code)) {
      if (!COMPOSANTS_ACTION.includes(b.nom)) continue
      // `voix=` cherché au premier niveau seulement : un <Bouton voix> passé dans `pied={…}` ne compte pas pour la fenêtre.
      if (/\bvoix=/.test(premierNiveau(b.attributs)) || /\{\s*\.\.\./.test(b.attributs)) continue
      // Fenêtre : titre masqué (lu par les lecteurs d'écran seulement) ou titre qui porte déjà son propre haut-parleur.
      if (b.nom === 'Dialogue' && (/\btitreMasque\b/.test(b.attributs) || /<HautParleur\b/.test(b.attributs))) continue
      resultats.push({ fichier: f.chemin.replace(/\\/g, '/'), ligne: ligneDe(code, b.debut), composant: b.nom })
    }
  }
  return resultats
}

/** Sérialisation stable (une entrée par ligne : diff lisible). */
export function serialiser(registre) {
  return `[\n${registre.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]\n`
}
