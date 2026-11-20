// Guide du jury (PDF, anglais) + ZIP de soumission Devpost (guide + deux vidéos).
// Le mot de passe de la boutique démo est lu dans .env au moment de la génération : le PDF et le ZIP
// restent dans tools/devpost/out/ (ignoré par git) — ne jamais les committer.
// Usage : node tools/devpost/guide-jury.mjs
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(RACINE, 'web/package.json'))
const { chromium } = require('playwright')
const OUT = resolve(RACINE, 'tools/devpost/out')
mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(RACINE, 'tools/devpost/.gitignore'), 'out/\n')
const env = Object.fromEntries(readFileSync(resolve(RACINE, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const img = (f) => pathToFileURL(resolve(RACINE, 'docs/galerie', f)).href
const POLICE = pathToFileURL(resolve(RACINE, 'web/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')).href
const LOGO = readFileSync(resolve(RACINE, 'docs/images/logo.svg'), 'utf8')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

const html = `<!doctype html><meta charset="utf-8"><title>SatsPoint — Judges' guide</title><style>
@font-face { font-family: J; src: url('${POLICE}') format('woff2-variations'); font-weight: 200 800; }
@page { size: A4; margin: 16mm 15mm }
body { font-family: J, sans-serif; color: #1c1404; font-size: 10.5pt; line-height: 1.5 }
h1 { font-size: 26pt; margin: 0; letter-spacing: -.01em } h2 { font-size: 14pt; margin: 18px 0 6px; color: #8a5a00; border-bottom: 2px solid #f0d48a; padding-bottom: 3px }
.tete { display: flex; align-items: center; gap: 14px } .tete svg { width: 56px; height: 56px }
.pitch { font-size: 12.5pt; font-weight: 600; margin: 6px 0 12px }
table { border-collapse: collapse; width: 100% } td, th { border: 1px solid #ecdcb4; padding: 5px 8px; vertical-align: top; text-align: left } th { background: #fdf3da }
code { background: #f6efe0; padding: 1px 5px; border-radius: 4px; font-size: 9.5pt }
.boite { background: #fffaf1; border: 2px solid #eab02e; border-radius: 10px; padding: 10px 14px; margin: 8px 0 }
ol, ul { margin: 4px 0 4px 20px; padding: 0 } li { margin: 2px 0 }
img.g { width: 100%; border-radius: 8px; border: 1px solid #ecdcb4; margin-top: 6px }
.ok { color: #166534; font-weight: 700 } .test { color: #92400e; font-weight: 700 }
.saut { page-break-before: always }
</style>
<div class="tete">${LOGO}<div><h1>SatsPoint</h1><div>Judges' guide · Dakar Bitcoin Hack by BTrust</div></div></div>
<p class="pitch">The bitcoin till that speaks the merchant's language: price in FCFA, get paid in sats in seconds, hear every button in Wolof. Built for African merchants who do not read. Non-custodial.</p>

<table>
<tr><th>Live app</th><td><code>https://satspoint.onrender.com</code> (phone or desktop; first load can take up to a minute on free hosting)</td></tr>
<tr><th>Code</th><td><code>https://github.com/makaGit10/SatsPoint</code></td></tr>
<tr><th>Demo video (3 min)</th><td>English: <code>https://youtu.be/i93TtM1nols</code> · French: <code>https://youtu.be/LayPRfuntFI</code> (both files are also in this ZIP)</td></tr>
</table>

<h2>Try it in 2 minutes (live app)</h2>
<div class="boite"><b>One-click access — no password</b><br>
On the login page (<b>"J'ai déjà un compte"</b>), the gold box <b>"Accès rapide — démo pour le jury"</b> logs you in with one click as
<b>Awa · Owner</b>, <b>Fatou · Manager</b> or <b>Moussa · Cashier</b>. Switch profile at any time: tap your avatar (top right) → <b>"Changer de profil (démo)"</b>.<br>
The demo shop is shared and protected: wallet, payment keys, team, settings and deletions are locked for demo accounts, and the wallet has no spending permission.<br>
<span style="font-size:9pt;color:#6b5a3a">Fallback login: <code>demo@satspoint.local</code> · <code>${esc(env.DEMO_PASSWORD)}</code></span></div>
<ol>
<li><b>First launch:</b> open the site in a private window. The "Choose your language" panel appears. Tap the small speaker on the <b>Wolof</b> tile: you hear a real Wolof recording. Change the country (e.g. <b>Mali</b>): the list of languages changes (Bambara appears).</li>
<li>Back on <b>Senegal</b>, tap <b>Wolof</b>: the welcome message plays in Wolof. Then <b>"J'ai déjà un compte"</b> → <b>Awa · Propriétaire</b> (one click).</li>
<li><b>Caisse</b> (till): tap the coffee picture (<i>Café Touba</i>): it says its name; the amount shows in FCFA and in sats. Tap the speaker on <b>Encaisser</b>: Wolof again.</li>
<li><b>Encaisser</b> → a real <b>Lightning invoice</b> (QR, valid 5 minutes, price locked). You may pay it with any Lightning wallet (e.g. 100 FCFA ≈ 265 sats): the screen turns green within seconds, after the server verifies the invoice with the wallet. Otherwise tap <b>Annuler la vente</b>.</li>
<li><b>Plus → Articles → Ajouter</b>: tap <b>"Dire le prix"</b> and say "deux cents francs" (Chrome / Android / Safari, French speech recognition): 200 writes itself, editable on the keypad. Tap <b>Annuler</b> to leave the shop unchanged.</li>
<li><b>Tableau</b> (dashboard), <b>Ventes</b> (sales) and <b>Portefeuille</b> (wallet): the real sale V-000001 (265 sats) and the balance.</li>
<li>Avatar → <b>"Changer de profil (démo)"</b> → <b>Moussa · Caissier</b>: the cashier sees the till but not the wallet balance (least privilege).</li>
</ol>

<h2>Run it locally (one command)</h2>
<p><code>git clone https://github.com/makaGit10/SatsPoint.git</code> → <code>cd SatsPoint</code> → <code>docker compose up</code> → open <code>http://localhost:8120</code>. Without configuration it starts in a clearly labelled <b>demo mode</b> with a simulated wallet ("Simuler le paiement" button), seeded data and demo accounts (<code>docker compose logs api | grep -i demo</code>). Set <code>DEMO_NWC_URI</code> in <code>.env</code> to use a real Lightning wallet.</p>

<h2>What is real today — honest status</h2>
<table>
<tr><th>Feature</th><th>Status</th></tr>
<tr><td>Lightning payments on mainnet (NWC, merchant's own wallet)</td><td class="ok">Live — real payment made and verified (V-000001, 265 sats)</td></tr>
<tr><td>Server-side verification before "paid" (<code>lookup_invoice</code>, re-checked every few seconds)</td><td class="ok">Live</td></tr>
<tr><td>Wolof voice recordings (the selling journey: language, welcome, product, till, payment, success)</td><td class="ok">Live — 23 phrases recorded by the team</td></tr>
<tr><td>Serer, Pulaar, Jola recordings</td><td class="test">Languages configured, recordings to do (falls back to French voice)</td></tr>
<tr><td>Languages per country; add a language from the console; built-in recording studio</td><td class="ok">Live (Bambara added for Mali)</td></tr>
<tr><td>Spoken price ("Dire le prix"), product name recorded by voice, pictures</td><td class="ok">Live (speech recognition: browser, French)</td></tr>
<tr><td>Mobile money with automatic confirmation (PayTech: Wave, Orange Money, Free Money)</td><td class="test">Integrated, PayTech <b>test mode</b>; production activation pending with the provider</td></tr>
<tr><td>Owner dashboard live, roles, receipts on WhatsApp, two-factor authentication for the console, audit log</td><td class="ok">Live</td></tr>
</table>

<h2 class="saut">Architecture</h2>
<ul>
<li><b>Backend:</b> Laravel 12 (PHP 8.3) REST API, PostgreSQL, Laravel Reverb WebSockets (signals carry no data; screens reload through the API and its access controls).</li>
<li><b>Frontend:</b> React 19 + TypeScript + Vite PWA, mobile-first, ~170 KB gzip for the till's first screen, voices cached offline.</li>
<li><b>Lightning gateway:</b> Node + <code>@getalby/sdk</code>, Nostr Wallet Connect (NIP-47): <code>make_invoice</code>, <code>lookup_invoice</code>, <code>get_balance</code>, <code>list_transactions</code>; internal network only, HMAC-authenticated.</li>
<li><b>Voice:</b> 523 voice keys generated from the code (no button can stay silent), browser studio with burst mode, ffmpeg cleaning (silences, noise, loudness).</li>
<li><b>Tests:</b> 428 backend (Pest), 248 frontend (Vitest), Playwright end-to-end journeys on the real stack.</li>
</ul>

<h2>Security by design</h2>
<ul>
<li>Non-custodial: funds stay in the merchant's wallet; limited, revocable permissions.</li>
<li>NWC and PayTech secrets encrypted at rest with a dedicated key, never sent to the browser.</li>
<li>"Paid" is decided server-side only, after re-verifying the invoice (amount and payment hash).</li>
<li>Least privilege: cashiers cannot see the balance; the platform admin never sees merchants' money.</li>
<li>Two-factor authentication for the platform console, audit log of sensitive actions, strict validation and rate limits. Threat model: <code>docs/THREAT_MODEL.md</code>.</li>
</ul>

<h2 class="saut">Proof of the real payment</h2>
<img class="g" src="${img('04-vrai-paiement.png')}">
<img class="g" src="${img('02-langues-par-pays.png')}">
`

const h = resolve(OUT, 'guide.html')
writeFileSync(h, html)
const b = await chromium.launch()
const p = await b.newPage()
await p.goto(pathToFileURL(h).href)
await p.evaluate(() => document.fonts.ready)
await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
await p.pdf({ path: resolve(OUT, 'SatsPoint-Judges-Guide.pdf'), format: 'A4', printBackground: true })
await b.close()

// ZIP : guide + vidéos.
const dossier = resolve(OUT, 'SatsPoint-submission'); mkdirSync(dossier, { recursive: true })
copyFileSync(resolve(OUT, 'SatsPoint-Judges-Guide.pdf'), resolve(dossier, 'SatsPoint-Judges-Guide.pdf'))
copyFileSync(resolve(RACINE, 'docs/videos/SatsPoint-EN.mp4'), resolve(dossier, 'SatsPoint-demo-EN.mp4'))
copyFileSync(resolve(RACINE, 'docs/videos/SatsPoint-FR.mp4'), resolve(dossier, 'SatsPoint-demo-FR.mp4'))
execFileSync('python', ['-I', '-c', `import shutil; shutil.make_archive(r'${resolve(OUT, 'SatsPoint-submission')}', 'zip', r'${dossier}')`])
console.log('PDF et ZIP →', OUT)
