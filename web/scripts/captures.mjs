// Vérification visuelle du socle : lance Vite en mode mock (port 5190), capture les écrans clés
// en 390×844 et 1366×768, clair et sombre, FR et EN, et vérifie l'absence d'erreur console.
// Usage : node scripts/captures.mjs [--dossier C:\SatsPoint\captures\socle] [--garder-serveur]
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const indexDossier = args.indexOf('--dossier')
const dossier = indexDossier >= 0 ? args[indexDossier + 1] : resolve(racine, '..', 'captures', 'socle')
const PORT = 5190
const URL_BASE = `http://127.0.0.1:${PORT}`

const VUES = [
  { nom: 'mobile', largeur: 390, hauteur: 844, mobile: true },
  { nom: 'bureau', largeur: 1366, hauteur: 768, mobile: false },
]
const THEMES = ['clair', 'sombre']
const LOCALES = ['fr', 'en']

/** Écrans : chemin, sélecteur d'attente, état (langue choisie, session mock). */
const ECRANS = [
  { nom: '01-langue', chemin: '/langue', attendre: '[data-ecran="langue"] [data-haut-parleur="langue.wo"]', langueChoisie: false, bandeau: false },
  { nom: '02-accueil', chemin: '/accueil', attendre: '[data-ecran="accueil"]' },
  { nom: '03-connexion', chemin: '/connexion', attendre: '[data-ecran="connexion"]' },
  { nom: '04-caisse-proprietaire', chemin: '/caisse', attendre: '[data-ecran="caisse"]', session: 'proprio@demo.test' },
  { nom: '05-ventes-vide', chemin: '/ventes', attendre: '[data-ecran="ventes"]', session: 'proprio@demo.test' },
  { nom: '06-introuvable', chemin: '/une/page/qui/n/existe/pas', attendre: '[data-ecran="introuvable"]', bandeau: false },
  // Interactions (sous-ensemble de vues) : feuille « Plus », recherche Ctrl+K, fenêtre « Mon compte ».
  {
    nom: '07-plus-feuille',
    chemin: '/caisse',
    attendre: '[data-ecran="caisse"]',
    session: 'proprio@demo.test',
    uniquement: ['mobile'],
    action: async (page) => {
      await page.getByRole('button', { name: /^(Plus|More)$/ }).click()
      await page.waitForSelector('[role="dialog"] [role="radiogroup"]')
    },
  },
  {
    nom: '08-recherche',
    chemin: '/caisse',
    attendre: '[data-ecran="caisse"]',
    session: 'proprio@demo.test',
    uniquement: ['bureau'],
    action: async (page) => {
      await page.keyboard.press('Control+KeyK')
      await page.waitForSelector('[role="dialog"] input[type="search"]')
    },
  },
  {
    nom: '09-compte',
    chemin: '/ventes',
    attendre: '[data-ecran="ventes"]',
    session: 'proprio@demo.test',
    action: async (page) => {
      await page.getByRole('button', { name: /Mon compte|My account/ }).click()
      await page.waitForSelector('[role="dialog"] [role="radiogroup"]')
    },
  },
  { nom: '10-recu', chemin: '/r/demo', attendre: '[data-ecran="recu"] dl', bandeau: false },
  { nom: '11-demarrage', chemin: '/demarrage', attendre: '[data-ecran="demarrage"]', session: 'nouveau@demo.test' },
  { nom: '12-admin', chemin: '/admin', attendre: '[data-ecran="admin"]', session: 'super@demo.test' },
  // Garde-route : un caissier qui tape /portefeuille est renvoyé à la caisse avec un message.
  {
    nom: '13-caissier-acces-refuse',
    chemin: '/portefeuille',
    attendre: '[data-ecran="caisse"]',
    session: 'caissier@demo.test',
    action: async (page) => {
      await page.waitForSelector('ol li')
    },
  },
]

async function attendreServeur(url, essais = 60) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Serveur injoignable sur ${url}`)
}

async function serveurDejaLance() {
  try {
    const r = await fetch(URL_BASE)
    return r.ok
  } catch {
    return false
  }
}

let serveur = null
if (!(await serveurDejaLance())) {
  serveur = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--mode', 'mock', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: racine,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  serveur.stdout.on('data', () => {})
  serveur.stderr.on('data', (d) => process.stderr.write(d))
  await attendreServeur(URL_BASE)
}

await mkdir(dossier, { recursive: true })
const navigateur = await chromium.launch()
const problemes = []
let nombre = 0

try {
  for (const vue of VUES) {
    for (const theme of THEMES) {
      for (const locale of LOCALES) {
        for (const ecran of ECRANS) {
          if (ecran.uniquement && !ecran.uniquement.includes(vue.nom)) continue
          const contexte = await navigateur.newContext({
            viewport: { width: vue.largeur, height: vue.hauteur },
            deviceScaleFactor: vue.mobile ? 2 : 1,
            isMobile: vue.mobile,
            hasTouch: vue.mobile,
            locale: locale === 'fr' ? 'fr-FR' : 'en-US',
            colorScheme: theme === 'sombre' ? 'dark' : 'light',
            reducedMotion: 'reduce',
          })
          const etat = {
            theme,
            locale,
            langueChoisie: ecran.langueChoisie === false ? null : locale === 'en' ? 'en' : 'wo',
            langueAudio: locale === 'en' ? null : 'wo',
            aideVocale: locale === 'en' ? '0' : '1',
            session: ecran.session ?? null,
          }
          await contexte.addInitScript((e) => {
            localStorage.setItem('satspoint.theme', e.theme)
            localStorage.setItem('satspoint.locale', e.locale)
            if (e.langueChoisie) localStorage.setItem('satspoint.langue-choisie', e.langueChoisie)
            else localStorage.removeItem('satspoint.langue-choisie')
            if (e.langueAudio) localStorage.setItem('satspoint.langue-audio', e.langueAudio)
            else localStorage.removeItem('satspoint.langue-audio')
            localStorage.setItem('satspoint.aide-vocale', e.aideVocale)
            if (e.session) {
              sessionStorage.setItem('satspoint.mock.session', e.session)
              sessionStorage.setItem(
                'satspoint.mock.session.preferences',
                JSON.stringify({ locale: e.locale, theme: e.theme, langue_audio: e.langueAudio, aide_vocale: e.aideVocale === '1' }),
              )
            } else sessionStorage.removeItem('satspoint.mock.session')
          }, etat)

          const page = await contexte.newPage()
          const erreurs = []
          page.on('console', (m) => {
            if (m.type() === 'error') erreurs.push(`console.error: ${m.text()}`)
          })
          page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`))
          page.on('requestfailed', (r) => erreurs.push(`requête échouée: ${r.url()} (${r.failure()?.errorText})`))
          page.on('response', (r) => {
            if (r.status() >= 400 && !r.url().includes('/@vite') ) erreurs.push(`HTTP ${r.status()}: ${r.url()}`)
          })

          const fichier = `${ecran.nom}-${vue.nom}-${theme}-${locale}.png`
          try {
            await page.goto(`${URL_BASE}${ecran.chemin}`, { waitUntil: 'load' })
            await page.waitForSelector(ecran.attendre, { timeout: 15_000 })
            await page.evaluate(() => document.fonts.ready)
            if (ecran.bandeau !== false) await page.waitForSelector('[data-bandeau="demo"]', { timeout: 10_000 })
            await page.waitForFunction(() => !document.querySelector('[data-chargement]'), null, { timeout: 10_000 })
            if (ecran.action) await ecran.action(page)
            await page.waitForFunction(() => !document.querySelector('[data-chargement]'), null, { timeout: 10_000 })
            await page.screenshot({ path: resolve(dossier, fichier), fullPage: false })
            nombre += 1
            const texte = await page.evaluate(() => document.body.innerText)
            if (/\b[a-z]+\.[a-zA-Z]+\.[a-zA-Z]+\b/.test(texte) && /(^|\s)(nav|commun|auth|caisse|ventes)\.[a-z]/i.test(texte)) {
              erreurs.push(`clé i18n brute visible dans ${fichier}`)
            }
          } catch (e) {
            erreurs.push(`échec capture: ${e.message}`)
          }
          if (erreurs.length) problemes.push({ fichier, erreurs })
          await contexte.close()
        }
      }
    }
  }
} finally {
  await navigateur.close()
  if (serveur && !args.includes('--garder-serveur')) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(serveur.pid), '/T', '/F'], { shell: true })
    else serveur.kill('SIGTERM')
  }
}

console.log(`\n${nombre} captures enregistrées dans ${dossier}`)
if (problemes.length) {
  console.log(`\n${problemes.length} capture(s) avec des problèmes :`)
  for (const p of problemes) {
    console.log(`- ${p.fichier}`)
    for (const e of p.erreurs) console.log(`    · ${e}`)
  }
  process.exit(1)
} else {
  console.log('Aucune erreur console, aucune requête en échec, aucune clé i18n brute.')
}
