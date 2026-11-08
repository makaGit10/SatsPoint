import { test as base, expect, request as requeteur, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chargerEnvRacine } from './outils/env';

/**
 * Fixtures communes (docs/DIRECTIVES.md annexe A.3) :
 * - une session par rôle, jamais recopiée dans les tests (comptes de démo en cache, boutiques de test créées à la demande) ;
 * - surveillance réseau/console sur chaque page : aucun 4xx/5xx inattendu, aucune erreur JavaScript ;
 * - captures nommées `captures/<date>/<NN>-<ecran>-<etat>-<taille>.png`, page entière, après chargement ;
 * - données de test préfixées `TEST-E2E-<date>` et supprimées à la fin (global-teardown → `php artisan e2e:nettoyer`).
 *
 * La boutique démo est branchée sur un VRAI portefeuille : on n'y encaisse jamais, on n'y envoie jamais de sats.
 * Les parcours de paiement utilisent une boutique de test reliée à un portefeuille simulé (`mock://e2e-…`).
 */

chargerEnvRacine();

export const DATE_TEST = new Date().toISOString().slice(0, 10);
export const PREFIXE_TEST = `TEST-E2E-${DATE_TEST}`;
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5190';
export const RACINE = path.resolve(__dirname, '..', '..');
const DOSSIER_AUTH = path.resolve(__dirname, '.auth');
export const DOSSIER_CAPTURES = path.join(RACINE, 'captures', DATE_TEST);

export type Compte = { identifiant: string; motDePasse: string; ulid?: string };

export const COMPTES_DEMO = {
  proprietaire: { identifiant: 'demo@satspoint.local', motDePasse: process.env.E2E_MDP_DEMO ?? '' },
  caissier: { identifiant: 'caissier@satspoint.local', motDePasse: process.env.E2E_MDP_DEMO ?? '' },
} satisfies Record<string, Compte>;

/** Commande artisan dans le conteneur `api` (environnement local uniquement). */
export function artisan(...args: string[]): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'api', 'php', 'artisan', ...args], { cwd: RACINE, encoding: 'utf8' });
}

let numero = 0;
/** Suffixe court et unique (minuscules + chiffres) pour nommer les données d'un test. */
export function suffixe(): string {
  numero += 1;
  return `${Date.now().toString(36)}${numero}${Math.random().toString(36).slice(2, 5)}`;
}

/** Compte de test créé par `php artisan e2e:compte` (mot de passe aléatoire, jamais écrit sur disque). */
export function creerCompteTest(nom: string, options: { superAdmin?: boolean } = {}): Compte {
  const args = ['e2e:compte', PREFIXE_TEST, `--nom=${nom}`];
  if (options.superAdmin) args.push('--super-admin');
  const sortie = artisan(...args).trim().split(/\r?\n/).pop() ?? '';
  const json = JSON.parse(sortie) as { ulid: string; identifiant: string; password: string };
  return { identifiant: json.identifiant, motDePasse: json.password, ulid: json.ulid };
}

let compteurTelephone = 0;
/** Numéro sénégalais de test, unique pour l'exécution. */
export function telephoneTest(): string {
  compteurTelephone += 1;
  const n = ((Date.now() / 1000) % 100000) * 100 + (compteurTelephone % 100);
  return `+22170${String(Math.floor(n)).padStart(7, '0').slice(-7)}`;
}

/** Compte de test identifié par téléphone (pour accepter une invitation envoyée à ce numéro). */
export function creerCompteTelephone(nom: string, telephone: string): Compte {
  const compte = creerCompteTest(nom);
  artisan('tinker', '--execute', `App\\Models\\User::where('email', '${compte.identifiant}')->update(['telephone' => '${telephone}']);`);
  return compte;
}

// ---------------------------------------------------------------------------------------------
// Client API avec session (cookies Sanctum + X-XSRF-TOKEN), via le proxy du front (même origine).
// ---------------------------------------------------------------------------------------------

export type Reponse<T = any> = { status: number; json: T; texte: string; entetes: Record<string, string> };

export class ClientApi {
  private constructor(readonly ctx: APIRequestContext) {}

  static async anonyme(baseURL = BASE_URL): Promise<ClientApi> {
    const ctx = await requeteur.newContext({ baseURL, extraHTTPHeaders: { Accept: 'application/json', Referer: `${BASE_URL}/` } });
    const client = new ClientApi(ctx);
    await ctx.get('/sanctum/csrf-cookie');
    return client;
  }

  static async connecte(compte: Compte): Promise<ClientApi> {
    const client = await ClientApi.anonyme();
    const r = await client.post('/auth/connexion', { identifiant: compte.identifiant, password: compte.motDePasse });
    if (r.status !== 200) throw new Error(`Connexion API impossible (${r.status}) pour ${compte.identifiant}`);
    return client;
  }

  static async depuisEtat(etat: string): Promise<ClientApi> {
    const ctx = await requeteur.newContext({ baseURL: BASE_URL, storageState: etat, extraHTTPHeaders: { Accept: 'application/json', Referer: `${BASE_URL}/` } });
    return new ClientApi(ctx);
  }

  private async xsrf(): Promise<string> {
    const cookie = (await this.ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN');
    return cookie ? decodeURIComponent(cookie.value) : '';
  }

  async requete<T = any>(methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = {}): Promise<Reponse<T>> {
    const url = /^https?:\/\//.test(chemin) || /^\/(api|r|broadcasting|sanctum|audio)\//.test(chemin) ? chemin : `/api/v1${chemin}`;
    const headers: Record<string, string> = { ...entetes };
    if (methode !== 'GET') headers['X-XSRF-TOKEN'] = await this.xsrf();
    const r = await this.ctx.fetch(url, { method: methode, headers, ...(corps !== undefined ? { data: corps as any } : {}) });
    const texte = await r.text();
    let json: any = null;
    try {
      json = texte ? JSON.parse(texte) : null;
    } catch {
      json = null;
    }
    return { status: r.status(), json, texte, entetes: r.headers() };
  }

  get<T = any>(chemin: string, entetes?: Record<string, string>) {
    return this.requete<T>('GET', chemin, undefined, entetes);
  }
  post<T = any>(chemin: string, corps?: unknown) {
    return this.requete<T>('POST', chemin, corps);
  }
  put<T = any>(chemin: string, corps?: unknown) {
    return this.requete<T>('PUT', chemin, corps);
  }
  patch<T = any>(chemin: string, corps?: unknown) {
    return this.requete<T>('PATCH', chemin, corps);
  }
  delete<T = any>(chemin: string, corps?: unknown) {
    return this.requete<T>('DELETE', chemin, corps);
  }

  async etat(fichier: string): Promise<string> {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    await this.ctx.storageState({ path: fichier });
    return fichier;
  }

  async fermer() {
    await this.ctx.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Sessions des comptes de démo (en cache : la connexion est limitée à 5 / min et 30 / h par identifiant).
// ---------------------------------------------------------------------------------------------

export async function etatDemo(role: keyof typeof COMPTES_DEMO): Promise<string> {
  const compte = COMPTES_DEMO[role];
  if (!compte.motDePasse) throw new Error('Mot de passe de démo manquant (DEMO_PASSWORD dans .env ou E2E_MDP_DEMO)');
  const fichier = path.join(DOSSIER_AUTH, `demo-${role}.json`);
  if (fs.existsSync(fichier)) {
    const client = await ClientApi.depuisEtat(fichier);
    const moi = await client.get('/moi');
    await client.fermer();
    if (moi.status === 200) return fichier;
  }
  const client = await ClientApi.connecte(compte);
  await client.etat(fichier);
  await client.fermer();
  return fichier;
}

/** Session d'un compte quelconque, enregistrée dans `.auth/` (non versionné). */
export async function etatCompte(compte: Compte): Promise<string> {
  const client = await ClientApi.connecte(compte);
  const fichier = path.join(DOSSIER_AUTH, `${compte.identifiant.replace(/[^a-z0-9]+/gi, '-')}.json`);
  await client.etat(fichier);
  await client.fermer();
  return fichier;
}

// ---------------------------------------------------------------------------------------------
// Boutique de test : compte (artisan) → POST /boutique → PUT /boutique/wallet (portefeuille simulé).
// ---------------------------------------------------------------------------------------------

export type BoutiqueTest = { nom: string; ulid: string; compte: Compte; etat: string; api: ClientApi; utilisateurUlid: string };

export async function creerBoutiqueTest(libelle: string, options: { wallet?: boolean } = {}): Promise<BoutiqueTest> {
  const s = suffixe();
  const compte = creerCompteTest(`Proprio ${libelle}`);
  const api = await ClientApi.connecte(compte);
  const nom = `${PREFIXE_TEST} ${libelle} ${s}`.slice(0, 60);
  const creation = await api.post('/boutique', { nom, ville: 'Dakar' });
  expect(creation.status, `POST /boutique ${creation.texte}`).toBe(201);
  expect(creation.json.utilisateur?.boutique?.role, 'POST /boutique renvoie { boutique, utilisateur }').toBe('proprietaire');
  if (options.wallet !== false) {
    const wallet = await api.put('/boutique/wallet', { uri: `mock://e2e-${s}`.slice(0, 47) });
    expect(wallet.status, `PUT /boutique/wallet ${wallet.texte}`).toBe(200);
    expect(wallet.json.simule).toBe(true);
  }
  const etat = await api.etat(path.join(DOSSIER_AUTH, `boutique-${s}.json`));
  return { nom, ulid: creation.json.boutique.ulid, compte, etat, api, utilisateurUlid: creation.json.utilisateur.ulid };
}

/**
 * Membre d'une boutique de test : le responsable invite un numéro (le lien est renvoyé, aucun SMS), un compte de test
 * est créé avec ce numéro, se connecte et accepte l'invitation. Retourne sa session.
 */
export async function ajouterMembreTest(boutique: BoutiqueTest, role: 'gerant' | 'caissier'): Promise<{ compte: Compte; etat: string; api: ClientApi; ulid: string }> {
  const telephone = telephoneTest();
  const invitation = await boutique.api.post('/equipe/invitations', { contact: telephone, role });
  expect(invitation.status, invitation.texte).toBe(201);
  const jeton = String(invitation.json.invitation.lien).split('/').pop()!;
  const compte = creerCompteTelephone(role, telephone);
  const api = await ClientApi.connecte(compte);
  const acceptation = await api.post(`/invitations/${jeton}/accepter`);
  expect(acceptation.status, acceptation.texte).toBe(200);
  const etat = await api.etat(path.join(DOSSIER_AUTH, `membre-${suffixe()}.json`));
  return { compte, etat, api, ulid: acceptation.json.utilisateur.ulid };
}

/** Vente créée par l'API (boutique de test) : renvoie `{ vente, paiement }`. */
export async function creerVente(api: ClientApi, montant: number, options: { methode?: string; operateur?: string; note?: string } = {}) {
  const r = await api.post('/ventes', { montant_xof: montant, methode: options.methode ?? 'lightning', ...(options.operateur ? { operateur: options.operateur } : {}), ...(options.note ? { note: options.note } : {}) });
  expect(r.status, `POST /ventes ${r.texte}`).toBe(201);
  return { vente: r.json.vente, paiement: r.json.vente.paiements[0] };
}

// ---------------------------------------------------------------------------------------------
// Navigateur : préparation du contexte, surveillance, captures.
// ---------------------------------------------------------------------------------------------

export type OptionsContexte = { premierLancement?: boolean; aideVocale?: boolean; locale?: 'fr' | 'en'; theme?: 'clair' | 'sombre' };

/** Langue déjà choisie (sinon `/langue`), interface FR, aide vocale coupée (noms accessibles propres). Une seule fois par onglet. */
export async function preparerContexte(ctx: BrowserContext, options: OptionsContexte = {}) {
  await ctx.addInitScript((o: OptionsContexte) => {
    try {
      if (sessionStorage.getItem('e2e.prepare')) return;
      sessionStorage.setItem('e2e.prepare', '1');
      if (o.premierLancement) return;
      if (!localStorage.getItem('satspoint.langue-choisie')) localStorage.setItem('satspoint.langue-choisie', o.locale ?? 'fr');
      localStorage.setItem('satspoint.locale', o.locale ?? 'fr');
      localStorage.setItem('satspoint.aide-vocale', o.aideVocale ? '1' : '0');
      if (o.theme) localStorage.setItem('satspoint.theme', o.theme);
    } catch {
      /* stockage indisponible */
    }
  }, options);
}

/** Réponses 4xx attendues par nature. */
const STATUTS_TOLERES: Array<{ url: RegExp; status: number }> = [
  { url: /\/api\/v1\/moi$/, status: 401 }, // visiteur non connecté : normal
];

export class Surveillance {
  erreursConsole: string[] = [];
  reponsesEnErreur: string[] = [];
  requetesEchouees: string[] = [];
  private tolerees: Array<{ url: RegExp; status: number }> = [...STATUTS_TOLERES];

  constructor(readonly page: Page) {
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // Doublon d'une réponse HTTP en erreur, déjà contrôlée (tolérée ou non) par `reponsesEnErreur`.
      if (m.text().startsWith('Failed to load resource: the server responded with a status of')) return;
      // Doublon d'une requête en échec volontaire (ex. hors ligne simulé), déjà tolérée.
      if (m.text().startsWith('Failed to load resource: net::') && this.echecsToleres.some((x) => x.test(m.text()))) return;
      this.erreursConsole.push(m.text());
    });
    page.on('pageerror', (e) => this.erreursConsole.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      const s = r.status();
      if (s < 400) return;
      const url = r.url();
      if (this.tolerees.some((t) => t.url.test(url) && t.status === s)) return;
      this.reponsesEnErreur.push(`${s} ${r.request().method()} ${url}`);
    });
    page.on('requestfailed', (r) => {
      const erreur = r.failure()?.errorText ?? '';
      // Requêtes volontairement annulées (recherche remplacée, navigation, fermeture) : normal.
      if (erreur.includes('ERR_ABORTED')) return;
      if (this.echecsToleres.some((m) => m.test(`${erreur} ${r.url()}`))) return;
      this.requetesEchouees.push(`${erreur} ${r.method()} ${r.url()}`);
    });
  }

  private echecsToleres: RegExp[] = [];
  /** Autorise des requêtes qui échouent volontairement (ex. mode hors ligne simulé). */
  tolererEchec(motif: RegExp) {
    this.echecsToleres.push(motif);
  }

  /** Autorise ponctuellement une réponse attendue (ex. 422 d'un formulaire volontairement invalide). */
  tolerer(url: RegExp, status: number) {
    this.tolerees.push({ url, status });
  }

  verifier() {
    expect(this.reponsesEnErreur, 'réponses réseau en erreur').toEqual([]);
    expect(this.requetesEchouees, 'requêtes en échec').toEqual([]);
    expect(this.erreursConsole, 'erreurs console').toEqual([]);
  }
}

/** Taille de la vue courante pour les noms de captures. */
export function taille(page: Page): 'mobile' | 'bureau' {
  return (page.viewportSize()?.width ?? 1366) < 768 ? 'mobile' : 'bureau';
}

export const estMobile = (page: Page) => taille(page) === 'mobile';

/** Capture page entière `captures/<date>/<nom>-<taille>.png` (ex. `03-paiement-attente`). À appeler données visibles. */
export async function capturer(page: Page, nom: string) {
  fs.mkdirSync(DOSSIER_CAPTURES, { recursive: true });
  const fichier = path.join(DOSSIER_CAPTURES, `${nom}-${taille(page)}.png`);
  await page.screenshot({ path: fichier, fullPage: true, animations: 'disabled' });
  return fichier;
}

/** Attend que l'écran soit monté et que les squelettes de premier chargement aient disparu. */
export async function ecranPret(page: Page, ecran: string) {
  await expect(page.locator(`[data-ecran="${ecran}"]`).first()).toBeVisible();
  await expect(page.locator('[data-chargement]')).toHaveCount(0);
}

/** Navigation dans le menu, quelle que soit la taille (barre latérale bureau, barre du bas ou « Plus » sur mobile). */
export async function allerVers(page: Page, libelle: RegExp) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  const lien = nav.getByRole('link', { name: libelle });
  if (await lien.count()) {
    await lien.first().click();
    return;
  }
  await nav.getByRole('button', { name: /^Plus/ }).click();
  await page.getByRole('dialog', { name: 'Plus' }).getByRole('button', { name: libelle }).click();
}

export type PageSurveillee = { page: Page; contexte: BrowserContext; surveillance: Surveillance };

const surveillances = new WeakMap<Page, Surveillance>();
/** Déclare une réponse 4xx attendue sur une page ouverte par la fixture `ouvrir` (ou `pageProprietaire`…). */
export function tolerer(page: Page, url: RegExp, status: number) {
  const s = surveillances.get(page);
  if (!s) throw new Error('Page non surveillée');
  s.tolerer(url, status);
}
export function tolererEchec(page: Page, motif: RegExp) {
  surveillances.get(page)?.tolererEchec(motif);
}

type Fixtures = {
  surveillance: Surveillance;
  /** Ouvre une page dans un nouveau contexte (session donnée), surveillée et vérifiée à la fin du test. */
  ouvrir: (etat: string | undefined, options?: OptionsContexte) => Promise<PageSurveillee>;
  /** Boutique de test avec portefeuille simulé, propriétaire connecté (créée à la demande). */
  boutique: BoutiqueTest;
  pageProprietaire: Page;
  pageDemo: Page;
  pageCaissierDemo: Page;
};

export const test = base.extend<Fixtures>({
  context: async ({ context }, use) => {
    await preparerContexte(context);
    await use(context);
  },
  surveillance: async ({ page }, use) => {
    const s = new Surveillance(page);
    surveillances.set(page, s);
    await use(s);
    s.verifier();
  },
  ouvrir: async ({ browser }, use, testInfo) => {
    const ouvertes: PageSurveillee[] = [];
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, permissions } = testInfo.project.use;
    await use(async (etat, options = {}) => {
      const contexte = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, permissions, storageState: etat, baseURL: BASE_URL });
      await preparerContexte(contexte, options);
      const page = await contexte.newPage();
      const p = { page, contexte, surveillance: new Surveillance(page) };
      surveillances.set(page, p.surveillance);
      ouvertes.push(p);
      return p;
    });
    for (const p of ouvertes) await p.contexte.close();
    for (const p of ouvertes) p.surveillance.verifier();
  },
  boutique: async ({}, use, testInfo) => {
    const numeroFichier = path.basename(testInfo.file).slice(0, 2);
    const b = await creerBoutiqueTest(`P${numeroFichier}`);
    await use(b);
    await b.api.fermer();
  },
  pageProprietaire: async ({ ouvrir, boutique }, use) => {
    const { page } = await ouvrir(boutique.etat);
    await use(page);
  },
  pageDemo: async ({ ouvrir }, use) => {
    const { page } = await ouvrir(await etatDemo('proprietaire'));
    await use(page);
  },
  pageCaissierDemo: async ({ ouvrir }, use) => {
    const { page } = await ouvrir(await etatDemo('caissier'));
    await use(page);
  },
});

export { expect };

/** Fait expirer une tentative côté serveur (échéance dépassée + `paiements:expirer`, comme le planificateur). */
export function forcerExpiration(paiementUlid: string) {
  artisan('tinker', '--execute', `DB::table('paiements')->where('ulid', '${paiementUlid}')->update(['expire_at' => now()->subMinute()]);`);
  artisan('paiements:expirer');
}
