import { ajouterMembreTest, capturer, creerVente, ecranPret, expect, test } from './fixtures';

/**
 * Parcours 07 — Tableau de bord : chiffres du jour (payées seulement), répartition bitcoin / mobile money,
 * périodes, dernières ventes et détail ; mise à jour en direct quand un caissier encaisse ; vue du caissier.
 */
test.describe('07 · Tableau de bord', () => {
  test('indicateurs, répartition, périodes, dernières ventes, temps réel, caissier', async ({ pageProprietaire: page, boutique, ouvrir }) => {
    await boutique.api.patch('/boutique', { reglages: { wave_lien: 'https://pay.wave.com/m/M_e2e_tdb/c/sn/', moyens: { lightning: true, paytech: false, wave_manuel: true } } });
    const lightning = await creerVente(boutique.api, 1000);
    expect((await boutique.api.post(`/paiements/${lightning.paiement.ulid}/simuler`)).status).toBe(200);
    const wave = await creerVente(boutique.api, 2000, { methode: 'wave_manuel' });
    expect((await boutique.api.post(`/paiements/${wave.paiement.ulid}/confirmer-manuellement`, { confirmation: true })).status).toBe(200);
    await creerVente(boutique.api, 5000); // en attente : hors chiffre d'affaires

    await page.goto('/tableau-de-bord');
    await ecranPret(page, 'tableau-de-bord');
    await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();
    const ecran = page.locator('[data-ecran="tableau-de-bord"]');
    await expect(ecran.getByText('Chiffre du jour')).toBeVisible();
    await expect(ecran).toContainText(/3\s?000\sFCFA/);
    await expect(ecran).toContainText(/1\s?500\sFCFA/); // panier moyen
    await expect(page.getByRole('img', { name: /Bitcoin 33\s?% · Mobile money 67\s?%/ })).toBeVisible();
    const dernieres = page.getByRole('list', { name: 'Dernières ventes' });
    await expect(dernieres.getByRole('button')).toHaveCount(3);
    await capturer(page, '07-tableau-de-bord');
    const api = await boutique.api.get('/tableau-de-bord?periode=aujourdhui');
    expect(api.json.chiffre_affaires_xof).toBe(3000);
    expect(api.json.nombre_ventes).toBe(2);
    expect(api.json.repartition.lightning.montant_xof).toBe(1000);
    expect(api.json.repartition.mobile_money.montant_xof).toBe(2000);

    // Périodes.
    const sept = page.waitForResponse((r) => r.url().includes('/api/v1/tableau-de-bord?periode=7j'));
    await page.getByRole('radio', { name: '7 jours' }).click();
    expect((await sept).status()).toBe(200);
    await expect(ecran.getByText("Chiffre d'affaires")).toBeVisible();
    await expect(page.getByRole('img', { name: 'Courbe du chiffre d\'affaires par jour' })).toBeVisible();
    const hier = page.waitForResponse((r) => r.url().includes('/api/v1/tableau-de-bord?periode=hier'));
    await page.getByRole('radio', { name: 'Hier' }).click();
    expect((await hier).status()).toBe(200);
    await expect(ecran.getByText('Aucune vente payée sur cette période.')).toBeVisible();
    await page.getByRole('radio', { name: "Aujourd'hui" }).click();

    // Détail depuis les dernières ventes, lien vers toutes les ventes.
    await dernieres.getByRole('button', { name: new RegExp(`^${wave.vente.numero} · `) }).click();
    const detail = page.getByRole('dialog', { name: `Détail de la vente · ${wave.vente.numero}` });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Fermer' }).first().click();
    await page.getByRole('link', { name: /^Voir toutes les ventes/ }).click();
    await expect(page).toHaveURL(/\/ventes$/);

    // Temps réel : un caissier encaisse, le tableau du propriétaire se met à jour sans rechargement.
    await page.goto('/tableau-de-bord');
    await ecranPret(page, 'tableau-de-bord');
    const caissier = await ajouterMembreTest(boutique, 'caissier');
    const v = await creerVente(caissier.api, 4000);
    expect((await caissier.api.post(`/paiements/${v.paiement.ulid}/simuler`)).status).toBe(200);
    await expect(ecran).toContainText(/7\s?000\sFCFA/, { timeout: 5_000 });
    await expect(dernieres.getByRole('button', { name: new RegExp(`^${v.vente.numero} · `) })).toBeVisible();

    // Vue du caissier : ses chiffres du jour seulement, pas de période.
    const { page: pageCaissier } = await ouvrir(caissier.etat);
    await pageCaissier.goto('/tableau-de-bord');
    await ecranPret(pageCaissier, 'tableau-de-bord');
    await expect(pageCaissier.getByText("Vos chiffres d'aujourd'hui")).toBeVisible();
    await expect(pageCaissier.getByRole('radiogroup', { name: 'Période' })).toHaveCount(0);
    await expect(pageCaissier.locator('[data-ecran="tableau-de-bord"]')).toContainText(/4\s?000\sFCFA/);
    await expect(pageCaissier.getByRole('list', { name: 'Dernières ventes' }).getByRole('button')).toHaveCount(1);
    await capturer(pageCaissier, '07-tableau-de-bord-caissier');
  });
});
