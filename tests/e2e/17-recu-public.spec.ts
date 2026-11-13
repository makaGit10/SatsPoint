import { capturer, ClientApi, creerVente, expect, PREFIXE_TEST, test } from './fixtures';

/**
 * Parcours 17 — Reçu public : lien non devinable lisible sans compte ni choix de langue, contenu exact
 * (boutique, montant, sats, moyen, n°, date, message), aucune donnée personnelle, impression, anglais,
 * jetons inconnus → « introuvable », vente non payée → pas de reçu.
 */
test.describe('17 · Reçu public', () => {
  test('reçu d’une vente payée, sans session ; jetons invalides', async ({ boutique, ouvrir }) => {
    expect((await boutique.api.patch('/boutique', { reglages: { message_recu: `${PREFIXE_TEST} merci` } })).status).toBe(200);
    const { vente, paiement } = await creerVente(boutique.api, 1500);
    expect((await boutique.api.get(`/ventes/${vente.ulid}`)).json.vente.recu_url).toBeNull(); // pas encore payée
    await boutique.api.post(`/paiements/${paiement.ulid}/simuler`);
    const recuUrl: string = (await boutique.api.get(`/ventes/${vente.ulid}`)).json.vente.recu_url;
    expect(recuUrl).toMatch(/^\/r\/[A-Za-z0-9]{32}$/);

    // API publique : JSON sans donnée personnelle.
    const anonyme = await ClientApi.anonyme();
    const json = await anonyme.get(recuUrl);
    expect(json.status).toBe(200);
    expect(Object.keys(json.json).sort()).toEqual(['alerte', 'boutique', 'lignes', 'message', 'methode', 'montant_sats', 'montant_xof', 'moyen', 'numero', 'operateur', 'paye_le', 'statut'].sort());
    expect(json.texte).not.toContain(boutique.compte.identifiant);
    await anonyme.fermer();

    // Visiteur sans aucune préférence : pas de détour par le choix de la langue.
    const { page, surveillance } = await ouvrir(undefined, { premierLancement: true });
    surveillance.tolerer(/\/r\/[A-Za-z0-9]+$/, 404);
    await page.addInitScript(() => {
      (window as unknown as { __impressions: number }).__impressions = 0;
      window.print = () => {
        (window as unknown as { __impressions: number }).__impressions += 1;
      };
    });
    await page.goto(recuUrl);
    await expect(page).toHaveURL(new RegExp(`${recuUrl}$`));
    const recu = page.locator('[data-ecran="recu"]');
    await expect(recu).toBeVisible();
    await expect(page.locator('[data-chargement]')).toHaveCount(0);
    await expect(recu).toContainText(boutique.nom);
    await expect(recu).toContainText(/1\s?500\sFCFA/);
    await expect(recu).toContainText(/soit\s[\d\s]+\ssats/);
    await expect(recu).toContainText('Payée');
    await expect(recu).toContainText(vente.numero);
    await expect(recu).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    await expect(recu).toContainText(`${PREFIXE_TEST} merci`);
    await expect(recu).toContainText('Bitcoin');
    await expect(recu).toContainText('Reçu généré par SatsPoint');
    await expect(recu).not.toContainText(boutique.compte.identifiant);
    await capturer(page, '17-recu');

    await page.getByRole('button', { name: /^Imprimer/ }).click();
    expect(await page.evaluate(() => (window as unknown as { __impressions: number }).__impressions)).toBe(1);
    await page.getByRole('group', { name: /Langue de l'interface/ }).getByRole('button', { name: 'English' }).click();
    await expect(recu).toContainText('Paid');
    await capturer(page, '17-recu-en');

    // Jetons inconnus ou mal formés : écran « introuvable », aucun détail technique.
    for (const jeton of ['A'.repeat(32), 'abc']) {
      await page.goto(`/r/${jeton}`);
      await expect(page.getByRole('heading', { name: /receipt cannot be found|reçu est introuvable/i })).toBeVisible();
    }
  });
});
