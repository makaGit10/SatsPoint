// Vérification visuelle : lance Vite en mode mock (port 5190), capture les écrans clés et leurs états
// en 390×844 et 1366×768, clair et sombre, FR et EN, et vérifie l'absence d'erreur console / requête en échec / clé i18n brute.
// Usage : node scripts/captures.mjs [--dossier C:\SatsPoint\captures\vague2] [--garder-serveur] [--seulement 03,07] [--vues mobile] [--themes clair] [--locales fr]
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (nom) => {
  const i = args.indexOf(nom)
  return i >= 0 ? args[i + 1] : undefined
}
const dossier = option('--dossier') ?? resolve(racine, '..', 'captures', 'vague2')
const seulement = option('--seulement')?.split(',')
const PORT = 5190
const URL_BASE = `http://127.0.0.1:${PORT}`

const VUES = [
  { nom: 'mobile', largeur: 390, hauteur: 844, mobile: true },
  { nom: 'bureau', largeur: 1366, hauteur: 768, mobile: false },
].filter((v) => !option('--vues') || option('--vues').split(',').includes(v.nom))
const THEMES = ['clair', 'sombre'].filter((t) => !option('--themes') || option('--themes').split(',').includes(t))
const LOCALES = ['fr', 'en'].filter((l) => !option('--locales') || option('--locales').split(',').includes(l))

const PROPRIO = 'proprio@demo.test'
const CAISSIER = 'caissier@demo.test'

/** Tape 15 000 sur le pavé. */
const taper15000 = async (page) => {
  for (const touche of ['1', '5', '000']) await page.getByRole('button', { name: new RegExp(`^(Touche|Key) ${touche}$`) }).click()
  await page.waitForFunction(() => /15\s000/.test(document.querySelector('[data-ecran="caisse"]')?.textContent ?? ''))
}

/**
 * Écrans : chemin, sélecteur d'attente, état (langue choisie, session mock, sessionStorage supplémentaire), action.
 * Les identifiants `01PDEMO…` sont des tentatives stables du mock (Lightning, PayTech, Wave direct, expirée, payée).
 */
const ECRANS = [
  { nom: '01-langue', chemin: '/langue', attendre: '[data-ecran="langue"] [data-haut-parleur="langue.wo"]', langueChoisie: false, bandeau: false },
  { nom: '02-accueil', chemin: '/accueil', attendre: '[data-ecran="accueil"]' },
  { nom: '03-connexion', chemin: '/connexion', attendre: '[data-ecran="connexion"]' },
  { nom: '04-caisse-vide', chemin: '/caisse', attendre: '[data-ecran="caisse"] [data-pave]', session: PROPRIO },
  { nom: '05-caisse-montant', chemin: '/caisse', attendre: '[data-ecran="caisse"] [data-pave]', session: PROPRIO, action: taper15000 },
  {
    nom: '06-caisse-choix-methode',
    chemin: '/caisse',
    attendre: '[data-ecran="caisse"] [data-pave]',
    session: PROPRIO,
    action: async (page) => {
      await taper15000(page)
      await page.getByRole('button', { name: /^(Encaisser|Charge)/ }).click()
      await page.waitForSelector('[role="dialog"] ul')
    },
  },
  { nom: '07-caisse-cours-indisponible', chemin: '/caisse', attendre: '[data-ecran="caisse"] [data-pave]', session: PROPRIO, stockage: { 'satspoint.mock.cours': 'indisponible' }, action: taper15000 },
  { nom: '08-caisse-caissier', chemin: '/caisse', attendre: '[data-ecran="caisse"] [data-pave]', session: CAISSIER, uniquement: ['mobile'] },
  { nom: '09-paiement-lightning', chemin: '/caisse/paiement/01PDEMOLIGHTNING00000000001', attendre: '[data-ecran="paiement"] [data-qr="pret"]', session: PROPRIO },
  { nom: '10-paiement-mobile-money', chemin: '/caisse/paiement/01PDEMOPAYTECH0000000000001', attendre: '[data-ecran="paiement"] [data-qr="pret"]', session: CAISSIER },
  { nom: '11-paiement-wave-direct', chemin: '/caisse/paiement/01PDEMOWAVE0000000000000001', attendre: '[data-ecran="paiement"] [data-qr="pret"]', session: PROPRIO },
  { nom: '12-paiement-expire', chemin: '/caisse/paiement/01PDEMOEXPIRE00000000000001', attendre: '[data-ecran="paiement"][data-etat="expire"]', session: PROPRIO },
  { nom: '13-succes', chemin: '/caisse/paiement/01PDEMOPAYEE000000000000001', attendre: '[data-ecran="succes"]', session: PROPRIO, bandeau: false },
  { nom: '14-ventes', chemin: '/ventes', attendre: '[data-ecran="ventes"] li', session: PROPRIO },
  {
    nom: '15-ventes-filtres-detail',
    chemin: '/ventes',
    attendre: '[data-ecran="ventes"] li',
    session: PROPRIO,
    action: async (page) => {
      await page.getByRole('button', { name: /^(Filtrer|Filter)$/ }).click()
      await page.locator('[data-ecran="ventes"] li button').first().click()
      await page.waitForSelector('[role="dialog"] dl, [role="dialog"] ul')
    },
  },
  { nom: '16-ventes-caissier', chemin: '/ventes', attendre: '[data-ecran="ventes"] li', session: CAISSIER, uniquement: ['mobile'] },
  {
    nom: '17-tableau-de-bord',
    chemin: '/tableau-de-bord',
    attendre: '[data-ecran="tableau-de-bord"]',
    session: PROPRIO,
    action: async (page) => {
      await page.getByRole('radio', { name: /^(7 jours|7 days)$/ }).click()
      await page.waitForSelector('[data-ecran="tableau-de-bord"] svg[aria-label] path')
    },
  },
  { nom: '18-tableau-caissier', chemin: '/tableau-de-bord', attendre: '[data-ecran="tableau-de-bord"]', session: CAISSIER, uniquement: ['mobile'] },
  { nom: '19-portefeuille', chemin: '/portefeuille', attendre: '[data-ecran="portefeuille"]', session: PROPRIO },
  {
    nom: '20-portefeuille-envoyer-apercu',
    chemin: '/portefeuille',
    attendre: '[data-ecran="portefeuille"]',
    session: PROPRIO,
    action: async (page) => {
      await page.getByRole('button', { name: /^(Envoyer|Send)/ }).click()
      await page.getByLabel(/Facture ou adresse Lightning|Lightning invoice or address/).fill('lnbc250000n1pdemoqrstuvwxyz0123456789abcdef')
      await page.getByRole('button', { name: /^(Aperçu|Preview)/ }).click()
      await page.waitForSelector('[role="dialog"] dl')
    },
  },
  { nom: '21-portefeuille-non-connecte', chemin: '/portefeuille', attendre: '[data-ecran="portefeuille"]', session: PROPRIO, stockage: { 'satspoint.mock.wallet': 'deconnecte' }, uniquement: ['mobile'] },
  { nom: '22-reglages', chemin: '/reglages', attendre: '[data-ecran="reglages"] form', session: PROPRIO },
  { nom: '23-demarrage-nouveau', chemin: '/demarrage', attendre: '[data-ecran="demarrage"] form', session: 'nouveau@demo.test' },
  { nom: '24-demarrage-en-cours', chemin: '/demarrage', attendre: '[data-ecran="demarrage"]', session: PROPRIO, stockage: { 'satspoint.mock.wallet': 'deconnecte' } },
  { nom: '25-equipe', chemin: '/equipe', attendre: '[data-ecran="equipe"] li', session: PROPRIO },
  { nom: '26-articles', chemin: '/articles', attendre: '[data-ecran="articles"] li', session: PROPRIO },
  { nom: '27-recu', chemin: '/r/demo', attendre: '[data-ecran="recu"] dl', bandeau: false },
  { nom: '28-introuvable', chemin: '/une/page/qui/n/existe/pas', attendre: '[data-ecran="introuvable"]', bandeau: false, uniquement: ['mobile'] },
  {
    nom: '29-plus-feuille',
    chemin: '/caisse',
    attendre: '[data-ecran="caisse"]',
    session: PROPRIO,
    uniquement: ['mobile'],
    action: async (page) => {
      await page.getByRole('button', { name: /^(Plus|More)$/ }).click()
      await page.waitForSelector('[role="dialog"] [role="radiogroup"]')
    },
  },
  { nom: '30-admin', chemin: '/admin', attendre: '[data-ecran="admin"]', session: 'super@demo.test', uniquement: ['bureau'] },
].filter((e) => !seulement || seulement.some((s) => e.nom.startsWith(s)))

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

const NAMESPACES = 'nav|commun|auth|caisse|ventes|paiement|succes|recu|tableau|portefeuille|reglages|equipe|articles|demarrage|erreurs|methodes|operateurs|periodes|statuts|statutsPaiement|temps|roles'

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
            stockage: ecran.stockage ?? {},
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
            for (const [cle, valeur] of Object.entries(e.stockage)) sessionStorage.setItem(cle, valeur)
          }, etat)

          const page = await contexte.newPage()
          const erreurs = []
          page.on('console', (m) => {
            if (m.type() === 'error') erreurs.push(`console.error: ${m.text()}`)
          })
          page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`))
          page.on('requestfailed', (r) => erreurs.push(`requête échouée: ${r.url()} (${r.failure()?.errorText})`))
          page.on('response', (r) => {
            if (r.status() >= 400 && !r.url().includes('/@vite')) erreurs.push(`HTTP ${r.status()}: ${r.url()}`)
          })

          const fichier = `${ecran.nom}-${vue.nom}-${theme}-${locale}.png`
          try {
            await page.goto(`${URL_BASE}${ecran.chemin}`, { waitUntil: 'load' })
            await page.waitForSelector(ecran.attendre, { timeout: 20_000 })
            await page.evaluate(() => document.fonts.ready)
            if (ecran.bandeau !== false) await page.waitForSelector('[data-bandeau="demo"]', { timeout: 10_000 })
            await page.waitForFunction(() => !document.querySelector('[data-chargement]'), null, { timeout: 10_000 })
            if (ecran.action) await ecran.action(page)
            await page.waitForFunction(() => !document.querySelector('[data-chargement]'), null, { timeout: 10_000 })
            await page.waitForTimeout(150)
            await page.screenshot({ path: resolve(dossier, fichier), fullPage: false })
            nombre += 1
            const texte = await page.evaluate(() => document.body.innerText)
            if (new RegExp(`(^|[\\s(])(${NAMESPACES})\\.[a-z][a-zA-Z]+(\\.[a-zA-Z]+)*([\\s)]|$)`).test(texte)) {
              erreurs.push(`clé i18n brute visible dans ${fichier}`)
            }
          } catch (e) {
            erreurs.push(`échec capture: ${e.message.split('\n').slice(0, 6).join(' / ')}`)
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
