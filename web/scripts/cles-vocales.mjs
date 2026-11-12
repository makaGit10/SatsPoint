// Génère `src/voix/cles-vocales.json` (CONTRAT_API § V3.1) : toutes les clés vocales du code, dans l'ordre d'apparition,
// avec leurs textes FR / EN (fr.json, en.json et paquets chargés à la demande `*.fr.json` / `*.en.json`).
// Usage : node scripts/cles-vocales.mjs [--verifier]  (--verifier : n'écrit rien, code 1 si le fichier n'est pas à jour)
// Lancé automatiquement par `npm run build`. Le back l'importe (`php artisan audio:synchroniser`).
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boutonsSansVoix, construireRegistre, elementsBrutsSansVoix, serialiser } from './cles-vocales-lib.mjs'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(racine, 'src')
const cible = resolve(src, 'voix', 'cles-vocales.json')

export async function fichiersSource(dossier = src) {
  const resultat = []
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      if (entree.name === 'test') continue
      resultat.push(...(await fichiersSource(chemin)))
    } else if (/\.(ts|tsx)$/.test(entree.name) && !/\.(test|d)\.tsx?$/.test(entree.name) && !/^mock/.test(entree.name)) {
      resultat.push({ chemin: relative(src, chemin).replace(/\\/g, '/'), contenu: await readFile(chemin, 'utf8') })
    }
  }
  return resultat
}

export async function traductions(locale) {
  const dossier = resolve(src, 'i18n')
  const fusion = {}
  const fusionner = (cible, source) => {
    for (const [cle, valeur] of Object.entries(source)) {
      if (valeur && typeof valeur === 'object') fusionner((cible[cle] ??= {}), valeur)
      else cible[cle] = valeur
    }
  }
  for (const nom of (await readdir(dossier)).sort()) {
    if (nom === `${locale}.json` || nom.endsWith(`.${locale}.json`)) fusionner(fusion, JSON.parse(await readFile(join(dossier, nom), 'utf8')))
  }
  return fusion
}

const verifier = process.argv.includes('--verifier')
const fichiers = await fichiersSource()
const { registre, manquantes } = construireRegistre(fichiers, await traductions('fr'), await traductions('en'))
const sansVoix = boutonsSansVoix(fichiers)
const contenu = serialiser(registre)

let code = 0
if (manquantes.length) {
  console.error(`Clés vocales sans texte :\n${manquantes.map((m) => `  - ${m.cle} (${m.fichier}:${m.ligne}) ${m.fr ? '' : 'FR '}${m.en ? '' : 'EN'}`).join('\n')}`)
  code = 1
}
if (sansVoix.length) {
  console.error(`Boutons sans clé vocale :\n${sansVoix.map((b) => `  - <${b.composant}> ${b.fichier}:${b.ligne}`).join('\n')}`)
  code = 1
}
// Éléments bruts (<button>, <a>, <summary>, <Link>, <NavLink>) : haut-parleur obligatoire, sauf exception justifiée.
const brutsSansVoix = elementsBrutsSansVoix(fichiers)
if (brutsSansVoix.length) {
  console.error(`Éléments actionnables sans haut-parleur :\n${brutsSansVoix.map((b) => `  - <${b.element}> ${b.fichier}:${b.ligne}`).join('\n')}`)
  code = 1
}

if (verifier) {
  const actuel = await readFile(cible, 'utf8').catch(() => '')
  if (actuel !== contenu) {
    console.error('src/voix/cles-vocales.json n\'est pas à jour : lancez `npm run cles-vocales`.')
    code = 1
  }
} else {
  await writeFile(cible, contenu, 'utf8')
  const essentielles = registre.filter((e) => e.essentielle).length
  console.log(`${registre.length} clés vocales (${essentielles} essentielles) → ${relative(racine, cible)}`)
}
process.exit(code)
