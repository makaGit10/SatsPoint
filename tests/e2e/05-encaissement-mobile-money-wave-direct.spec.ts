import { ajouterMembreTest, capturer, creerVente, ecranPret, expect, test } from './fixtures';
import { attendreApi, regexFCFA, taperMontant, toast } from './outils/ui';

/**
 * Parcours 05 — Mobile money par lien Wave direct : activation dans les réglages (validations), encaissement
 * avec choix du moyen, bascule bitcoin ↔ mobile money, confirmation manuelle par le propriétaire (deux sens),
 * caissier sans droit de confirmer, et confirmation depuis la liste des ventes vue en direct par le caissier.
 */
test.describe('05 · Mobile money — Wave direct', () => {
  test('réglage Wave → encaissement → bascule → confirmation manuelle ; caissier', async ({ pageProprietaire: page, boutique, ouvrir }) => {
    const lienWave = `https://pay.wave.com/m/M_e2e_${Date.now().toString(36)}/c/sn/`;
    await page.goto('/reglages');
    await ecranPret(page, 'reglages');
    const carte = page.locator('#paiements');
    await carte.getByRole('switch', { name: /^Wave direct/ }).click();
    await carte.getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(carte.getByText('Ce champ est obligatoire.')).toBeVisible();
    await carte.getByLabel(/^Lien Wave direct/).fill(lienWave);
    const enregistrement = await attendreApi(page, 'PATCH', /\/api\/v1\/boutique$/, () => carte.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(enregistrement.status()).toBe(200);
    await expect(toast(page, 'Réglages enregistrés')).toBeVisible();

    // Caisse : deux moyens → fenêtre de choix.
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await taperMontant(page, 2000);
    await page.getByRole('button', { name: /^Encaisser/ }).click();
    const choix = page.getByRole('dialog', { name: 'Comment le client paie-t-il ?' });
    await expect(choix).toBeVisible();
    await expect(choix.getByText(regexFCFA(2000)).first()).toBeVisible();
    await expect(choix.getByRole('button', { name: /^Bitcoin/ })).toBeEnabled();
    await capturer(page, '05-choix-moyen');
    const creation = await attendreApi(page, 'POST', /\/api\/v1\/ventes$/, () => choix.getByRole('button', { name: /^Wave direct/ }).click());
    expect(creation.status()).toBe(201);
    const vente = (await creation.json()).vente;

    // Écran Wave direct : lien, attente de confirmation, pas de simulation.
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.getByRole('tab', { name: /^Mobile money/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('En attente de confirmation')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ouvrir le lien Wave/ })).toHaveAttribute('href', /^https:\/\/pay\.wave\.com\/m\/.*amount=2000/);
    await expect(page.locator('[data-simuler]')).toHaveCount(0);
    await capturer(page, '05-paiement-wave-direct');

    // Bascule vers bitcoin (nouvelle tentative) puis retour au mobile money.
    const versBitcoin = await attendreApi(page, 'POST', new RegExp(`/ventes/${vente.ulid}/paiements$`), () => page.getByRole('tab', { name: /^Bitcoin/ }).click());
    expect(versBitcoin.status()).toBe(201);
    await expect(page.locator('[data-simuler]')).toBeVisible();
    const versMobile = await attendreApi(page, 'POST', new RegExp(`/ventes/${vente.ulid}/paiements$`), () => page.getByRole('tab', { name: /^Mobile money/ }).click());
    expect(versMobile.status()).toBe(201);
    expect((await versMobile.json()).paiement.methode).toBe('wave_manuel');

    // Confirmation manuelle : « Annuler » ne change rien, confirmer règle la vente.
    await page.getByRole('button', { name: /^Confirmer la réception/ }).click();
    const dialogue = page.getByRole('dialog', { name: /^Confirmer la réception de 2\s?000\sFCFA/ });
    await expect(dialogue).toBeVisible();
    await dialogue.getByRole('button', { name: /^Annuler/ }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await page.getByRole('button', { name: /^Confirmer la réception/ }).click();
    const conf = await attendreApi(page, 'POST', /\/confirmer-manuellement$/, () =>
      page.getByRole('dialog', { name: /^Confirmer la réception de/ }).getByRole('button', { name: /^Confirmer la réception/ }).click(),
    );
    expect(conf.status()).toBe(200);
    await expect(page.locator('[data-ecran="succes"]').getByText(/par Wave direct/)).toBeVisible();
    const lue = await boutique.api.get(`/ventes/${vente.ulid}`);
    expect(lue.json.vente.statut).toBe('payee');
    expect(lue.json.vente.methode_reussie).toBe('wave_manuel');
    expect(lue.json.vente.paiements).toHaveLength(3);

    // Caissier : vente Wave direct sans bouton de confirmation ; le propriétaire confirme depuis /ventes,
    // l'écran du caissier passe au vert sans rechargement.
    const caissier = await ajouterMembreTest(boutique, 'caissier');
    const { vente: venteCaissier, paiement } = await creerVente(caissier.api, 1200, { methode: 'wave_manuel' });
    const { page: pageCaissier } = await ouvrir(caissier.etat);
    await pageCaissier.goto(`/caisse/paiement/${paiement.ulid}`);
    await expect(pageCaissier.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(pageCaissier.getByText('En attente de confirmation')).toBeVisible();
    await expect(pageCaissier.getByRole('button', { name: /^Confirmer la réception/ })).toHaveCount(0);

    await page.goto('/ventes');
    await ecranPret(page, 'ventes');
    await page.getByRole('button', { name: new RegExp(`^${venteCaissier.numero} · `) }).click();
    const detail = page.getByRole('dialog', { name: `Détail de la vente · ${venteCaissier.numero}` });
    await detail.getByRole('button', { name: /^Confirmer la réception/ }).click();
    await page.getByRole('dialog', { name: /^Confirmer la réception de/ }).getByRole('button', { name: /^Confirmer la réception/ }).click();
    await expect(toast(page, 'Réception confirmée')).toBeVisible();
    await expect(pageCaissier.locator('[data-ecran="succes"]')).toBeVisible({ timeout: 5_000 });
  });
});
