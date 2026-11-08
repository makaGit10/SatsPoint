import { ajouterMembreTest, capturer, ecranPret, expect, suffixe, test, tolerer } from './fixtures';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 08 — Portefeuille (boutique de test, portefeuille SIMULÉ uniquement) : solde, recevoir (QR),
 * envoyer en 4 étapes (aperçu, mot de passe faux puis bon, résultat, historique), solde insuffisant,
 * scanner indisponible, révocation (deux sens) et reconnexion ; vue du gérant.
 */
test.describe('08 · Portefeuille', () => {
  test('recevoir, envoyer, erreurs, révoquer, reconnecter', async ({ pageProprietaire: page, boutique, ouvrir }) => {
    test.setTimeout(180_000);
    tolerer(page, /\/wallet\/envoyer$/, 422); // mot de passe faux, solde insuffisant (volontaires)
    await page.goto('/portefeuille');
    await ecranPret(page, 'portefeuille');
    await expect(page.getByRole('heading', { name: 'Portefeuille', level: 1 })).toBeVisible();
    await expect(page.getByText('Connecté').first()).toBeVisible();
    await expect(page.getByText(/100\s?000\ssats/).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Autorisations' })).toContainText('pay_invoice');
    await capturer(page, '08-portefeuille');

    // Recevoir : validation, demande en FCFA, QR, copie.
    await page.getByRole('button', { name: /^Recevoir/ }).click();
    const recevoir = page.getByRole('dialog', { name: 'Recevoir des sats' });
    await recevoir.getByRole('button', { name: /^Créer la demande/ }).click();
    await expect(recevoir.getByText('Ce champ est obligatoire.')).toBeVisible();
    await recevoir.getByLabel('Montant en FCFA').fill('500');
    const demande = await attendreApi(page, 'POST', /\/wallet\/recevoir$/, () => recevoir.getByRole('button', { name: /^Créer la demande/ }).click());
    expect(demande.status()).toBe(201);
    const facture = (await demande.json()).bolt11 as string;
    expect(facture.toLowerCase()).toMatch(/^lnbc/);
    await expect(recevoir.getByRole('img', { name: 'Code QR de la demande' })).toBeVisible();
    await expect(recevoir.getByText(/500\sFCFA/)).toBeVisible();
    await recevoir.getByRole('button', { name: 'Copier la demande' }).click();
    await expect(toast(page, 'Demande copiée')).toBeVisible();
    await capturer(page, '08-recevoir-qr');
    await recevoir.getByRole('button', { name: 'Fermer' }).first().click();

    // Envoyer : destination invalide, aperçu, mot de passe faux, puis envoi réussi.
    await page.getByRole('button', { name: /^Envoyer/ }).click();
    const envoyer = page.getByRole('dialog', { name: 'Envoyer des sats' });
    await envoyer.getByRole('button', { name: /^Aperçu/ }).click();
    await expect(envoyer.getByText('Ce champ est obligatoire.')).toBeVisible();
    await envoyer.getByLabel('Facture ou adresse Lightning').fill(facture);
    const apercu = await attendreApi(page, 'POST', /\/wallet\/envoyer\/apercu$/, () => envoyer.getByRole('button', { name: /^Aperçu/ }).click());
    expect(apercu.status()).toBe(200);
    await expect(envoyer.getByText('Destinataire')).toBeVisible();
    await expect(envoyer.getByText('Frais estimés')).toBeVisible();
    await envoyer.getByRole('button', { name: /^Continuer/ }).click();
    await expect(envoyer.getByRole('button', { name: /^Confirmer l'envoi/ })).toBeDisabled();
    await envoyer.getByLabel('Votre mot de passe pour confirmer').fill('mauvais-mot-de-passe');
    const refus = await attendreApi(page, 'POST', /\/wallet\/envoyer$/, () => envoyer.getByRole('button', { name: /^Confirmer l'envoi/ }).click());
    expect(refus.status()).toBe(422);
    expect((await refus.json()).code).toBe('MOT_DE_PASSE_INCORRECT');
    await expect(envoyer.getByRole('alert').first()).toBeVisible();
    await capturer(page, '08-envoi-mot-de-passe-incorrect');
    await envoyer.getByRole('button', { name: /^Réessayer/ }).click();
    await envoyer.getByLabel('Votre mot de passe pour confirmer').fill(boutique.compte.motDePasse);
    const envoi = await attendreApi(page, 'POST', /\/wallet\/envoyer$/, () => envoyer.getByRole('button', { name: /^Confirmer l'envoi/ }).click());
    expect(envoi.status()).toBe(200);
    await expect(envoyer.getByText('Envoi effectué')).toBeVisible();
    await capturer(page, '08-envoi-effectue');
    await envoyer.getByRole('button', { name: /^Fermer/ }).last().click();
    await expect(page.getByRole('list', { name: 'Historique' }).getByRole('img', { name: 'Envoyé' }).first()).toBeVisible();

    // Solde insuffisant : facture de 200 000 sats créée par l'API (portefeuille simulé : 100 000 sats).
    const grosse = await boutique.api.post('/wallet/recevoir', { montant_sats: 200_000 });
    expect(grosse.status).toBe(201);
    await page.getByRole('button', { name: /^Envoyer/ }).click();
    const envoyer2 = page.getByRole('dialog', { name: 'Envoyer des sats' });
    await envoyer2.getByLabel('Facture ou adresse Lightning').fill(grosse.json.bolt11);
    await envoyer2.getByRole('button', { name: /^Aperçu/ }).click();
    await envoyer2.getByRole('button', { name: /^Continuer/ }).click();
    await envoyer2.getByLabel('Votre mot de passe pour confirmer').fill(boutique.compte.motDePasse);
    const insuffisant = await attendreApi(page, 'POST', /\/wallet\/envoyer$/, () => envoyer2.getByRole('button', { name: /^Confirmer l'envoi/ }).click());
    expect(insuffisant.status()).toBe(422);
    expect((await insuffisant.json()).code).toBe('SOLDE_INSUFFISANT');
    await expect(envoyer2.getByText(/Solde insuffisant|Il vous manque/)).toBeVisible();
    await envoyer2.getByRole('button', { name: /^Modifier le montant/ }).click();
    await expect(envoyer2.getByLabel('Facture ou adresse Lightning')).toBeVisible();

    // Scanner : caméra indisponible en navigateur sans tête.
    await envoyer2.getByRole('button', { name: /^Scanner un code/ }).click();
    await expect(page.getByRole('dialog', { name: 'Scanner un code' }).getByText(/caméra n'est pas disponible|collez le code/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Révoquer : annuler ne change rien, confirmer coupe ; puis reconnexion.
    await page.goto('/portefeuille');
    await ecranPret(page, 'portefeuille');
    await page.getByRole('button', { name: /^Révoquer/ }).click();
    const revoquer = page.getByRole('dialog', { name: 'Révoquer la connexion ?' });
    await revoquer.getByRole('button', { name: /^Annuler/ }).click();
    await expect(revoquer).toBeHidden();
    expect((await boutique.api.get('/wallet')).json.connecte).toBe(true);
    await page.getByRole('button', { name: /^Révoquer/ }).click();
    const revocation = await attendreApi(page, 'DELETE', /\/boutique\/wallet$/, () => page.getByRole('dialog', { name: 'Révoquer la connexion ?' }).getByRole('button', { name: /^Révoquer/ }).click());
    expect(revocation.status()).toBe(204);
    await expect(toast(page, 'Connexion révoquée')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Recevoir/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Envoyer/ })).toBeDisabled();
    await capturer(page, '08-portefeuille-non-connecte');
    await page.getByLabel('Lien Nostr Wallet Connect').fill(`mock://e2e-${suffixe()}`);
    const reconnexion = await attendreApi(page, 'PUT', /\/boutique\/wallet$/, () => page.getByRole('button', { name: /^Connecter mon portefeuille/ }).click());
    expect(reconnexion.status()).toBe(200);
    await expect(toast(page, 'Portefeuille connecté')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Recevoir/ })).toBeEnabled();
    await page.reload();
    await ecranPret(page, 'portefeuille');
    await expect(page.getByRole('button', { name: /^Révoquer/ })).toBeVisible();

    // Gérant : pas d'envoi ni de révocation ; l'API refuse.
    const gerant = await ajouterMembreTest(boutique, 'gerant');
    const { page: pageGerant } = await ouvrir(gerant.etat);
    await pageGerant.goto('/portefeuille');
    await ecranPret(pageGerant, 'portefeuille');
    await expect(pageGerant.getByText('Seul le propriétaire peut envoyer des sats.')).toBeVisible();
    await expect(pageGerant.getByRole('button', { name: /^Envoyer/ })).toHaveCount(0);
    await expect(pageGerant.getByRole('button', { name: /^Révoquer/ })).toHaveCount(0);
    expect((await gerant.api.post('/wallet/envoyer/apercu', { destination: facture })).status).toBe(403);
  });
});
