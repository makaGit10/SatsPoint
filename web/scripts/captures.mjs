// Vérification visuelle : lance Vite en mode mock (port 5190), capture les écrans clés et leurs états
// en 390×844 et 1366×768, clair et sombre, FR et EN, et vérifie l'absence d'erreur console / requête en échec / clé i18n brute.
// Usage : node scripts/captures.mjs [--dossier C:\SatsPoint\captures\vague3] [--garder-serveur] [--seulement 03,07] [--vues mobile] [--themes clair] [--locales fr]
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
const dossier = option('--dossier') ?? resolve(racine, '..', 'captures', 'vague3')
const seulement = option('--seulement')?.split(',')
const PORT = 5190
const URL_BASE = `http://127.0.0.1:${PORT}`

const VUES = [
  { nom: 'mobile', largeur: 390, hauteur: 844, mobile: true },
  { nom: 'bureau', largeur: 1366, hauteur: 768, mobile: false },
  // Grand écran : seulement pour les écrans qui le demandent (`uniquement: ['large']`).
  { nom: 'large', largeur: 1920, hauteur: 880, mobile: false, seulementSiDemande: true },
].filter((v) => !option('--vues') || option('--vues').split(',').includes(v.nom))
const THEMES = ['clair', 'sombre'].filter((t) => !option('--themes') || option('--themes').split(',').includes(t))
const LOCALES = ['fr', 'en'].filter((l) => !option('--locales') || option('--locales').split(',').includes(l))

const PROPRIO = 'proprio@demo.test'
const CAISSIER = 'caissier@demo.test'
const SUPER = 'super@demo.test'
/** Super-admin avec double authentification validée (console, studio). */
const ADMIN_VALIDE = { 'satspoint.mock.2fa': 'validee' }

/** Fichier CSV d'articles (séparateur « ; », en-têtes à reconnaître, 2 lignes en erreur). */
const CSV_ARTICLES = [
  'Désignation;PU;Famille;Réf.;Stock',
  'Bazin riche 3 m;15 000;Tissus;BZ-003;12',
  'Wax hollandais;9500;Tissus;WX-001;30',
  'Thé Ataya (paquet);1200;Épicerie;TH-01;80',
  'Sucre (kg);750;Épicerie;SU-01;40',
  'Café Touba (sachet);gratuit;Épicerie;CT-01;25',
  'Savon Kessé;300;Hygiène;SK-01;60',
  ';500;Divers;DV-01;10',
  'Eau Kirène 1,5 L;400;Boissons;EK-15;48',
  'Lait caillé;600;Frais;LC-01;20',
  'Pain (baguette);150;Boulangerie;PB-01;100',
  'Huile (1 L);1500;Épicerie;HU-01;30',
  'Riz brisé (kg);450;Épicerie;RB-01;200',
].join('\n')

/** Ouvre le panneau d'enregistrement (feuille sur mobile) et lance le micro (périphérique simulé de Chromium). */
const lancerEnregistrement = async (page) => {
  const mobile = (page.viewportSize()?.width ?? 1366) < 768
  if (mobile) {
    await page.locator('[data-matrice] button[data-statut="manquant"]').first().click()
    await page.waitForSelector('[role="dialog"] [data-panneau]')
  }
  await page.locator('[data-panneau] [data-action="enregistrer"]').click()
  await page.waitForSelector('[data-panneau][data-phase="enregistrement"]', { timeout: 15_000 })
  await page.waitForTimeout(1600)
}

const ouvrirImport = async (page) => {
  await page.getByRole('button', { name: /^(Importer|Import)/ }).first().click()
  await page.waitForSelector('[data-depot-import]')
  await page.locator('[data-depot-import] input[type="file"]').setInputFiles({ name: 'catalogue.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_ARTICLES, 'utf8') })
  await page.waitForSelector('[data-correspondance]')
}

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
  { nom: '00-landing', chemin: '/', attendre: '[data-ecran="landing"]', langueChoisie: false, bandeau: false },
  { nom: '01-langue', chemin: '/langue', attendre: '[data-ecran="langue"] [data-haut-parleur="langue.wo"]', langueChoisie: false, bandeau: false },
  { nom: '02-accueil', chemin: '/accueil', attendre: '[data-ecran="accueil"]' },
  { nom: '03-connexion', chemin: '/connexion', attendre: '[data-ecran="connexion"]' },
  { nom: '30-inscription', chemin: '/inscription', attendre: '[data-ecran="inscription"] form' },
  {
    nom: '30b-inscription-saisie',
    chemin: '/inscription',
    attendre: '[data-ecran="inscription"] form',
    action: async (page) => {
      await page.getByLabel(/^(Votre nom|Your name)$/).fill('Awa Ndiaye')
      await page.getByLabel(/^(Téléphone ou e-mail|Phone or email)$/).pressSequentially('771234567')
      await page.getByLabel(/^(Mot de passe|Password)$/).fill('thiebou-dieune-2026')
      await page.waitForSelector('[data-force="3"]')
    },
  },
  {
    nom: '30c-inscription-erreurs',
    chemin: '/inscription',
    attendre: '[data-ecran="inscription"] form',
    action: async (page) => {
      await page.getByLabel(/^(Téléphone ou e-mail|Phone or email)$/).fill('77 12')
      await page.getByLabel(/^(Mot de passe|Password)$/).fill('court')
      await page.getByRole('button', { name: /^(Créer mon compte|Create my account)/ }).click()
      await page.waitForSelector('[data-ecran="inscription"] [role="alert"]')
    },
  },
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
  { nom: '05b-caisse-montant', chemin: '/caisse', attendre: '[data-ecran="caisse"] [data-pave]', session: PROPRIO, action: taper15000, uniquement: ['large'] },
  {
    nom: '06b-caisse-aucun-moyen',
    chemin: '/caisse',
    attendre: '[data-ecran="caisse"] [data-bandeau="aucun-moyen"]',
    session: PROPRIO,
    stockage: { 'satspoint.mock.moyens': 'aucun' },
    action: taper15000,
    uniquement: ['mobile', 'bureau', 'large'],
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
  { nom: '15b-ventes-page-2', chemin: '/ventes?page=2', attendre: '[data-ecran="ventes"] nav[data-pagination]', session: PROPRIO },
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
  { nom: '26b-articles-page-2', chemin: '/articles?page=2', attendre: '[data-ecran="articles"] nav[data-pagination]', session: PROPRIO, uniquement: ['mobile'] },
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
  // ----- Vague 3 -----
  { nom: '31-studio-matrice', chemin: '/admin/studio', attendre: '[data-ecran="studio"] [data-matrice]', session: SUPER, stockage: ADMIN_VALIDE },
  { nom: '32-studio-enregistrement', chemin: '/admin/studio', attendre: '[data-ecran="studio"] [data-matrice]', session: SUPER, stockage: ADMIN_VALIDE, action: lancerEnregistrement },
  {
    nom: '33-studio-prise-prete',
    chemin: '/admin/studio',
    attendre: '[data-ecran="studio"] [data-matrice]',
    session: SUPER,
    stockage: ADMIN_VALIDE,
    action: async (page) => {
      await lancerEnregistrement(page)
      await page.locator('[data-panneau] [data-action="arreter"]').click()
      await page.waitForSelector('[data-panneau][data-phase="pret"]')
    },
  },
  { nom: '34-console-ensemble', chemin: '/admin', attendre: '[data-ecran="admin"] [data-vue="ensemble"]', session: SUPER, stockage: ADMIN_VALIDE },
  { nom: '35-console-boutiques', chemin: '/admin?onglet=boutiques', attendre: '[data-vue="boutiques"] li', session: SUPER, stockage: ADMIN_VALIDE },
  { nom: '35b-console-journal-page-2', chemin: '/admin?onglet=journal&page=2', attendre: '[data-vue="journal"] nav[data-pagination]', session: SUPER, stockage: ADMIN_VALIDE, uniquement: ['bureau'] },
  { nom: '36-console-sante', chemin: '/admin?onglet=sante', attendre: '[data-vue="sante"] li', session: SUPER, stockage: ADMIN_VALIDE },
  { nom: '37-console-journal', chemin: '/admin?onglet=journal', attendre: '[data-vue="journal"] li', session: SUPER, stockage: ADMIN_VALIDE },
  {
    nom: '38-console-suspendre',
    chemin: '/admin?onglet=boutiques',
    attendre: '[data-vue="boutiques"] li',
    session: SUPER,
    stockage: ADMIN_VALIDE,
    uniquement: ['bureau'],
    action: async (page) => {
      await page.getByRole('button', { name: /^(Suspendre la boutique|Suspend the shop)$/ }).nth(1).click()
      await page.waitForSelector('[role="dialog"]')
    },
  },
  { nom: '39-2fa-activation', chemin: '/securite/2fa', attendre: '[data-ecran="securite-2fa"] [data-qr="pret"]', session: SUPER, stockage: { 'satspoint.mock.2fa': 'inactive' } },
  {
    nom: '40-2fa-codes-secours',
    chemin: '/securite/2fa',
    attendre: '[data-ecran="securite-2fa"] [data-qr="pret"]',
    session: SUPER,
    stockage: { 'satspoint.mock.2fa': 'inactive' },
    action: async (page) => {
      await page.locator('[data-ecran="securite-2fa"] input[autocomplete="one-time-code"]').fill('123456')
      await page.waitForSelector('[data-codes-secours]')
    },
  },
  { nom: '41-2fa-verification', chemin: '/verification-2fa', attendre: '[data-ecran="verification-2fa"] input', session: SUPER },
  { nom: '42-2fa-active', chemin: '/securite/2fa', attendre: '[data-deux-fa="active"]', session: SUPER, stockage: ADMIN_VALIDE, uniquement: ['mobile'] },
  {
    nom: '43-recherche-recentes',
    chemin: '/caisse',
    attendre: '[data-ecran="caisse"] [data-pave]',
    session: PROPRIO,
    action: async (page) => {
      await page.keyboard.press('Control+k')
      await page.waitForSelector('[data-recherche] [data-recente]')
    },
  },
  {
    nom: '44-recherche-resultats',
    chemin: '/ventes',
    attendre: '[data-ecran="ventes"] li',
    session: PROPRIO,
    action: async (page) => {
      await page.keyboard.press('Control+k')
      await page.waitForSelector('[data-recherche] [data-recente]')
      await page.keyboard.type('baz')
      await page.waitForSelector('[data-recherche] [data-rubrique="articles"] [data-resultat]')
      await page.keyboard.press('ArrowDown')
    },
  },
  { nom: '45-import-correspondance', chemin: '/articles', attendre: '[data-ecran="articles"] li', session: PROPRIO, action: ouvrirImport },
  {
    nom: '46-import-progression',
    chemin: '/articles',
    attendre: '[data-ecran="articles"] li',
    session: PROPRIO,
    action: async (page) => {
      await ouvrirImport(page)
      await page.getByRole('button', { name: /^(Continuer|Continue)$/ }).click()
      await page.waitForSelector('[data-modes]')
      await page.getByRole('radio', { name: /^(Ignorer les lignes en erreur|Skip rows with errors)/ }).click()
      await page.getByRole('button', { name: /^(Importer|Import) \d+/ }).click()
      await page.waitForSelector('[data-progression="termine"]', { timeout: 15_000 })
    },
  },
  { nom: '47-invitation', chemin: '/invitation/demo', attendre: '[data-ecran="invitation"] [data-invitation]' },
  {
    nom: '48-ventes-export',
    chemin: '/ventes',
    attendre: '[data-ecran="ventes"] li',
    session: PROPRIO,
    action: async (page) => {
      await page.getByRole('button', { name: /^(Exporter|Export)$/ }).click()
      await page.waitForSelector('[role="menu"]')
    },
  },
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
const navigateur = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })

// Échauffement : Vite optimise ses dépendances au premier chargement (rechargement de page) ; on le provoque avant de capturer.
{
  const contexte = await navigateur.newContext()
  const page = await contexte.newPage()
  for (const chemin of ['/langue', '/admin/studio', '/articles', '/ventes']) {
    await page.goto(`${URL_BASE}${chemin}`, { waitUntil: 'load' }).catch(() => undefined)
    await page.waitForTimeout(1500)
  }
  await contexte.close()
}
const problemes = []
let nombre = 0

const NAMESPACES = 'nav|commun|auth|caisse|ventes|paiement|succes|recu|tableau|portefeuille|reglages|equipe|articles|demarrage|erreurs|methodes|operateurs|periodes|statuts|statutsPaiement|temps|roles|admin|studio|deuxFa|import|invitation|recherche|export|utilisateur|entete'

try {
  for (const vue of VUES) {
    for (const theme of THEMES) {
      for (const locale of LOCALES) {
        for (const ecran of ECRANS) {
          if (ecran.uniquement && !ecran.uniquement.includes(vue.nom)) continue
          if (vue.seulementSiDemande && !ecran.uniquement?.includes(vue.nom)) continue
          const contexte = await navigateur.newContext({
            viewport: { width: vue.largeur, height: vue.hauteur },
            deviceScaleFactor: vue.mobile ? 2 : 1,
            isMobile: vue.mobile,
            hasTouch: vue.mobile,
            locale: locale === 'fr' ? 'fr-FR' : 'en-US',
            colorScheme: theme === 'sombre' ? 'dark' : 'light',
            reducedMotion: 'reduce',
            permissions: ['microphone'],
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
            // Les identifiants techniques montrés exprès (clés vocales du studio, codes d'action du journal) sont exclus.
            const texte = await page.evaluate(() => {
              const copie = document.body.cloneNode(true)
              for (const el of copie.querySelectorAll('[data-technique]')) el.remove()
              document.body.appendChild(copie)
              copie.style.position = 'absolute'
              copie.style.left = '-99999px'
              const lu = copie.innerText
              copie.remove()
              return lu
            })
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
