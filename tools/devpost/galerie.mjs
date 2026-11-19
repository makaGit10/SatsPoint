// Images de la galerie Devpost (3:2, 1800×1200, < 5 Mo) à partir des vraies captures du site en ligne.
// Usage : node tools/devpost/galerie.mjs  → docs/galerie/NN-*.png
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(RACINE, 'web/package.json'))
const { chromium } = require('playwright')
const CAP = resolve(RACINE, 'captures/video-18-11')
const SORTIE = resolve(RACINE, 'docs/galerie')
const url = (f) => pathToFileURL(resolve(CAP, f)).href
const POLICE = pathToFileURL(resolve(RACINE, 'web/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')).href
const LOGO = readFileSync(resolve(RACINE, 'docs/images/logo.svg'), 'utf8')
mkdirSync(SORTIE, { recursive: true })

const b = await chromium.launch()

// Capture haute définition du panneau des langues au Mali (lecture seule sur le site en ligne).
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'fr-FR', isMobile: true, hasTouch: true })
  const p = await c.newPage()
  await p.goto('https://satspoint.onrender.com/'); await p.waitForSelector('[data-premiere-visite]', { timeout: 90000 })
  await p.locator('[data-premiere-visite] [data-choix-pays] select').selectOption('ML'); await p.waitForTimeout(1500)
  await p.screenshot({ path: resolve(CAP, 'tel-14-mali-bamanankan.png') })
  await c.close()
}

const IMAGES = [
  ['01-satspoint', 'The bitcoin till that speaks the merchant’s language', 'Price in FCFA · paid in sats · every button speaks Wolof', ['tel-01-choisissez-votre-langue.png', 'tel-04-caisse-cafe-touba-touche.png', 'tel-08-paiement-recu-reel.png'], true],
  ['02-langues-par-pays', 'Each country, its own languages', 'Senegal: Wolof, Serer, Pulaar, Jola · Mali: Bambara, added from the console', ['tel-01-choisissez-votre-langue.png', 'tel-14-mali-bamanankan.png']],
  ['03-produit-sans-ecrire', 'Add a product without typing', 'The app asks in Wolof · the price is spoken and writes itself', ['tel-06-nouvel-article.png', 'tel-07-nouvel-article-prix-dit-200.png']],
  ['04-vrai-paiement', 'A real mainnet payment, verified by the server', '100 FCFA = 265 sats · Wallet of Satoshi → merchant’s own wallet', ['wos-envoyer-265.png', 'wos-paiement-envoye.png', 'tel-08-paiement-recu-reel.png']],
  ['05-patron-portefeuille', 'The owner sees everything, live', 'Sales dashboard · non-custodial wallet (NWC)', ['tel-10-tableau-de-bord.png', 'tel-09-ventes.png', 'tel-11-portefeuille.png']],
  ['06-studio-console', 'Any language, recorded in the built-in studio', 'Burst-mode recording · silences and noise cleaned automatically', [], false, ['crop-pc-05-studio-audio.png', 'crop-pc-07-console-langues.png']],
]

const CSS = `@font-face { font-family: J; src: url('${POLICE}') format('woff2-variations'); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0 }
body { width: 1800px; height: 1200px; overflow: hidden; font-family: J, sans-serif; color: #1c1404;
  background: radial-gradient(1100px 700px at 85% 0%, #fde7b0 0%, transparent 60%), radial-gradient(900px 600px at 0% 100%, #fbefd2 0%, transparent 55%), #fffaf1;
  display: flex; flex-direction: column; align-items: center; padding: 70px 60px 0; gap: 18px }
h1 { font-size: 66px; font-weight: 800; letter-spacing: -.02em; text-align: center; line-height: 1.08 }
p { font-size: 32px; font-weight: 600; color: #8a5a00; text-align: center }
.marque { display: flex; align-items: center; gap: 18px; font-size: 44px; font-weight: 800 } .marque svg { width: 70px; height: 70px }
.scene { display: flex; gap: 56px; align-items: flex-start; justify-content: center; margin-top: 24px }
.t { height: 860px; border-radius: 52px; padding: 13px; background: #15110a; box-shadow: 0 36px 70px rgba(60,40,0,.28) } .t img { height: 100%; border-radius: 40px; display: block }
.p { width: 800px; border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 36px 70px rgba(60,40,0,.25); border: 1px solid #ecdcb4 } .p img { width: 100%; display: block; max-height: 860px; object-fit: cover; object-position: top }`

const page = await b.newPage({ viewport: { width: 1800, height: 1200 } })
for (const [nom, titre, sous, tels, marque, pcs = []] of IMAGES) {
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${marque ? `<div class="marque">${LOGO}SatsPoint</div>` : ''}<h1>${titre}</h1><p>${sous}</p><div class="scene">${tels.map((f) => `<div class="t" style="height:${marque ? 780 : 860}px"><img src="${url(f)}"></div>`).join('')}${pcs.map((f) => `<div class="p"><img src="${url(f)}"></div>`).join('')}</div>`
  const h = resolve(SORTIE, `${nom}.html`)
  writeFileSync(h, html)
  await page.goto(pathToFileURL(h).href)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  await page.screenshot({ path: resolve(SORTIE, `${nom}.png`) })
}
await b.close()
console.log('galerie →', SORTIE)
