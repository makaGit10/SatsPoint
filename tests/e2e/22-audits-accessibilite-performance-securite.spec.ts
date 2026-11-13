import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ajouterMembreTest, BASE_URL, ClientApi, creerVente, ecranPret, etatDemo, expect, PREFIXE_TEST, test } from './fixtures';
import { superAdminValide } from './outils/admin';
import { encaisser, taperMontant } from './outils/ui';

/**
 * Audits (consigne de la propriétaire, étape 6) :
 * (a) accessibilité axe-core sur chaque écran : zéro violation « serious » / « critical » ;
 * (b) performance : LCP, INP et poids transféré de la caisse et de l'écran de paiement, processeur ralenti ×4 et
 *     réseau « Slow 4G » (CDP) — à lancer de préférence sur le build de production (E2E_BASE_URL du `vite preview`) ;
 * (c) sécurité : en-têtes par type de réponse, CORS (origine étrangère refusée), cookies (HttpOnly, SameSite) ;
 * (d) délai règlement → écran vert en simulé : médiane sur 10 essais.
 * Les mesures sont écrites dans `test-results/mesures-<projet>.json` (reprises dans RAPPORT.md).
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:8120';
const mesures: Record<string, unknown> = {};
function enregistrer(projet: string) {
  const dossier = path.resolve(__dirname, 'test-results');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, `mesures-${projet}.json`);
  const avant = fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : {};
  fs.writeFileSync(fichier, JSON.stringify({ ...avant, ...mesures }, null, 1));
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, aide: v.help, noeuds: v.nodes.length, exemple: v.nodes[0]?.target.join(' ') }));
}

test.describe('22 · Audits', () => {
  test('(a) accessibilité : aucun défaut grave sur chaque écran', async ({ ouvrir, boutique }, testInfo) => {
    test.setTimeout(300_000);
    await boutique.api.post('/articles', { nom: `${PREFIXE_TEST} Article`, prix_xof: 500, couleur: '#16A34A' });
    const v = await creerVente(boutique.api, 1000);
    await boutique.api.post(`/paiements/${v.paiement.ulid}/simuler`);
    const attente = await creerVente(boutique.api, 1500);
    const recu = (await boutique.api.get(`/ventes/${v.vente.ulid}`)).json.vente.recu_url as string;
    const resultats: Record<string, unknown> = {};
    const graves: string[] = [];
    const examiner = async (page: Page, nom: string, chemin: string, ecran: string) => {
      await page.goto(chemin);
      await ecranPret(page, ecran);
      const violations = await axe(page);
      resultats[nom] = violations;
      for (const x of violations) if (x.impact === 'serious' || x.impact === 'critical') graves.push(`${nom} : ${x.id} (${x.impact}, ${x.noeuds} nœud(s), ex. ${x.exemple})`);
    };
    const { page: visiteur } = await ouvrir(undefined, { premierLancement: true });
    await examiner(visiteur, 'langue', '/langue', 'langue');
    await visiteur.getByRole('button', { name: /^Français fr/ }).click();
    for (const [n, c, e] of [['accueil', '/accueil', 'accueil'], ['connexion', '/connexion', 'connexion'], ['inscription', '/inscription', 'inscription'], ['oubli', '/mot-de-passe/oubli', 'oubli'], ['recu', recu, 'recu']] as const) await examiner(visiteur, n, c, e);
    const { page } = await ouvrir(boutique.etat);
    for (const [n, c, e] of [
      ['caisse', '/caisse', 'caisse'],
      ['paiement', `/caisse/paiement/${attente.paiement.ulid}`, 'paiement'],
      ['succes', `/caisse/paiement/${v.paiement.ulid}`, 'succes'],
      ['ventes', '/ventes', 'ventes'],
      ['tableau-de-bord', '/tableau-de-bord', 'tableau-de-bord'],
      ['portefeuille', '/portefeuille', 'portefeuille'],
      ['articles', '/articles', 'articles'],
      ['equipe', '/equipe', 'equipe'],
      ['reglages', '/reglages', 'reglages'],
      ['demarrage', '/demarrage', 'demarrage'],
      ['securite-2fa', '/securite/2fa', 'securite-2fa'],
    ] as const) await examiner(page, n, c, e);
    // Fenêtres principales : détail de vente, recherche.
    await page.goto(`/ventes?vente=${v.vente.ulid}`);
    await expect(page.getByRole('dialog', { name: /^Détail de la vente/ })).toBeVisible();
    resultats['ventes-detail'] = await axe(page);
    const admin = await superAdminValide();
    const { page: pageAdmin } = await ouvrir(admin.etat);
    for (const [n, c, e] of [['admin', '/admin', 'admin'], ['admin-boutiques', '/admin?onglet=boutiques', 'admin'], ['admin-sante', '/admin?onglet=sante', 'admin'], ['admin-journal', '/admin?onglet=journal', 'admin'], ['studio', '/admin/studio', 'studio']] as const) await examiner(pageAdmin, n, c, e);
    for (const x of resultats['ventes-detail'] as Array<{ id: string; impact: string; noeuds: number; exemple: string }>) if (x.impact === 'serious' || x.impact === 'critical') graves.push(`ventes-detail : ${x.id} (${x.impact})`);
    mesures[`axe-${testInfo.project.name}`] = resultats;
    enregistrer(testInfo.project.name);
    expect(graves, graves.join('\n')).toEqual([]);
  });

  test('(b) performance : caisse et paiement, CPU ×4 et Slow 4G', async ({ ouvrir, boutique }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mesure faite au format téléphone (cible : Android de milieu de gamme)');
    test.setTimeout(180_000);
    const { page } = await ouvrir(boutique.etat);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // « Slow 4G » (profil Chrome DevTools) : 150 ms de latence, ~1,6 Mb/s descendant, 750 kb/s montant.
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    const webVitals = fs.readFileSync(path.join(__dirname, 'node_modules/web-vitals/dist/web-vitals.iife.js'), 'utf8');
    await page.addInitScript(webVitals);
    await page.addInitScript(() => {
      const w = window as unknown as { __vitals: Record<string, number>; webVitals: { onLCP: Function; onINP: Function; onFCP: Function; onCLS: Function } };
      w.__vitals = {};
      const noter = (m: { name: string; value: number }) => (w.__vitals[m.name] = m.value);
      document.addEventListener('DOMContentLoaded', () => {
        w.webVitals.onLCP(noter, { reportAllChanges: true });
        w.webVitals.onINP(noter, { reportAllChanges: true });
        w.webVitals.onFCP(noter);
        w.webVitals.onCLS(noter, { reportAllChanges: true });
      });
    });
    let octets = 0;
    cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => (octets += e.encodedDataLength));

    const mesurer = async (nom: string, chemin: string, ecran: string, interaction: () => Promise<void>) => {
      octets = 0;
      const debut = Date.now();
      await page.goto(chemin, { waitUntil: 'load' });
      await ecranPret(page, ecran);
      const charge = Date.now() - debut;
      await interaction();
      await expect.poll(async () => page.evaluate(() => (window as unknown as { __vitals: Record<string, number> }).__vitals.INP ?? -1), { timeout: 15_000 }).toBeGreaterThanOrEqual(0);
      const vitals = await page.evaluate(() => (window as unknown as { __vitals: Record<string, number> }).__vitals);
      mesures[`perf-${nom}`] = { LCP_ms: Math.round(vitals.LCP ?? -1), FCP_ms: Math.round(vitals.FCP ?? -1), INP_ms: Math.round(vitals.INP ?? -1), CLS: vitals.CLS ?? 0, poids_transfere_ko: Math.round(octets / 1024), ecran_pret_ms: charge, url: BASE_URL };
    };
    await mesurer('caisse', '/caisse', 'caisse', async () => {
      await page.getByRole('group', { name: 'Pavé numérique' }).getByRole('button', { name: 'Touche 5', exact: true }).click();
      await page.getByRole('group', { name: 'Pavé numérique' }).getByRole('button', { name: 'Touche 0', exact: true }).click();
    });
    const { paiement } = await creerVente(boutique.api, 1000);
    await mesurer('paiement', `/caisse/paiement/${paiement.ulid}`, 'paiement', async () => {
      await page.getByRole('button', { name: 'Vérifier le paiement' }).click();
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    mesures['perf-conditions'] = 'CPU ×4, Slow 4G (150 ms, 1,6 Mb/s), 390×844';
    enregistrer(testInfo.project.name);
    const caisse = mesures['perf-caisse'] as { LCP_ms: number; INP_ms: number };
    expect(caisse.LCP_ms).toBeGreaterThan(0);
  });

  test('(c) sécurité : en-têtes, CORS, cookies', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'audit serveur, indépendant de la taille');
    const anonyme = await ClientApi.anonyme(API);
    const entetes: Record<string, Record<string, string>> = {};
    const verifier = (nom: string, h: Record<string, string>) => {
      entetes[nom] = Object.fromEntries(Object.entries(h).filter(([k]) => /^(x-|content-security|strict-transport|referrer|permissions|cross-origin|cache-control|content-type|set-cookie|access-control)/i.test(k)));
      expect(h['x-content-type-options'], `${nom} nosniff`).toBe('nosniff');
    };
    verifier('api-json', (await anonyme.ctx.get('/api/v1/config')).headers());
    verifier('api-erreur-401', (await anonyme.ctx.get('/api/v1/moi', { headers: { Accept: 'application/json' } })).headers());
    verifier('sante', (await anonyme.ctx.get('/sante')).headers());
    verifier('recu-404', (await anonyme.ctx.get(`/r/${'A'.repeat(32)}`, { headers: { Accept: 'application/json' } })).headers());
    const manifeste = await anonyme.ctx.get('/api/v1/audio/manifeste/wo');
    verifier('manifeste-audio', manifeste.headers());
    for (const [nom, h] of Object.entries(entetes)) {
      if (nom !== 'recu-404') expect(h['x-frame-options'] ?? h['content-security-policy'], `${nom} anti-clickjacking`).toBeTruthy();
    }
    // CORS : origine du front acceptée, origine étrangère refusée (aucun en-tête Access-Control-Allow-Origin).
    const ok = await anonyme.ctx.fetch('/api/v1/config', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5190', 'Access-Control-Request-Method': 'GET' } });
    expect(ok.headers()['access-control-allow-origin']).toBe('http://localhost:5190');
    expect(ok.headers()['access-control-allow-credentials']).toBe('true');
    const pirate = await anonyme.ctx.fetch('/api/v1/config', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    expect(pirate.headers()['access-control-allow-origin']).toBeUndefined();
    const pirateGet = await anonyme.ctx.get('/api/v1/config', { headers: { Origin: 'https://evil.example' } });
    expect(pirateGet.headers()['access-control-allow-origin']).toBeUndefined();
    // Cookies : session HttpOnly + SameSite ; XSRF lisible par le front (par conception) mais SameSite.
    const session = await ClientApi.connecte({ identifiant: 'demo@satspoint.local', motDePasse: process.env.E2E_MDP_DEMO ?? '' }).catch(() => null);
    const cookies = session ? (await session.ctx.storageState()).cookies : [];
    const sessionCookie = cookies.find((c) => /session/i.test(c.name));
    const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN');
    expect(sessionCookie?.httpOnly, 'cookie de session HttpOnly').toBe(true);
    expect(sessionCookie?.sameSite).toBe('Lax');
    expect(xsrf?.httpOnly).toBe(false);
    expect(xsrf?.sameSite).toBe('Lax');
    mesures['securite-entetes'] = entetes;
    mesures['securite-cookies'] = cookies.map((c) => ({ nom: c.name, httpOnly: c.httpOnly, sameSite: c.sameSite, secure: c.secure }));
    // Aucun jeton dans le stockage du navigateur : vérifié côté code (aucun localStorage de session) ; ici, l'API ne renvoie aucun jeton.
    const moi = session ? await session.get('/moi') : null;
    if (moi) expect(moi.texte).not.toMatch(/token|password|secret/i);
    await session?.fermer();
    await anonyme.fermer();
    enregistrer(testInfo.project.name);
  });

  test('(d) délai règlement → écran vert (simulé), médiane sur 10 essais', async ({ pageProprietaire: page }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule série de mesures');
    test.setTimeout(240_000);
    const delais: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      await page.goto('/caisse');
      await ecranPret(page, 'caisse');
      await taperMontant(page, 100 + i * 10);
      await encaisser(page);
      await expect(page.locator('[data-simuler]')).toBeVisible();
      const t0 = Date.now();
      await page.locator('[data-simuler]').click();
      await page.locator('[data-ecran="succes"]').waitFor({ state: 'visible' });
      delais.push(Date.now() - t0);
    }
    const tries = [...delais].sort((a, b) => a - b);
    const mediane = (tries[4]! + tries[5]!) / 2;
    mesures['delai-ecran-vert'] = { essais_ms: delais, mediane_ms: mediane, max_ms: tries[9] };
    enregistrer(testInfo.project.name);
    expect(mediane, 'règlement → écran vert ≤ 2 s (CAHIER § 14)').toBeLessThanOrEqual(2_000);
    void ajouterMembreTest;
    void etatDemo;
  });
});
