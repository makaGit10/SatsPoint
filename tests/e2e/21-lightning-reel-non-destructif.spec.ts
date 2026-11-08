import { capturer, ecranPret, expect, PREFIXE_TEST, test } from './fixtures';
import { attendreApi, taperMontant, toast } from './outils/ui';

/**
 * Parcours 21 — Lightning RÉEL, non destructif, sur la boutique démo (vrai portefeuille Coinos) :
 * vente de 100 FCFA → facture `lnbc…` réelle affichée en QR, aucun bouton de simulation, vérification
 * (lookup réel), puis ANNULATION. Aucun paiement, aucun envoi : seule une facture est créée puis abandonnée.
 * Un seul passage (bureau) : inutile de créer deux factures réelles.
 */
test.describe('21 · Lightning réel (boutique démo, sans paiement)', () => {
  test('facture réelle en QR puis annulation', async ({ pageDemo: page }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule facture réelle par exécution');
    test.setTimeout(120_000);
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await page.getByRole('button', { name: 'Note' }).click();
    await page.getByRole('textbox', { name: /^Note/ }).fill(`${PREFIXE_TEST} lightning reel`);
    await taperMontant(page, 100);
    await page.getByRole('button', { name: /^Encaisser/ }).click();
    const choix = page.getByRole('dialog', { name: 'Comment le client paie-t-il ?' });
    const creation = await attendreApi(page, 'POST', /\/api\/v1\/ventes$/, async () => {
      if (await choix.isVisible().catch(() => false)) await choix.getByRole('button', { name: /^Bitcoin/ }).click();
      else await choix.getByRole('button', { name: /^Bitcoin/ }).click({ timeout: 5_000 }).catch(() => undefined);
    });
    expect(creation.status(), 'création de la facture réelle (relais Nostr)').toBe(201);
    const vente = (await creation.json()).vente;
    const paiement = vente.paiements[0];
    expect(paiement.methode).toBe('lightning');
    expect(paiement.simule).toBe(false);
    expect(paiement.bolt11).toMatch(/^lnbc(?!rt)/);

    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.locator('[data-qr="pret"]')).toBeVisible();
    await expect(page.locator('[data-simuler]')).toHaveCount(0);
    await capturer(page, '21-lightning-reel-qr');
    const verif = await attendreApi(page, 'POST', /\/verifier$/, () => page.getByRole('button', { name: 'Vérifier le paiement' }).click());
    expect(verif.status()).toBe(200);
    await expect(toast(page, 'Vérifié : toujours en attente du paiement.')).toBeVisible();

    // Annulation : aucune somme attendue.
    await page.getByRole('button', { name: 'Annuler la vente' }).click();
    const annul = await attendreApi(page, 'POST', new RegExp(`/ventes/${vente.ulid}/annuler$`), () =>
      page.getByRole('dialog', { name: 'Annuler cette vente ?' }).getByRole('button', { name: /^Annuler la vente/ }).click(),
    );
    expect(annul.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Paiement annulé' })).toBeVisible();
  });
});
