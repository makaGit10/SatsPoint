// Images de la vidéo (1920×1080), une par plan de SCRIPT.md, rendues en HTML par Playwright :
// cartes titres dans le style de l'application, vraies captures dans un cadre téléphone / navigateur,
// sous-titre anglais incrusté. Deux jeux : textes des cartes en français (fr) ou en anglais (en).
// Usage : node tools/video/montage/diapos.mjs            → tools/video/out/diapos/{fr,en}/NN.png
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../../..')
const require = createRequire(resolve(RACINE, 'web/package.json'))
const { chromium } = require('playwright')
const CAP = resolve(RACINE, 'captures/video-18-11')
const SORTIE = resolve(RACINE, 'tools/video/out/diapos')
const url = (f) => pathToFileURL(resolve(CAP, f)).href
const POLICE = pathToFileURL(resolve(RACINE, 'web/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')).href
const LOGO = readFileSync(resolve(RACINE, 'docs/images/logo.svg'), 'utf8')

// Plans de SCRIPT.md : numéro → colonnes voix off (fr, en).
const plans = new Map()
for (const l of readFileSync(resolve(RACINE, 'tools/video/SCRIPT.md'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/)
  if (m) plans.set(Number(m[1]), { fr: m[4].trim(), en: m[5].trim() })
}

const T = (fr, en) => ({ fr, en })
const VISUELS = {
  1: { carte: { sur: T('Dakar · marché HLM', 'Dakar · HLM market'), titre: T('Awa vend des tissus.', 'Awa sells fabric.'), sous: T('Elle encaisse presque tout le monde.', 'She gets paid by almost everyone.') } },
  2: { carte: { sur: T('Un client veut payer en bitcoin', 'A customer wants to pay in bitcoin'), titre: T('Aucun outil simple.', 'No simple way.'), sous: T('pour accepter le paiement', 'to accept the payment') } },
  3: { carte: { sur: T('Les outils existants', 'Existing tools'), puces: [T('Anglais', 'English'), T('Dollars', 'Dollars'), T('Ordinateur', 'Laptop'), T('Bonne connexion', 'Good connection')] } },
  4: { carte: { titre: T('Un écran rempli de texte…', 'A screen full of text…'), sous: T('…c’est une porte fermée pour qui ne lit pas.', '…is a closed door for those who do not read.') } },
  5: { logo: { sous: T('La caisse Lightning des commerçants africains', 'The Lightning point-of-sale for African merchants') } },
  6: { tel: ['tel-01-choisissez-votre-langue.png', 'tel-02-accueil.png'] },
  7: { tel: ['tel-05-articles.png', 'tel-06-nouvel-article.png'] },
  8: { tel: ['tel-07-nouvel-article-prix-dit-200.png'], badge: T('🎤 « deux cents francs » → 200', '🎤 “two hundred francs” → 200') },
  9: { tel: ['tel-04-caisse-cafe-touba-touche.png'], badge: T('🔊 « Café Touba »', '🔊 “Café Touba”') },
  10: { tel: ['tel-03-caisse.png'], badge: T('🔊 Chaque bouton parle', '🔊 Every button speaks') },
  11: { pc: 'qr-en-attente.png', badge: T('Valable 5 minutes · prix figé', 'Valid 5 minutes · frozen price') },
  12: { tel: ['wos-envoyer-265.png', 'wos-paiement-envoye.png'], badge: T('Vrai paiement · 265 sats', 'Real payment · 265 sats') },
  13: { tel: ['tel-08-paiement-recu-reel.png'], badge: T('Vrai paiement reçu · V-000001', 'Real payment received · V-000001') },
  14: { tel: ['tel-09-ventes.png', 'tel-11-portefeuille.png'], badge: T('Vérifié par le serveur auprès du portefeuille', 'Verified by the server with the wallet') },
  15: { carte: { sur: T('Pas de bitcoin ? Le même écran encaisse en', 'No bitcoin? The same screen takes'), puces: [T('Wave', 'Wave'), T('Orange Money', 'Orange Money'), T('Free Money', 'Free Money')], sous: T('avec la même confirmation automatique', 'with the same automatic confirmation') } },
  16: { tel: ['tel-08-paiement-recu-reel.png'], badge: T('Reçu sur WhatsApp, sans imprimante', 'Receipt on WhatsApp, no printer') },
  17: { tel: ['tel-10-tableau-de-bord.png'], badge: T('Ventes en direct, sur le téléphone du patron', 'Live sales, on the owner’s phone') },
  18: { tel: ['tel-11-portefeuille.png'] },
  19: { schema: true },
  20: { pc: 'crop-pc-09-console-journal.png', tel: ['tel-13-double-authentification.png'], badge: T('Double authentification · journal d’audit', 'Two-factor authentication · audit log') },
  21: { pc: 'crop-pc-05-studio-audio.png', badge: T('Toute langue du monde, en un clic', 'Any language in the world, in one click') },
  22: { carte: { sur: T('Sénégal', 'Senegal'), titre: T('Le mobile money est déjà partout.', 'Mobile money is already everywhere.'), sous: T('Un téléphone suffit pour rejoindre les commerçants.', 'A phone is all it takes to reach merchants.') } },
  23: { pc: 'crop-pc-06-console.png', badge: T('Commerçants actifs · paiements · délai écran vert', 'Active merchants · payments · green-screen delay') },
  24: { terminal: true },
  25: { liste: { titre: T('Prochaines étapes', 'Next steps'), items: [T('Sats → francs via un partenaire local', 'Sats → francs through a local partner'), T('Sérère et pulaar enregistrés', 'Serer and Pulaar recorded'), T('Mode hors ligne par message', 'Offline mode over text messages')] } },
  26: { carte: { sur: T('Pilote', 'Pilot'), titre: T('10 commerçants, un quartier de Dakar.', '10 merchants, one Dakar neighbourhood.'), sous: T('Des chiffres publiés chaque semaine.', 'Numbers published every week.') } },
  27: { logo: { sous: T('Encaisser en bitcoin, aussi simplement qu’en mobile money.', 'Getting paid in bitcoin, as simply as mobile money.'), liens: ['satspoint.onrender.com', 'github.com/makaGit10/SatsPoint'] } },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const tel = (f, h = 680) => `<div class="tel" style="height:${h}px"><img src="${url(f)}"></div>`

function corps(v, L) {
  if (v.carte) {
    const c = v.carte
    return `<div class="carte">${c.sur ? `<div class="sur">${esc(c.sur[L])}</div>` : ''}${c.titre ? `<h1>${esc(c.titre[L])}</h1>` : ''}${c.puces ? `<div class="puces">${c.puces.map((p) => `<span>${esc(p[L])}</span>`).join('')}</div>` : ''}${c.sous ? `<p>${esc(c.sous[L])}</p>` : ''}</div>`
  }
  if (v.logo) return `<div class="carte"><div class="logo">${LOGO}</div><h1 class="marque">SatsPoint</h1><p>${esc(v.logo.sous[L])}</p>${v.logo.liens ? `<div class="liens">${v.logo.liens.map((l) => `<span>${l}</span>`).join('')}</div>` : ''}</div>`
  if (v.schema) {
    const t = L === 'fr' ? ['Client', 'paie', 'Portefeuille du commerçant', 'l’argent reste ici', 'SatsPoint', 'crée et vérifie les factures', 'droits limités · révocables'] : ['Customer', 'pays', 'Merchant’s wallet', 'the money stays here', 'SatsPoint', 'creates and checks invoices', 'limited · revocable rights']
    return `<div class="schema"><div class="boite">${t[0]}</div><div class="fleche">⚡ ${t[1]} →</div><div class="boite or">${t[2]}<small>${t[3]}</small></div><div class="fleche">← ${t[6]}</div><div class="boite">${t[4]}<small>${t[5]}</small></div></div>`
  }
  if (v.terminal) {
    const l = L === 'fr' ? ['✓ données de démonstration', '✓ mode simulé sans portefeuille', '✓ une seule commande'] : ['✓ demo data', '✓ simulated mode without a wallet', '✓ one single command']
    return `<div class="terminal"><div class="barre"><i></i><i></i><i></i></div><pre><b>$</b> git clone github.com/makaGit10/SatsPoint
<b>$</b> docker compose up -d
${l.map((x) => `<em>${x}</em>`).join('\n')}</pre></div>`
  }
  if (v.liste) return `<div class="carte"><div class="sur">${esc(v.liste.titre[L])}</div><ol>${v.liste.items.map((i) => `<li>${esc(i[L])}</li>`).join('')}</ol></div>`
  const pc = v.pc ? `<div class="pc"><div class="barre"><i></i><i></i><i></i><span>satspoint.onrender.com</span></div><img src="${url(v.pc)}">${v.encart ? `<img class="encart" src="${url(v.encart)}">` : ''}</div>` : ''
  const tels = v.tel ? v.tel.map((f) => tel(f, v.pc ? 600 : 680)).join('') : ''
  return `<div class="scene">${tels}${pc}</div>${v.badge ? `<div class="badge">${esc(v.badge[L])}</div>` : ''}`
}

const CSS = `
@font-face { font-family: J; src: url('${POLICE}') format('woff2-variations'); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0 }
body { width: 1920px; height: 1080px; overflow: hidden; font-family: J, sans-serif; color: #1c1404;
  background: radial-gradient(1200px 700px at 85% 0%, #fde7b0 0%, transparent 60%), radial-gradient(900px 600px at 0% 100%, #fbefd2 0%, transparent 55%), #fffaf1; }
.zone { position: absolute; inset: 30px 0 175px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px }
.carte { text-align: center; max-width: 1500px; display: flex; flex-direction: column; align-items: center; gap: 30px }
.sur { font-size: 40px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #8a5a00 }
h1 { font-size: 104px; font-weight: 800; line-height: 1.05; letter-spacing: -.02em }
.carte p { font-size: 48px; font-weight: 500; color: #5b4a2a }
.puces { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center }
.puces span { font-size: 56px; font-weight: 700; padding: 22px 44px; border-radius: 999px; background: #fff; border: 3px solid #eab02e; box-shadow: 0 10px 30px rgba(138,90,0,.12) }
.logo svg { width: 220px; height: 220px }
.marque { font-size: 130px }
.liens { display: flex; gap: 24px } .liens span { font-size: 36px; font-weight: 600; padding: 14px 30px; border-radius: 16px; background: #fff; border: 2px solid #f0d48a }
ol { text-align: left; font-size: 58px; font-weight: 650; line-height: 1.6; padding-left: 80px } ol li::marker { color: #d99a14; font-weight: 800 }
.scene { display: flex; gap: 56px; align-items: center; justify-content: center }
.tel { aspect-ratio: auto; border-radius: 56px; padding: 14px; background: #15110a; box-shadow: 0 40px 80px rgba(60,40,0,.28) }
.tel img { height: 100%; border-radius: 44px; display: block }
.pc { position: relative; width: 1180px; border-radius: 22px; overflow: visible; background: #fff; box-shadow: 0 40px 80px rgba(60,40,0,.25); border: 1px solid #ecdcb4 }
.scene .tel + .pc { width: 1000px }
.pc .barre { height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: #f6efe0; border-radius: 22px 22px 0 0 }
.barre i { width: 14px; height: 14px; border-radius: 50%; background: #e3c98f; display: inline-block }
.pc .barre span { margin-left: 18px; font-size: 20px; color: #7a6a4a; background: #fff; padding: 4px 18px; border-radius: 10px }
.pc > img { width: 100%; display: block; border-radius: 0 0 22px 22px; max-height: 600px; object-fit: cover; object-position: top }
.encart { position: absolute; right: -90px; bottom: -60px; width: 560px; border-radius: 18px; box-shadow: 0 30px 60px rgba(0,0,0,.3); border: 4px solid #fff }
.badge { font-size: 40px; font-weight: 700; padding: 16px 38px; border-radius: 999px; background: #1c1404; color: #fde7b0 }
.schema { display: flex; align-items: center; gap: 26px }
.boite { font-size: 46px; font-weight: 800; padding: 46px 40px; border-radius: 30px; background: #fff; border: 3px solid #ecdcb4; text-align: center; display: flex; flex-direction: column; gap: 10px; max-width: 470px }
.boite.or { background: #eab02e; border-color: #d99a14; color: #2a1c00 } .boite small { font-size: 28px; font-weight: 600; opacity: .8 }
.fleche { font-size: 34px; font-weight: 700; color: #8a5a00; text-align: center; max-width: 260px }
.terminal { width: 1300px; border-radius: 22px; background: #15110a; box-shadow: 0 40px 80px rgba(0,0,0,.3); overflow: hidden }
.terminal .barre { height: 50px; display: flex; gap: 10px; align-items: center; padding: 0 20px; background: #2a2216 }
.terminal pre { font: 600 46px/1.7 Consolas, monospace; color: #f6efe0; padding: 40px 54px } .terminal b { color: #eab02e } .terminal em { font-style: normal; color: #7ddc9b }
.st { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); max-width: 1640px; text-align: center; font-size: 38px; font-weight: 600; line-height: 1.32; color: #fff; background: rgba(20,14,4,.82); padding: 14px 34px; border-radius: 16px }
`

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } })
for (const L of ['fr', 'en']) {
  const dossier = resolve(SORTIE, L)
  mkdirSync(dossier, { recursive: true })
  for (const [n, textes] of plans) {
    const v = VISUELS[n]
    if (!v) throw new Error(`plan ${n} sans visuel`)
    const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="zone">${corps(v, L)}</div><div class="st">${esc(textes.en)}</div>`
    const fichier = resolve(dossier, `${String(n).padStart(2, '0')}.html`)
    writeFileSync(fichier, html)
    await page.goto(pathToFileURL(fichier).href)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
    await page.screenshot({ path: fichier.replace(/\.html$/, '.png') })
  }
  console.log(`${plans.size} images (${L}) → ${dossier}`)
}
await b.close()
