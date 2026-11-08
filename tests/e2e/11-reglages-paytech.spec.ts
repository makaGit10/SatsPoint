import { ajouterMembreTest, capturer, ecranPret, expect, PREFIXE_TEST, test, tolerer } from './fixtures';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 11 — Réglages : boutique (validation, enregistrement, persistance), moyens de paiement
 * (plafond, message de reçu, refus « aucun moyen »), PayTech (clés factices, test de connexion → mode simulé,
 * encaissement Orange Money simulé, suppression des clés dans les deux sens), préférences, ancre, gérant.
 */
test.describe('11 · Réglages et PayTech', () => {
  test('boutique, moyens, PayTech, préférences', async ({ pageProprietaire: page, boutique, ouvrir }) => {
    test.setTimeout(180_000);
    tolerer(page, /\/api\/v1\/boutique$/, 422); // tous les moyens coupés (volontaire)
    await page.goto('/reglages');
    await ecranPret(page, 'reglages');
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await capturer(page, '11-reglages');

    // Ma boutique.
    const carteBoutique = page.locator('#boutique');
    const nom = carteBoutique.getByLabel('Nom de la boutique');
    await nom.fill('');
    await carteBoutique.getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(carteBoutique.getByText('Ce champ est obligatoire.')).toBeVisible();
    const nouveauNom = `${boutique.nom.slice(0, 50)} modif`;
    await nom.fill(nouveauNom);
    const patchNom = await attendreApi(page, 'PATCH', /\/api\/v1\/boutique$/, () => carteBoutique.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(patchNom.status()).toBe(200);
    await expect(toast(page, 'Réglages enregistrés')).toBeVisible();

    // Moyens de paiement : plafond invalide, message du reçu, refus de tout couper.
    const moyens = page.locator('#paiements');
    await moyens.getByLabel('Montant maximum par vente').fill('50');
    await moyens.getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(moyens.getByText("Le montant doit être d'au moins 100 FCFA.")).toBeVisible();
    await moyens.getByLabel('Montant maximum par vente').fill('500000');
    await moyens.getByLabel(/^Message sur le reçu/).fill(`${PREFIXE_TEST} merci`);
    await expect(moyens.getByText(/\d+\/160/)).toBeVisible();
    const patchMoyens = await attendreApi(page, 'PATCH', /\/api\/v1\/boutique$/, () => moyens.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(patchMoyens.status()).toBe(200);
    await expect(moyens.getByRole('switch', { name: /^Mobile money \(PayTech\)/ })).toBeDisabled(); // PayTech non configuré
    await expect(toast(page, 'Réglages enregistrés').first()).toBeVisible();
    await page.reload(); // la carte est remontée après chaque enregistrement (relecture de la boutique)
    await ecranPret(page, 'reglages');
    const moyens2 = page.locator('#paiements');
    await moyens2.getByRole('switch', { name: /^Bitcoin \(Lightning\)/ }).click();
    let patchEnvoye = false;
    page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().endsWith('/api/v1/boutique')) patchEnvoye = true; });
    await moyens2.getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(moyens2.getByText('Au moins un moyen de paiement doit rester actif.')).toBeVisible();
    expect(patchEnvoye).toBe(false);
    const serveur = await boutique.api.patch('/boutique', { reglages: { moyens: { lightning: false, paytech: false, wave_manuel: false } } });
    expect(serveur.status).toBe(422); // le serveur refuse aussi

    // Persistance après rechargement.
    await page.reload();
    await ecranPret(page, 'reglages');
    await expect(page.locator('#boutique').getByLabel('Nom de la boutique')).toHaveValue(nouveauNom);
    await expect(page.locator('#paiements').getByLabel('Montant maximum par vente')).toHaveValue(/500\s?000/);
    const lue = await boutique.api.get('/boutique');
    expect(lue.json.boutique.reglages.montant_max_xof).toBe(500000);
    expect(lue.json.boutique.reglages.message_recu).toBe(`${PREFIXE_TEST} merci`);

    // PayTech : validation, clés factices, test de connexion.
    const paytech = page.locator('#paytech');
    await expect(paytech.getByText('Non configuré')).toBeVisible();
    await paytech.getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(paytech.getByText('Ce champ est obligatoire.')).toHaveCount(2);
    await paytech.getByLabel('Clé API').fill('TESTE2Ekey12345678');
    await paytech.getByLabel('Secret API').fill('TESTE2Esecret12345678');
    await paytech.getByRole('radio', { name: 'Test' }).click();
    const put = await attendreApi(page, 'PUT', /\/boutique\/paytech$/, () => paytech.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(put.status()).toBe(200);
    await expect(paytech.getByText(/Configuré · Test/)).toBeVisible();
    await expect(paytech.getByText('Laissez vide pour conserver la valeur enregistrée.').first()).toBeVisible();
    await expect(paytech.getByLabel('Clé API')).toHaveValue(''); // jamais réaffichée

    // Supprimer les clés : annuler ne change rien, confirmer supprime.
    await page.goto('/reglages#paytech');
    await ecranPret(page, 'reglages');
    await expect(page.locator('#paytech')).toBeInViewport();
    await page.locator('#paytech').getByRole('button', { name: /^Supprimer les clés/ }).click();
    const suppr = page.getByRole('dialog', { name: 'Supprimer les clés PayTech ?' });
    await suppr.getByRole('button', { name: /^Annuler/ }).click();
    await expect(page.locator('#paytech').getByText(/Configuré · Test/)).toBeVisible();
    await page.locator('#paytech').getByRole('button', { name: /^Supprimer les clés/ }).click();
    const del = await attendreApi(page, 'DELETE', /\/boutique\/paytech$/, () => page.getByRole('dialog', { name: 'Supprimer les clés PayTech ?' }).getByRole('button', { name: /^Supprimer les clés/ }).click());
    expect(del.status()).toBe(204);
    await expect(page.locator('#paytech').getByText('Non configuré')).toBeVisible();

    // Nouvelles clés factices puis « Tester la connexion » : PayTech les refuse → compte en erreur.
    await page.locator('#paytech').getByLabel('Clé API').fill('TESTE2Ekey12345678');
    await page.locator('#paytech').getByLabel('Secret API').fill('TESTE2Esecret12345678');
    await page.locator('#paytech').getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(page.locator('#paytech').getByText(/Configuré · Test/)).toBeVisible();
    const verif = await attendreApi(page, 'POST', /\/boutique\/paytech\/verifier$/, () => page.locator('#paytech').getByRole('button', { name: /^Tester la connexion/ }).click());
    expect(verif.status()).toBe(200);
    expect((await verif.json()).ok).toBe(false); // clés factices : refusées par PayTech
    await expect(toast(page, 'Tester la connexion')).toBeVisible();
    const apres = await boutique.api.get('/boutique');
    expect(apres.json.boutique.paytech.configure).toBe(false);

    // Compte en erreur : les tentatives PayTech créées par l'API passent en mode simulé (CONTRAT § 8) ;
    // l'écran de paiement mobile money est vérifié sur cette tentative (l'interface ne propose plus PayTech, à raison).
    const vente = await boutique.api.post('/ventes', { montant_xof: 1000, methode: 'paytech', operateur: 'orange_money' });
    expect(vente.status, vente.texte).toBe(201);
    const p = vente.json.vente.paiements[0];
    expect(p.methode).toBe('paytech');
    expect(p.simule).toBe(true);
    await page.goto(`/caisse/paiement/${p.ulid}`);
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.getByRole('tab', { name: /^Mobile money/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: /^Ouvrir la page de paiement/ })).toHaveAttribute('href', /paiement-simule|paytech/);
    await capturer(page, '11-paiement-paytech-simule');
    await page.locator('[data-simuler]').click();
    await expect(page.locator('[data-ecran="succes"]').getByText(/Orange Money/)).toBeVisible();
    await page.goto('/reglages');
    await ecranPret(page, 'reglages');

    // Préférences : thème sombre enregistré sur le compte.
    const prefs = page.locator('#preferences');
    const patchPref = await attendreApi(page, 'PATCH', /\/moi\/preferences$/, () => prefs.getByRole('radio', { name: 'Sombre' }).click());
    expect(patchPref.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
    await capturer(page, '11-reglages-sombre');
    await prefs.getByRole('radio', { name: 'Automatique' }).click();

    // Gérant : pas de PayTech, l'API refuse.
    const gerant = await ajouterMembreTest(boutique, 'gerant');
    const { page: pageGerant } = await ouvrir(gerant.etat);
    await pageGerant.goto('/reglages');
    await ecranPret(pageGerant, 'reglages');
    await expect(pageGerant.locator('#paytech').getByText('Cette page est réservée au propriétaire de la boutique.')).toBeVisible();
    await expect(pageGerant.locator('#paytech').getByLabel('Clé API')).toHaveCount(0);
    expect((await gerant.api.put('/boutique/paytech', { api_key: 'aaaaaaaa', api_secret: 'bbbbbbbb', environnement: 'test' })).status).toBe(403);
  });
});
