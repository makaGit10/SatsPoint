// Génère les icônes PWA (PNG 192/512, maskable, apple-touch) et le favicon à partir du logo `public/logo.svg`.
// Usage : node scripts/generer-icones.mjs   (utilise le Chromium de Playwright, déjà installé pour les tests)
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dossier = resolve(racine, 'public/icones')

/**
 * Les icônes sont composées à partir du logo unique `public/logo.svg` (remplaçable par la propriétaire) :
 * pastille arrondie blanc chaud (icônes classiques) ou pleine page (maskable, zone sûre au centre).
 * Le favicon `public/favicon.svg` est une copie du logo.
 */
const logo = await readFile(resolve(racine, 'public/logo.svg'), 'utf8')
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`

function svg(taille, { maskable }) {
  const rayon = maskable ? 0 : Math.round(taille * 0.24)
  const echelle = maskable ? 0.6 : 0.74
  const cote = Math.round(taille * echelle)
  const decalage = Math.round((taille - cote) / 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <defs>
    <radialGradient id="halo" cx="0.75" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#ffe7a6"/>
      <stop offset="1" stop-color="#fffdf8"/>
    </radialGradient>
  </defs>
  <rect width="${taille}" height="${taille}" rx="${rayon}" fill="url(#halo)"/>
  <image href="${logoDataUri}" x="${decalage}" y="${decalage}" width="${cote}" height="${cote}"/>
</svg>`
}

const CIBLES = [
  { fichier: 'icone-192.png', taille: 192, maskable: false },
  { fichier: 'icone-512.png', taille: 512, maskable: false },
  { fichier: 'icone-maskable-192.png', taille: 192, maskable: true },
  { fichier: 'icone-maskable-512.png', taille: 512, maskable: true },
  { fichier: 'apple-touch-icon.png', taille: 180, maskable: true },
]

await mkdir(dossier, { recursive: true })
await copyFile(resolve(racine, 'public/logo.svg'), resolve(racine, 'public/favicon.svg'))
console.log('✓ favicon.svg (copie du logo)')
const navigateur = await chromium.launch()
try {
  for (const cible of CIBLES) {
    const page = await navigateur.newPage({ viewport: { width: cible.taille, height: cible.taille }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${svg(cible.taille, cible)}</body></html>`,
    )
    const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: cible.taille, height: cible.taille } })
    await writeFile(resolve(dossier, cible.fichier), png)
    await page.close()
    console.log(`✓ ${cible.fichier} (${cible.taille}px)`)
  }
} finally {
  await navigateur.close()
}
