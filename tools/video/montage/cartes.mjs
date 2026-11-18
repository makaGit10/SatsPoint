// Cartes titres, images fixes et décors de la vidéo (1920×1080), rendus en HTML par Playwright.
// Décors communs : bg-tel.png + cadre-tel.png (transparent, l'écran filmé passe dessous), bg-pc.png (cadre navigateur).
// Cartes par langue : out/cartes/{fr,en}/cNN.png (NN = numéro de la phrase de voix off de SCRIPT.md).
// Usage : node tools/video/montage/cartes.mjs
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../../..')
const require = createRequire(resolve(RACINE, 'web/package.json'))
const { chromium } = require('playwright')
const CAP = resolve(RACINE, 'captures/video-18-11')
const SORTIE = resolve(RACINE, 'tools/video/out/cartes')
const url = (f) => pathToFileURL(resolve(CAP, f)).href
const POLICE = pathToFileURL(resolve(RACINE, 'web/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')).href
const LOGO = readFileSync(resolve(RACINE, 'docs/images/logo.svg'), 'utf8')
export const GEO = { tel: { x: 1236, y: 70, w: 434, h: 940, bord: 14, rayon: 60 }, pc: { x: 312, y: 140, w: 1296, h: 810, barre: 40 } }

const T = (fr, en) => ({ fr, en })
const CARTES = {
  1: { sur: T('Dakar · marché HLM', 'Dakar · HLM market'), titre: T('Voici Awa.', 'Meet Awa.'), sous: T('Elle vend des tissus… et elle ne sait pas lire.', 'She sells fabric… and she cannot read.') },
  2: { sur: T('Un client veut payer en bitcoin', 'A customer wants to pay in bitcoin'), puces: [T('Du texte partout', 'Text everywhere'), T('En anglais', 'In English'), T('En dollars', 'In dollars')], barre: true },
  3: { logo: true, sous: T('La caisse bitcoin qui parle sa langue.', 'The bitcoin till that speaks her language.') },
  13: { tels: ['wos-envoyer-265.png', 'wos-paiement-envoye.png'], badge: T('Vrai paiement · 265 sats · Wallet of Satoshi', 'Real payment · 265 sats · Wallet of Satoshi') },
  16: { sur: T('Pas de bitcoin ? Le même écran encaisse', 'No bitcoin? The same screen takes'), puces: [T('Wave', 'Wave'), T('Orange Money', 'Orange Money'), T('Free Money', 'Free Money')], sous: T('avec la même confirmation automatique', 'with the same automatic confirmation') },
  22: { tels: ['tel-13-double-authentification.png'], pc: 'crop-pc-09-console-journal.png', badge: T('Double authentification · journal d’audit', 'Two-factor authentication · audit log') },
  23: { sur: T('Sénégal', 'Senegal'), titre: T('Le mobile money est déjà partout.', 'Mobile money is already everywhere.'), sous: T('SatsPoint y ajoute le bitcoin, sans changer les habitudes.', 'SatsPoint adds bitcoin, without changing habits.') },
  24: { liste: T('Prochaines étapes', 'Next steps'), items: [T('Pilote : 10 commerçants à Dakar', 'Pilot: 10 merchants in Dakar'), T('Sats → francs avec un partenaire local', 'Sats → francs with a local partner'), T('Sérère, pulaar, diola enregistrés', 'Serer, Pulaar, Jola recorded')] },
  25: { logo: true, sous: T('Encaisser en bitcoin, dans sa propre langue.', 'Getting paid in bitcoin, in your own language.'), liens: ['satspoint.onrender.com', 'github.com/makaGit10/SatsPoint'] },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const FOND = `radial-gradient(1200px 700px at 85% 0%, #fde7b0 0%, transparent 60%), radial-gradient(900px 600px at 0% 100%, #fbefd2 0%, transparent 55%), #fffaf1`
const CSS = `
@font-face { font-family: J; src: url('${POLICE}') format('woff2-variations'); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0 }
body { width: 1920px; height: 1080px; overflow: hidden; font-family: J, sans-serif; color: #1c1404; background: ${FOND} }
body.transparent { background: transparent }
.zone { position: absolute; inset: 0 0 140px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; text-align: center }
.sur { font-size: 42px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #8a5a00 }
h1 { font-size: 120px; font-weight: 800; line-height: 1.04; letter-spacing: -.025em; max-width: 1600px }
.sous { font-size: 52px; font-weight: 500; color: #5b4a2a; max-width: 1500px }
.puces { display: flex; gap: 26px; flex-wrap: wrap; justify-content: center }
.puces span { font-size: 60px; font-weight: 750; padding: 24px 48px; border-radius: 999px; background: #fff; border: 3px solid #eab02e; box-shadow: 0 12px 34px rgba(138,90,0,.14) }
.barre .puces span { text-decoration: line-through; text-decoration-thickness: 6px; text-decoration-color: #c0392b; border-color: #e6cfa0; color: #6b5a3a }
.logo svg { width: 240px; height: 240px } .marque { font-size: 150px }
.liens { display: flex; gap: 28px } .liens span { font-size: 38px; font-weight: 650; padding: 14px 30px; border-radius: 16px; background: #fff; border: 2px solid #f0d48a }
ol { text-align: left; font-size: 64px; font-weight: 700; line-height: 1.65; padding-left: 90px } ol li::marker { color: #d99a14; font-weight: 800 }
.scene { display: flex; gap: 60px; align-items: center }
.t { height: 760px; border-radius: 58px; padding: 14px; background: #15110a; box-shadow: 0 40px 80px rgba(60,40,0,.28) } .t img { height: 100%; border-radius: 46px; display: block }
.p { width: 1040px; border-radius: 20px; overflow: hidden; background: #fff; box-shadow: 0 40px 80px rgba(60,40,0,.25); border: 1px solid #ecdcb4 } .p img { width: 100%; display: block; max-height: 700px; object-fit: cover; object-position: top }
.badge { font-size: 42px; font-weight: 750; padding: 18px 42px; border-radius: 999px; background: #1c1404; color: #fde7b0 }
.cadre-tel { position: absolute; left: ${GEO.tel.x - GEO.tel.bord}px; top: ${GEO.tel.y - GEO.tel.bord}px; width: ${GEO.tel.w + 2 * GEO.tel.bord}px; height: ${GEO.tel.h + 2 * GEO.tel.bord}px; border: ${GEO.tel.bord}px solid #15110a; border-radius: ${GEO.tel.rayon}px }
.ombre-tel { position: absolute; left: ${GEO.tel.x - GEO.tel.bord}px; top: ${GEO.tel.y - GEO.tel.bord}px; width: ${GEO.tel.w + 2 * GEO.tel.bord}px; height: ${GEO.tel.h + 2 * GEO.tel.bord}px; border-radius: ${GEO.tel.rayon}px; background: #15110a; box-shadow: 0 50px 90px rgba(60,40,0,.30) }
.navigateur { position: absolute; left: ${GEO.pc.x}px; top: ${GEO.pc.y - GEO.pc.barre}px; width: ${GEO.pc.w}px; height: ${GEO.pc.h + GEO.pc.barre}px; border-radius: 18px; background: #fff; box-shadow: 0 40px 80px rgba(60,40,0,.25); border: 1px solid #ecdcb4; overflow: hidden }
.navigateur .b { height: ${GEO.pc.barre}px; display: flex; align-items: center; gap: 9px; padding: 0 16px; background: #f6efe0 } .b i { width: 13px; height: 13px; border-radius: 50%; background: #e3c98f }
.b span { margin-left: 16px; font-size: 18px; color: #7a6a4a; background: #fff; padding: 3px 16px; border-radius: 9px }
`

function carte(c, L) {
  if (c.logo) return `<div class="zone"><div class="logo">${LOGO}</div><h1 class="marque">SatsPoint</h1><p class="sous">${esc(c.sous[L])}</p>${c.liens ? `<div class="liens">${c.liens.map((l) => `<span>${l}</span>`).join('')}</div>` : ''}</div>`
  if (c.liste) return `<div class="zone"><div class="sur">${esc(c.liste[L])}</div><ol>${c.items.map((i) => `<li>${esc(i[L])}</li>`).join('')}</ol></div>`
  if (c.tels) return `<div class="zone"><div class="scene">${c.tels.map((f) => `<div class="t"><img src="${url(f)}"></div>`).join('')}${c.pc ? `<div class="p"><img src="${url(c.pc)}"></div>` : ''}</div><div class="badge">${esc(c.badge[L])}</div></div>`
  return `<div class="zone ${c.barre ? 'barre' : ''}">${c.sur ? `<div class="sur">${esc(c.sur[L])}</div>` : ''}${c.titre ? `<h1>${esc(c.titre[L])}</h1>` : ''}${c.puces ? `<div class="puces">${c.puces.map((p) => `<span>${esc(p[L])}</span>`).join('')}</div>` : ''}${c.sous ? `<p class="sous">${esc(c.sous[L])}</p>` : ''}</div>`
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } })
async function rendre(html, fichier, transparent = false) {
  const h = resolve(dirname(fichier), fichier.split(/[\\/]/).pop().replace(/\.png$/, '.html'))
  writeFileSync(h, `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body class="${transparent ? 'transparent' : ''}">${html}</body>`)
  await page.goto(pathToFileURL(h).href)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  await page.screenshot({ path: fichier, omitBackground: transparent })
}
mkdirSync(SORTIE, { recursive: true })
await rendre('<div class="ombre-tel"></div>', resolve(SORTIE, 'bg-tel.png'))
await rendre('<div class="cadre-tel"></div>', resolve(SORTIE, 'cadre-tel.png'), true)
await rendre('<div class="navigateur"><div class="b"><i></i><i></i><i></i><span>satspoint.onrender.com</span></div></div>', resolve(SORTIE, 'bg-pc.png'))
for (const L of ['fr', 'en']) {
  mkdirSync(resolve(SORTIE, L), { recursive: true })
  for (const [n, c] of Object.entries(CARTES)) await rendre(carte(c, L), resolve(SORTIE, L, `c${String(n).padStart(2, '0')}.png`))
}
await b.close()
console.log('cartes et décors →', SORTIE)
