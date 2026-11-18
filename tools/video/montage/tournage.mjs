// Tournage automatique de la vidéo sur le VRAI site en ligne, dans l'ordre où Awa utilise l'application.
// Capture d'écran continue (CDP screencast), cercle doré à chaque toucher, et journal horodaté :
// quelle phrase de voix off commence quand, quel son de l'application (voix wolof) part à quel toucher.
// Le rythme suit la plus longue des deux voix off (FR / EN) pour que les deux vidéos partagent les images.
// Usage : node tools/video/montage/tournage.mjs   → tools/video/out/tournage/{scenes.json, <scène>/*.jpg}
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../../..')
const VIDEO = resolve(RACINE, 'tools/video')
const require = createRequire(resolve(RACINE, 'web/package.json'))
const { chromium } = require('playwright')
const BASE = 'https://satspoint.onrender.com'
const SORTIE = resolve(VIDEO, 'out/tournage')
const PAIEMENT_REEL = '01M7QN9036GV4M8XKJF9FV765X'
const env = Object.fromEntries(readFileSync(resolve(RACINE, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const FF = execFileSync('python', ['-I', '-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim()

// Durées : voix off (max FR / EN) et sons de l'application.
const duree = {}
for (const d of ['voix', 'voix-en']) for (const e of JSON.parse(readFileSync(resolve(VIDEO, d, 'timeline.json'), 'utf8'))) duree[e.numero] = Math.max(duree[e.numero] ?? 0, e.duree_s)
function dureeFichier(f) {
  try { execFileSync(FF, ['-hide_banner', '-i', f], { stdio: 'pipe' }) } catch (e) {
    const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/)
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  throw new Error('durée inconnue : ' + f)
}
const SON = (cle) => resolve(VIDEO, 'sons-wo', `${cle}.mp3`)
const NOM_CAFE = resolve(VIDEO, 'sons-wo', 'article.cafe-touba.mp3')

const pause = (s) => new Promise((r) => setTimeout(r, s * 1000))
const maintenant = () => Date.now() / 1000
// `node tournage.mjs article` : refilme seulement la scène « article » (les autres scènes sont gardées).
const SEULE = process.argv[2] ?? null
if (!SEULE) { rmSync(SORTIE, { recursive: true, force: true }); mkdirSync(SORTIE, { recursive: true }) }
const scenes = SEULE ? JSON.parse(readFileSync(resolve(SORTIE, 'scenes.json'), 'utf8')).filter((s) => s.nom !== SEULE) : []
const ORDRE = ['langue', 'connexion', 'article', 'caisse', 'vert', 'patron', 'langue-ajout', 'studio', 'mali']

const TOUCHER = () => {
  const style = document.createElement('style')
  style.textContent = '.sp-doigt{position:fixed;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(234,176,46,.38);border:3px solid rgba(217,154,20,.95);pointer-events:none;z-index:2147483647;transition:transform .5s ease-out,opacity .65s ease-out}'
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  window.__doigt = (x, y) => {
    const d = document.createElement('div'); d.className = 'sp-doigt'; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.transform = 'scale(.55)'
    document.documentElement.appendChild(d)
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1)' }))
    return d
  }
  window.__lacher = (d) => { d.style.transform = 'scale(1.45)'; d.style.opacity = '0'; setTimeout(() => d.remove(), 700) }
}

/** Une scène filmée : frames JPEG horodatées + journal d'événements. */
async function scene(page, nom, action) {
  const dossier = resolve(SORTIE, nom); rmSync(dossier, { recursive: true, force: true }); mkdirSync(dossier, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const evenements = []
  let n = 0
  cdp.on('Page.screencastFrame', async (f) => {
    writeFileSync(resolve(dossier, `${String(n++).padStart(5, '0')}_${f.metadata.timestamp.toFixed(4)}.jpg`), Buffer.from(f.data, 'base64'))
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  const demarrer = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 })
  await demarrer()
  await pause(0.6)
  const debut = maintenant()
  const ctx = {
    async dire(num) { evenements.push({ t: maintenant(), type: 'voix', n: num }); await pause(duree[num] + 0.35) },
    direSansAttendre(num) { evenements.push({ t: maintenant(), type: 'voix', n: num }); return pause(duree[num] + 0.35) },
    async son(fichier, apres = 0.45) { evenements.push({ t: maintenant(), type: 'son', fichier }); await pause(dureeFichier(fichier) + apres) },
    async toucher(loc, { son, attendre = 0.6 } = {}) {
      await loc.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {})
      const b = await loc.boundingBox({ timeout: 15000 })
      const x = b.x + b.width / 2, y = b.y + b.height / 2
      const d = await page.evaluateHandle(([x, y]) => window.__doigt(x, y), [x, y])
      await pause(0.45)
      await page.mouse.click(x, y)
      await page.evaluate((d) => window.__lacher(d), d).catch(() => {})
      if (son) evenements.push({ t: maintenant(), type: 'son', fichier: son })
      await pause(attendre)
    },
    async relancer() { await demarrer().catch(() => {}) },
  }
  try { await action(ctx) } finally {
    await pause(0.5)
    const fin = maintenant()
    await cdp.send('Page.stopScreencast').catch(() => {})
    await pause(0.3)
    scenes.push({ nom, dossier, debut, fin, evenements })
    scenes.sort((a, b) => ORDRE.indexOf(a.nom) - ORDRE.indexOf(b.nom))
    writeFileSync(resolve(SORTIE, 'scenes.json'), JSON.stringify(scenes, null, 1))
    console.log(`scène ${nom} : ${(fin - debut).toFixed(1)} s, ${n} images, ${evenements.length} événements`)
  }
}

async function pret(page) {
  await page.waitForFunction(() => { const e = document.querySelector('[data-ecran]'); return e && e.getClientRects().length > 0 && !document.querySelector('[data-chargement]') }, null, { timeout: 60000 }).catch(() => {})
  await pause(1.2)
}

const navigateur = await chromium.launch()
const TEL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: 'light', isMobile: true, hasTouch: true }
const DICTEE = () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: 'deux cents francs' }]] }); this.onend?.() }, 700) } abort() { this.onend?.() } } }

/** Ajouter un produit sans écrire : la question en wolof, le prix dit à voix haute, la correction au pavé. Part de la caisse. */
async function sceneArticle(p) {
  await scene(p, 'article', async (s) => {
    const ligne = s.direSansAttendre(8)
    await s.toucher(p.getByRole('navigation').getByText('Plus', { exact: true }).last(), { attendre: 0.6 })
    const lien = p.getByRole('link', { name: /^Articles/ }).last()
    if (await lien.isVisible().catch(() => false)) await s.toucher(lien, { attendre: 0.4 })
    else await p.goto(`${BASE}/articles`)
    await pret(p)
    await s.toucher(p.getByRole('button', { name: /^Ajouter/ }).first(), { attendre: 0.8 })
    await ligne
    await s.son(SON('guide.formulaireArticle.nom'), 0.4)
    const ligne9 = s.direSansAttendre(9)
    await pause(Math.max(0, duree[9] - 1.4))
    await s.toucher(p.locator('[data-dictee-prix]').first(), { attendre: 0.2 })
    await ligne9
    const ligne10 = s.direSansAttendre(10)
    const dialogue = p.locator('[role="dialog"]:has([data-pave])').last()
    await pause(1.0)
    await s.toucher(dialogue.getByRole('button', { name: /^Effacer/ }).first(), { attendre: 0.7 })
    await s.toucher(dialogue.getByRole('button', { name: 'Touche 0', exact: true }).first(), { attendre: 0.6 })
    await ligne10
    await s.toucher(dialogue.getByRole('button', { name: 'Annuler', exact: true }).first(), { attendre: 0.5 }).catch(() => p.keyboard.press('Escape'))
  })
}

if (SEULE === 'article') {
  const c = await navigateur.newContext(TEL)
  await c.addInitScript(TOUCHER); await c.addInitScript(DICTEE)
  await c.addInitScript(() => { try { localStorage.setItem('satspoint.langue-choisie', 'wo') } catch {} })
  const p = await c.newPage()
  await p.goto(`${BASE}/connexion`); await p.waitForSelector('input[name="identifiant"]', { timeout: 90000 })
  await p.fill('input[name="identifiant"]', 'demo@satspoint.local'); await p.fill('input[type="password"]', env.DEMO_PASSWORD); await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.startsWith('/connexion'), { timeout: 60000 })
  await p.goto(`${BASE}/caisse`); await p.waitForSelector('[data-bande-articles] li button', { timeout: 60000 }); await pause(1.5)
  await sceneArticle(p)
  await navigateur.close()
  console.log('scène article refilmée')
  process.exit(0)
}

// Réveil du site avant de filmer.
await fetch(`${BASE}/up`).catch(() => {})

// ---------- Téléphone d'Awa : première ouverture → connexion → article → caisse → paiement → patron ----------
{
  const c = await navigateur.newContext(TEL)
  await c.addInitScript(TOUCHER)
  // Prix dit à voix haute : la phrase « deux cents francs » est injectée à la place du micro (la reconnaissance du prix est réelle).
  await c.addInitScript(() => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: 'deux cents francs' }]] }); this.onend?.() }, 700) } abort() { this.onend?.() } } })
  const p = await c.newPage()
  await p.goto(`${BASE}/`); await p.waitForSelector('[data-premiere-visite]', { timeout: 90000 }); await pause(1.5)

  await scene(p, 'langue', async (s) => {
    await s.dire(4)
    await s.toucher(p.locator('[data-premiere-visite] [data-haut-parleur="langue.wo"]').first(), { son: SON('langue.wo'), attendre: dureeFichier(SON('langue.wo')) + 0.5 })
    const ligne = s.direSansAttendre(5)
    await pause(0.8)
    const choix = p.locator('[data-premiere-visite] [data-choix-pays] select')
    await s.toucher(choix, { attendre: 0.2 }); await choix.selectOption('ML'); await pause(2.2)
    await s.toucher(choix, { attendre: 0.2 }); await choix.selectOption('SN')
    await ligne
    await s.dire(6)
    await s.toucher(p.locator('[data-premiere-visite] [data-langue="wo"]').first(), { attendre: 0.3 })
    await s.son(SON('landing.voix.bienvenue'), 0.6)
  })

  await scene(p, 'connexion', async (s) => {
    const ligne = s.direSansAttendre(7)
    await s.toucher(p.getByRole('link', { name: /déjà un compte/i }).or(p.getByRole('button', { name: /déjà un compte/i })).first(), { attendre: 0.2 })
    await p.waitForSelector('input[name="identifiant"]', { timeout: 60000 })
    await s.relancer()
    await s.toucher(p.locator('input[name="identifiant"]'), { attendre: 0.1 })
    await p.keyboard.type('demo@satspoint.local', { delay: 35 })
    await s.toucher(p.locator('input[type="password"]'), { attendre: 0.1 })
    await p.keyboard.type(env.DEMO_PASSWORD, { delay: 25 })
    await s.toucher(p.locator('button[type="submit"]'), { attendre: 0.2 })
    await p.waitForURL((u) => !u.pathname.startsWith('/connexion'), { timeout: 60000 })
    await s.relancer()
    await p.waitForSelector('[data-bande-articles] li button', { timeout: 60000 }); await pause(1)
    await ligne
  })

  await sceneArticle(p)

  await scene(p, 'caisse', async (s) => {
    await s.toucher(p.getByRole('navigation').getByText('Caisse', { exact: true }).last(), { attendre: 0.4 })
    await p.waitForSelector('[data-bande-articles] li button', { timeout: 60000 }); await pause(0.6)
    await s.dire(11)
    await s.toucher(p.locator('[data-bande-articles] li button').first(), { son: NOM_CAFE, attendre: dureeFichier(NOM_CAFE) + 0.6 })
    await s.toucher(p.locator('[data-haut-parleur="caisse.encaisser"]').first(), { son: SON('caisse.encaisser'), attendre: dureeFichier(SON('caisse.encaisser')) + 0.5 })
    const ligne12 = s.direSansAttendre(12)
    await s.toucher(p.getByRole('button', { name: /^Encaisser/ }).first(), { attendre: 0.3 })
    await p.waitForURL(/\/caisse\/paiement\//, { timeout: 60000 })
    await s.relancer()
    await ligne12
    await pause(0.8)
  })
  // Hors champ : la vente de démonstration n'est pas laissée en attente.
  try {
    await p.getByRole('button', { name: 'Annuler la vente' }).first().click({ timeout: 15000 })
    await p.getByRole('dialog').getByRole('button', { name: 'Annuler la vente' }).click({ timeout: 15000 })
    await pause(1.5)
    console.log('vente de démonstration annulée')
  } catch (e) { console.log('annulation de la vente : à vérifier', e.message) }

  await p.goto(`${BASE}/caisse/paiement/${PAIEMENT_REEL}`); await pret(p); await pause(1)
  await scene(p, 'vert', async (s) => {
    await s.dire(14)
    await s.son(SON('paiement.recu'), 0.5)
    await s.dire(15)
  })

  await p.goto(`${BASE}/tableau-de-bord`); await pret(p)
  await scene(p, 'patron', async (s) => {
    await s.dire(17)
    await s.toucher(p.getByRole('navigation').getByText('Portefeuille', { exact: true }).last(), { attendre: 0.3 })
    await s.relancer()
    await pret(p)
    await s.dire(18)
  })
  await c.close()
}

// ---------- Console (ordinateur) : ajouter une langue, studio ----------
{
  const c = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', colorScheme: 'light' })
  await c.addInitScript(TOUCHER)
  await c.addInitScript(() => { try { localStorage.setItem('satspoint.langue-choisie', 'wo') } catch {} })
  const p = await c.newPage()
  // Connexion hors champ (l'e-mail du super-admin n'apparaît jamais).
  await p.goto(`${BASE}/connexion`); await p.waitForSelector('input[name="identifiant"]', { timeout: 90000 })
  await p.fill('input[name="identifiant"]', env.SUPERADMIN_EMAIL); await p.fill('input[type="password"]', env.SUPERADMIN_PASSWORD); await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.startsWith('/connexion'), { timeout: 60000 })
  await p.goto(`${BASE}/admin?onglet=langues`); await pret(p)
  const existe = await p.getByText('Bamanankan').first().isVisible().catch(() => false)
  if (existe) console.log('ATTENTION : le bambara existe déjà, la scène montrera la liste')

  await scene(p, 'langue-ajout', async (s) => {
    const ligne = s.direSansAttendre(19)
    if (!existe) {
      await s.toucher(p.getByRole('button', { name: /Ajouter une langue/ }).first(), { attendre: 0.6 })
      const d = p.getByRole('dialog').last()
      await s.toucher(d.getByLabel('Code'), { attendre: 0.1 }); await p.keyboard.type('bm', { delay: 60 })
      await s.toucher(d.getByLabel('Nom dans la langue'), { attendre: 0.1 }); await p.keyboard.type('Bamanankan', { delay: 35 })
      await s.toucher(d.getByLabel('Nom en français'), { attendre: 0.1 }); await p.keyboard.type('Bambara', { delay: 35 })
      await s.toucher(d.getByLabel('Nom en anglais'), { attendre: 0.1 }); await p.keyboard.type('Bambara', { delay: 35 })
      await s.toucher(d.getByRole('button', { name: 'Mali', exact: true }).or(d.getByText('Mali', { exact: true })).first(), { attendre: 0.4 })
      await s.toucher(d.getByRole('button', { name: /^Enregistrer/ }).first(), { attendre: 0.4 })
      await p.getByText('Bamanankan').first().waitFor({ timeout: 30000 })
    }
    await ligne
    await pause(0.6)
  })

  await scene(p, 'studio', async (s) => {
    await s.toucher(p.getByRole('link', { name: /Studio audio/ }).first(), { attendre: 0.3 })
    await s.relancer()
    await pret(p)
    await pause(0.8)
    await s.dire(20)
  })
  await c.close()
}

// ---------- Nouveau téléphone au Mali : la nouvelle langue est proposée ----------
{
  const c = await navigateur.newContext(TEL)
  await c.addInitScript(TOUCHER)
  const p = await c.newPage()
  await p.goto(`${BASE}/`); await p.waitForSelector('[data-premiere-visite]', { timeout: 90000 }); await pause(1.5)
  await scene(p, 'mali', async (s) => {
    const ligne = s.direSansAttendre(21)
    await pause(0.6)
    const choix = p.locator('[data-premiere-visite] [data-choix-pays] select')
    await s.toucher(choix, { attendre: 0.2 }); await choix.selectOption('ML')
    await ligne
    await pause(0.4)
  })
  await c.close()
}
await navigateur.close()
console.log('tournage terminé →', SORTIE)
