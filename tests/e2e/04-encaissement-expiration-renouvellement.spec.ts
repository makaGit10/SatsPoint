import { capturer, ecranPret, expect, forcerExpiration, test } from './fixtures';
import { attendreApi, encaisser, taperMontant } from './outils/ui';

/**
 * Parcours 04 — Facture expirée puis renouvelée au cours actuel, et annulation depuis l'écran de paiement
 * (confirmation vérifiée dans les deux sens). L'expiration est faite par le serveur (`paiements:expirer`,
 * comme le planificateur) après avoir avancé l'échéance : aucune attente fixe.
 */
test.describe('04 · Expiration, renouvellement, annulation', () => {
  test('facture expirée → nouvelle demande → règlement ; vente annulée depuis l’écran', async ({ pageProprietaire: page, boutique }) => {
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await taperMontant(page, 1000);
    const vente = await encaisser(page);
    const premier = vente.paiements[0]!.ulid;
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');

    // Le serveur expire la facture : l'écran le voit (signal temps réel ou relecture de secours).
    forcerExpiration(premier);
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'expire');
    await expect(page.getByRole('heading', { name: 'Le délai de paiement est dépassé.' })).toBeVisible();
    await expect(page.getByText('Aucun paiement n\'a été reçu. Relancez une demande : elle sera calculée au cours actuel.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Changer de moyen de paiement/ })).toHaveCount(0);
    await capturer(page, '04-paiement-expire');

    // Nouvelle demande : nouvelle tentative, même vente.
    const nouvelle = await attendreApi(page, 'POST', new RegExp(`/ventes/${vente.ulid}/paiements$`), () => page.getByRole('button', { name: /^Nouvelle demande de paiement/ }).click());
    expect(nouvelle.status()).toBe(201);
    const second = (await nouvelle.json()).paiement.ulid as string;
    expect(second).not.toBe(premier);
    await expect(page).toHaveURL(new RegExp(`/caisse/paiement/${second}$`));
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.getByText(`Vente ${vente.numero}`)).toBeVisible();
    await expect(page.locator('[data-qr="pret"]')).toBeVisible();
    await page.locator('[data-simuler]').click();
    await expect(page.locator('[data-ecran="succes"]').getByRole('heading', { name: 'Paiement reçu' })).toBeVisible();

    // Détail : deux tentatives, « Expiré » puis « Réussi ».
    await page.goto(`/ventes?vente=${vente.ulid}`);
    const detail = page.getByRole('dialog', { name: `Détail de la vente · ${vente.numero}` });
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(/\/ventes$/);
    await expect(detail.getByText('Expiré', { exact: true })).toBeVisible();
    await expect(detail.getByText('Réussi', { exact: true })).toBeVisible();
    await capturer(page, '04-detail-deux-tentatives');
    const api = await boutique.api.get(`/ventes/${vente.ulid}`);
    expect(api.json.vente.paiements.map((p: { statut: string }) => p.statut).sort()).toEqual(['expire', 'reussi']);

    // Annulation depuis l'écran de paiement : « Garder la vente » ne change rien, confirmer annule.
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await taperMontant(page, 700);
    const aAnnuler = await encaisser(page);
    await page.getByRole('button', { name: 'Annuler la vente' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Annuler cette vente ?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: /^Garder la vente/ }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await page.getByRole('button', { name: 'Annuler la vente' }).click();
    const annulation = await attendreApi(page, 'POST', new RegExp(`/ventes/${aAnnuler.ulid}/annuler$`), () =>
      page.getByRole('dialog', { name: 'Annuler cette vente ?' }).getByRole('button', { name: /^Annuler la vente/ }).click(),
    );
    expect(annulation.status()).toBe(200);
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'annule');
    await expect(page.getByRole('heading', { name: 'Paiement annulé' })).toBeVisible();
    await capturer(page, '04-paiement-annule');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Paiement annulé' })).toBeVisible();
    await page.getByRole('button', { name: /^Nouvelle vente/ }).click();
    await expect(page).toHaveURL(/\/caisse$/);
    expect((await boutique.api.get(`/ventes/${aAnnuler.ulid}`)).json.vente.statut).toBe('annulee');
  });
});
