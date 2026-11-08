import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Fixtures communes (docs/DIRECTIVES.md annexe A.3) :
 * - une connexion par rôle, jamais recopiée dans les tests ;
 * - surveillance réseau/console : aucun 4xx/5xx inattendu, aucune erreur JavaScript ;
 * - captures nommées `captures/<date>/<NN>-<ecran>-<etat>.png`, page entière, après chargement.
 *
 * Les données créées par un test portent le préfixe PREFIXE_TEST et sont supprimées à la fin.
 */

export const PREFIXE_TEST = `TEST-E2E-${new Date().toISOString().slice(0, 10)}`;

export const COMPTES = {
  proprietaire: { identifiant: 'demo@satspoint.local', motDePasse: process.env.E2E_MDP_DEMO ?? '' },
  caissier: { identifiant: 'caissier@satspoint.local', motDePasse: process.env.E2E_MDP_DEMO ?? '' },
  superAdmin: { identifiant: process.env.E2E_ADMIN_EMAIL ?? 'mlletech11@gmail.com', motDePasse: process.env.E2E_MDP_ADMIN ?? '' },
} as const;

export type Role = keyof typeof COMPTES;

/** Réponses 4xx attendues par nature (authentification, validation volontaire…). */
const STATUTS_TOLERES: Array<{ url: RegExp; status: number }> = [
  { url: /\/api\/v1\/moi$/, status: 401 }, // visiteur non connecté : normal
  { url: /\/broadcasting\/auth$/, status: 403 }, // canal refusé volontairement dans les tests de droits
];

export class Surveillance {
  erreursConsole: string[] = [];
  reponsesEnErreur: string[] = [];
  private tolerees: Array<{ url: RegExp; status: number }> = [...STATUTS_TOLERES];

  constructor(page: Page) {
    page.on('console', (m) => {
      if (m.type() === 'error') this.erreursConsole.push(m.text());
    });
    page.on('pageerror', (e) => this.erreursConsole.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      const s = r.status();
      if (s < 400) return;
      const url = r.url();
      if (this.tolerees.some((t) => t.url.test(url) && t.status === s)) return;
      this.reponsesEnErreur.push(`${s} ${r.request().method()} ${url}`);
    });
  }

  /** Autorise ponctuellement une réponse attendue (ex. 422 d'un formulaire volontairement invalide). */
  tolerer(url: RegExp, status: number) {
    this.tolerees.push({ url, status });
  }

  verifier() {
    expect(this.reponsesEnErreur, 'réponses réseau en erreur').toEqual([]);
    expect(this.erreursConsole, 'erreurs console').toEqual([]);
  }
}

let compteur = 0;
const dossierCaptures = path.resolve(__dirname, '..', '..', 'captures', new Date().toISOString().slice(0, 10));

/** Capture page entière, nommée dans l'ordre du parcours. À appeler quand les données attendues sont visibles. */
export async function capturer(page: Page, ecran: string, etat: string) {
  fs.mkdirSync(dossierCaptures, { recursive: true });
  compteur += 1;
  const taille = page.viewportSize()?.width === 390 ? 'mobile' : 'bureau';
  const fichier = path.join(dossierCaptures, `${String(compteur).padStart(2, '0')}-${ecran}-${etat}-${taille}.png`);
  await page.screenshot({ path: fichier, fullPage: true });
  return fichier;
}

async function seConnecter(page: Page, role: Role) {
  const compte = COMPTES[role];
  if (!compte.motDePasse) throw new Error(`Mot de passe manquant pour le rôle ${role} (variable E2E_MDP_*)`);
  await page.goto('/connexion');
  await page.getByLabel(/téléphone ou e-mail|identifiant/i).fill(compte.identifiant);
  await page.getByLabel(/mot de passe/i).fill(compte.motDePasse);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/connexion/);
}

type Fixtures = {
  surveillance: Surveillance;
  pageProprietaire: Page;
  pageCaissier: Page;
  pageSuperAdmin: Page;
  api: APIRequestContext;
};

export const test = base.extend<Fixtures>({
  surveillance: async ({ page }, use) => {
    const s = new Surveillance(page);
    await use(s);
    s.verifier();
  },
  pageProprietaire: async ({ page }, use) => {
    await seConnecter(page, 'proprietaire');
    await use(page);
  },
  pageCaissier: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await seConnecter(p, 'caissier');
    await use(p);
    await ctx.close();
  },
  pageSuperAdmin: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await seConnecter(p, 'superAdmin');
    await use(p);
    await ctx.close();
  },
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: process.env.E2E_API_URL ?? 'http://localhost:8120' });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };
