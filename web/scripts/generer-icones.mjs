// Génère les icônes PWA (PNG 192/512, maskable, apple-touch) à partir d'un SVG : éclair or (dégradé) sur fond blanc.
// Usage : node scripts/generer-icones.mjs   (utilise le Chromium de Playwright, déjà installé pour les tests)
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dossier = resolve(racine, 'public/icones')

/** `marge` = pourcentage de zone sûre (maskable : l'éclair occupe le centre, le fond déborde). */
function svg(taille, { maskable }) {
  const rayon = maskable ? 0 : Math.round(taille * 0.22)
  const echelle = maskable ? 0.62 : 0.78
  const decalage = (taille * (1 - echelle)) / 2
  // Bordure gris chaud très fine sur les icônes arrondies (lisibles sur un écran d'accueil clair) ; pleine page pour maskable.
  const bordure = maskable ? '' : ` stroke="#e8e4db" stroke-width="${Math.max(1, Math.round(taille / 96))}"`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <defs>
    <linearGradient id="or" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2c25c"/>
      <stop offset="1" stop-color="#b38a1f"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${taille - 1}" height="${taille - 1}" rx="${rayon}" fill="#ffffff"${bordure}/>
  <g transform="translate(${decalage} ${decalage}) scale(${(taille * echelle) / 64})">
    <path fill="url(#or)" stroke="url(#or)" stroke-width="2" stroke-linejoin="round" d="M35.5 10 18 36h12.5l-3 18L47 28H34.5z"/>
  </g>
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
