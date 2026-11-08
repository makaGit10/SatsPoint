import type { Page } from '@playwright/test';
import { ajouterMembreTest, capturer, creerBoutiqueTest, creerVente, ecranPret, expect, PREFIXE_TEST, test, type BoutiqueTest } from './fixtures';
import { attendreApi } from './outils/ui';

/**
 * Parcours 18 — Les 6 tests temps réel obligatoires (DIRECTIVES annexe A.2), deux navigateurs ouverts en même temps :
 * A = propriétaire, B = autre membre de la même boutique (un même compte n'écoute pas ses propres signaux).
 *
 * Les assertions d'ABSENCE (« aucun rechargement pendant 12 s », « un seul rechargement ») exigent d'observer
 * pendant une durée : `fenetre()` attend dans la page un délai explicite, documenté, uniquement pour ces constats ;
 * toutes les synchronisations se font sur un élément, une réponse ou une trame WebSocket.
 */

/** Attend la confirmation d'abonnement Reverb au canal privé de la boutique (à appeler AVANT la navigation). */
function abonnement(page: Page, boutiqueUlid: string): Promise<void> {
  return new Promise((resolve) => {
    page.on('websocket', (ws) => {
      ws.on('framereceived', (f) => {
        const t = String(f.payload);
        if (t.includes('pusher_internal:subscription_succeeded') && t.includes(`private-boutique.${boutiqueUlid}`)) resolve();
      });
    });
  });
}

/** Compte les requêtes d'API d'une page selon un motif (méthode GET). */
function compteur(page: Page, motif: RegExp) {
  const etat = { n: 0 };
  page.on('request', (r) => {
    if (r.method() === 'GET' && motif.test(new URL(r.url()).pathname + new URL(r.url()).search)) etat.n += 1;
  });
  return etat;
}

/** Fenêtre d'observation explicite (constats d'absence, cf. en-tête). */
async function fenetre(page: Page, ms: number) {
  await page.evaluate((d) => new Promise((r) => setTimeout(r, d)), ms);
}

async function preparer(ouvrir: (etat: string) => Promise<{ page: Page }>, role: 'caissier' | 'gerant', chemin: string) {
  const boutique: BoutiqueTest = await creerBoutiqueTest('P18');
  const membre = await ajouterMembreTest(boutique, role);
  const { page: b } = await ouvrir(membre.etat);
  const abonne = abonnement(b, boutique.ulid);
  await b.goto(chemin);
  await abonne;
  return { boutique, membre, b };
}

const nouvelArticle = (boutique: BoutiqueTest, nom: string) => boutique.api.post('/articles', { nom: `${PREFIXE_TEST} ${nom}`, prix_xof: 250, couleur: '#16A34A' });

test.describe('18 · Temps réel à deux navigateurs (A.2)', () => {
  test.setTimeout(150_000);

  test('1. A modifie, B voit le changement sans recharger, avec un seul rechargement', async ({ ouvrir }) => {
    const { boutique, b } = await preparer(ouvrir, 'caissier', '/articles');
    await ecranPret(b, 'articles');
    const gets = compteur(b, /^\/api\/v1\/articles$/);
    const debut = Date.now();
    expect((await nouvelArticle(boutique, 'Temps réel 1')).status).toBe(201);
    await expect(b.getByText(`${PREFIXE_TEST} Temps réel 1`)).toBeVisible({ timeout: 2_500 });
    const delai = Date.now() - debut;
    await fenetre(b, 2_000);
    expect(gets.n, 'un seul rechargement').toBe(1);
    // Trois modifications rapprochées → un seul rechargement (regroupement ~800 ms).
    gets.n = 0;
    await Promise.all([nouvelArticle(boutique, 'Rafale A'), nouvelArticle(boutique, 'Rafale B'), nouvelArticle(boutique, 'Rafale C')]);
    await expect(b.getByText(`${PREFIXE_TEST} Rafale C`)).toBeVisible({ timeout: 2_500 });
    await fenetre(b, 2_000);
    expect(gets.n, 'signaux regroupés').toBe(1);
    await capturer(b, '18-temps-reel-b-a-jour');
    test.info().annotations.push({ type: 'délai A→B', description: `${delai} ms` });
  });

  test('2. L’écran de A ne se recharge pas lui-même', async ({ ouvrir }) => {
    const boutique = await creerBoutiqueTest('P18');
    const { page: a } = await ouvrir(boutique.etat);
    const abonne = abonnement(a, boutique.ulid);
    await a.goto('/articles');
    await abonne;
    await ecranPret(a, 'articles');
    const gets = compteur(a, /^\/api\/v1\/articles$/);
    await a.getByRole('button', { name: /^Ajouter un article/ }).click();
    const d = a.getByRole('dialog', { name: 'Ajouter un article' });
    await d.getByLabel('Nom', { exact: true }).fill(`${PREFIXE_TEST} Moi-même`);
    await d.getByLabel('Prix').fill('100');
    const creation = await attendreApi(a, 'POST', /\/api\/v1\/articles$/, () => d.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(creation.status()).toBe(201);
    await expect(a.getByText(`${PREFIXE_TEST} Moi-même`)).toBeVisible();
    await fenetre(a, 2_500);
    // Une seule relecture : l'invalidation locale après l'enregistrement ; le signal de sa propre écriture est ignoré.
    expect(gets.n).toBe(1);
  });

  test('3. Aucun rechargement pendant 12 s sans modification ; une lecture ne déclenche rien', async ({ ouvrir }) => {
    const { boutique, b } = await preparer(ouvrir, 'gerant', '/equipe');
    await ecranPret(b, 'equipe');
    const appels = compteur(b, /^\/api\/v1\//);
    // A ne fait que des lectures (dont des POST de lecture n'existent pas ici) : aucune écriture → aucun signal.
    await boutique.api.get('/ventes');
    await boutique.api.get('/equipe');
    await boutique.api.get('/tableau-de-bord?periode=7j');
    await fenetre(b, 12_000);
    expect(appels.n, 'requêtes de B sans aucune modification').toBe(0);
  });

  test('4. Une fenêtre ouverte chez B reste ouverte et se met à jour', async ({ ouvrir }) => {
    const { boutique, membre, b } = await preparer(ouvrir, 'caissier', '/ventes');
    const { vente } = await creerVente(membre.api, 800, { note: `${PREFIXE_TEST} temps réel` });
    await b.reload();
    await ecranPret(b, 'ventes');
    await b.getByRole('list', { name: 'Ventes' }).getByRole('button', { name: new RegExp(`^${vente.numero} · `) }).click();
    const detail = b.getByRole('dialog', { name: `Détail de la vente · ${vente.numero}` });
    await expect(detail.getByText('En attente').first()).toBeVisible();
    // A (propriétaire) annule la vente du caissier.
    expect((await boutique.api.post(`/ventes/${vente.ulid}/annuler`)).status).toBe(200);
    await expect(detail.getByText('Annulée').first()).toBeVisible({ timeout: 2_500 });
    await expect(detail).toBeVisible();
    await capturer(b, '18-temps-reel-fenetre-ouverte');
    // La liste derrière la fenêtre (masquée aux technologies d'assistance tant que la fenêtre est ouverte) est à jour aussi.
    await detail.getByRole('button', { name: 'Fermer' }).first().click();
    await expect(b.getByRole('list', { name: 'Ventes' }).getByRole('button', { name: new RegExp(`^${vente.numero} · .* · Annulée`) })).toBeVisible();
  });

  test('5. Un onglet caché se met à jour quand il redevient visible', async ({ ouvrir }) => {
    const { boutique, b } = await preparer(ouvrir, 'caissier', '/articles');
    await ecranPret(b, 'articles');
    const gets = compteur(b, /^\/api\/v1\/articles$/);
    await b.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect((await nouvelArticle(boutique, 'Onglet caché')).status).toBe(201);
    await fenetre(b, 2_500);
    expect(gets.n, 'aucun rechargement tant que l’onglet est caché').toBe(0);
    await expect(b.getByText(`${PREFIXE_TEST} Onglet caché`)).toHaveCount(0);
    await b.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(b.getByText(`${PREFIXE_TEST} Onglet caché`)).toBeVisible({ timeout: 2_500 });
    expect(gets.n).toBe(1);
  });

  test('6. Tour de tous les écrans pendant que des modifications arrivent, sans erreur JavaScript', async ({ ouvrir }) => {
    const { boutique, b } = await preparer(ouvrir, 'gerant', '/caisse');
    const ecrans: Array<[string, string]> = [
      ['/caisse', 'caisse'],
      ['/ventes', 'ventes'],
      ['/tableau-de-bord', 'tableau-de-bord'],
      ['/articles', 'articles'],
      ['/portefeuille', 'portefeuille'],
      ['/equipe', 'equipe'],
      ['/reglages', 'reglages'],
      ['/securite/2fa', 'securite-2fa'],
    ];
    let i = 0;
    for (const [chemin, ecran] of ecrans) {
      await b.goto(chemin);
      await ecranPret(b, ecran);
      // A écrit pendant que B est sur l'écran : article, vente, annulation, réglages.
      i += 1;
      if (i % 4 === 1) await nouvelArticle(boutique, `Tour ${i}`);
      if (i % 4 === 2) await creerVente(boutique.api, 100 * i);
      if (i % 4 === 3) await boutique.api.patch('/boutique', { reglages: { message_recu: `${PREFIXE_TEST} tour ${i}` } });
      if (i % 4 === 0) {
        const { vente } = await creerVente(boutique.api, 150);
        await boutique.api.post(`/ventes/${vente.ulid}/annuler`);
      }
      await expect(b.locator(`[data-ecran="${ecran}"]`)).toBeVisible();
    }
    // Réglages ouverts chez B (formulaire intact) : le renommage par A s'affiche sans recharger.
    await b.goto('/reglages');
    await ecranPret(b, 'reglages');
    const nouveauNom = `${boutique.nom.slice(0, 48)} renommée`;
    expect((await boutique.api.patch('/boutique', { nom: nouveauNom })).status).toBe(200);
    await expect(b.locator('#boutique').getByLabel('Nom de la boutique')).toHaveValue(nouveauNom, { timeout: 2_500 });
    // La surveillance (fixture `ouvrir`) vérifie à la fin : aucune erreur console, aucune réponse 4xx/5xx.
  });
});
