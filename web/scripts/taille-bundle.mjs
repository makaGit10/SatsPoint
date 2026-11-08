// Mesure le JavaScript chargé avant le premier rendu, après `npm run build`.
// - « entrée » : <script type="module"> + <link rel="modulepreload"> de index.html ;
// - « premier écran » : entrée + morceaux chargés à la demande pour afficher cet écran (via .vite/manifest.json).
// Budget (cahier des charges § 14) : ≤ 170 Ko gzip pour le premier écran. Code de sortie 1 si dépassé.
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(racine, 'dist')
const BUDGET_KO = 170

const html = await readFile(resolve(dist, 'index.html'), 'utf8')
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))

const scripts = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''))
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''))
const feuilles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''))

const cache = new Map()
async function mesurer(fichier) {
  if (!cache.has(fichier)) {
    const contenu = await readFile(resolve(dist, fichier))
    cache.set(fichier, { brut: contenu.length, gzip: gzipSync(contenu, { level: 9 }).length, brotli: brotliCompressSync(contenu).length })
  }
  return cache.get(fichier)
}

const ko = (n) => (n / 1024).toFixed(1).padStart(7)
const ligne = (nom, m) => console.log(`${nom.padEnd(46)} ${ko(m.brut)} ${ko(m.gzip)} ${ko(m.brotli)}`)
const somme = (liste) => liste.reduce((acc, m) => ({ brut: acc.brut + m.brut, gzip: acc.gzip + m.gzip, brotli: acc.brotli + m.brotli }), { brut: 0, gzip: 0, brotli: 0 })

console.log(`\n${'fichier'.padEnd(46)} ${'brut'.padStart(7)} ${'gzip'.padStart(7)} ${'brotli'.padStart(7)}  (Ko)`)
console.log('— Entrée (index.html) —')
const entree = [...new Set([...scripts, ...preloads])]
const mesuresEntree = []
for (const f of entree) {
  const m = await mesurer(f)
  mesuresEntree.push(m)
  ligne(f, m)
}
const totalEntree = somme(mesuresEntree)
ligne('TOTAL entrée', totalEntree)

/** Fichiers (chunk + imports statiques récursifs) nécessaires à un module source. */
function fichiersPour(source) {
  const vus = new Set()
  const pile = [source]
  while (pile.length) {
    const cle = pile.pop()
    const e = manifest[cle]
    if (!e || vus.has(e.file)) continue
    vus.add(e.file)
    for (const imp of e.imports ?? []) pile.push(imp)
  }
  return [...vus].filter((f) => !entree.includes(f))
}

const ECRANS = [
  ['Langue (premier lancement)', ['src/ecrans/Langue.tsx']],
  ['Accueil', ['src/ecrans/Accueil.tsx']],
  ['Connexion', ['src/ecrans/auth/Connexion.tsx']],
  ['Caisse (coquille connectée)', ['src/coquille/Coquille.tsx', 'src/ecrans/Caisse.tsx']],
]

let pire = totalEntree
let pireNom = 'entrée'
console.log('\n— Premier écran = entrée + morceaux à la demande —')
for (const [nom, sources] of ECRANS) {
  const fichiers = [...new Set(sources.flatMap(fichiersPour))]
  const mesures = await Promise.all(fichiers.map(mesurer))
  const total = somme([totalEntree, ...mesures])
  ligne(`${nom} (+${fichiers.length} fichiers)`, total)
  if (total.gzip > pire.gzip) {
    pire = total
    pireNom = nom
  }
}

let cssGzip = 0
for (const f of feuilles) cssGzip += (await mesurer(f)).gzip
console.log(`\nCSS initial (hors budget JS) : ${(cssGzip / 1024).toFixed(1)} Ko gzip`)

const depasse = pire.gzip / 1024 > BUDGET_KO
console.log(`Budget ${BUDGET_KO} Ko gzip (pire premier écran : ${pireNom}) → ${depasse ? 'DÉPASSÉ' : 'OK'} (${(pire.gzip / 1024).toFixed(1)} Ko)\n`)
process.exit(depasse ? 1 : 0)
