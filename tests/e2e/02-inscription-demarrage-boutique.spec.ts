import { capturer, ClientApi, ecranPret, expect, PREFIXE_TEST, suffixe, telephoneTest, test } from './fixtures';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 02 — Inscription puis démarrage guidé complet : compte → boutique → portefeuille (simulé) →
 * mobile money passé → paiement test de 100 FCFA → « Votre caisse est prête ».
 * Seul parcours qui crée sa boutique par l'interface (10 inscriptions / heure / IP côté serveur).
 */
test.describe('02 · Inscription et démarrage guidé', () => {
  test('inscription → 4 étapes → paiement test → caisse prête', async ({ ouvrir }) => {
    const { page, surveillance } = await ouvrir(undefined);
    surveillance.tolerer(/\/api\/v1\/boutique\/wallet$/, 422); // URI volontairement invalide
    const s = suffixe();
    const telephone = telephoneTest();
    const motDePasse = `Tz${s}!Kp${Math.random().toString(36).slice(2, 10)}`;
    const nomBoutique = `${PREFIXE_TEST} Boutique ${s}`.slice(0, 60);

    await page.goto('/inscription');
    await expect(page.getByRole('heading', { name: 'Créer ma boutique', level: 1 })).toBeVisible();
    // Validation côté client.
    await page.getByRole('button', { name: /^Créer mon compte/ }).click();
    await expect(page.getByText('Ce champ est obligatoire.').first()).toBeVisible();
    await expect(page.getByText('Le mot de passe doit contenir au moins 12 caractères.')).toBeVisible();
    await page.getByLabel('Votre nom').fill(`${PREFIXE_TEST} Awa ${s}`);
    await page.getByLabel('Téléphone ou e-mail').fill(telephone);
    await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
    // Le champ de confirmation est en cours de suppression (inscription simplifiée) : vérifié seulement s'il existe.
    const confirmation = page.getByLabel('Confirmez le mot de passe');
    if (await confirmation.count()) {
      await confirmation.fill(`${motDePasse}x`);
      await page.getByRole('button', { name: /^Créer mon compte/ }).click();
      await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible();
      await confirmation.fill(motDePasse);
    }
    await capturer(page, '02-inscription');
    const inscription = await attendreApi(page, 'POST', /\/auth\/inscription$/, () => page.getByRole('button', { name: /^Créer mon compte/ }).click());
    expect(inscription.status()).toBe(201);
    await expect(toast(page, 'Votre compte est créé. Bienvenue !')).toBeVisible();

    // Démarrage : 0 / 4, étape 1 ouverte, menu réduit au démarrage.
    await expect(page).toHaveURL(/\/demarrage$/);
    await ecranPret(page, 'demarrage');
    await expect(page.getByText('0 / 4 étapes')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Démarrage guidé' })).toHaveAttribute('aria-valuenow', '0');
    await capturer(page, '02-demarrage-etape1');

    // Étape 1 : boutique.
    await page.getByLabel('Nom de la boutique').fill('');
    await page.getByRole('button', { name: /^Créer ma boutique/ }).click();
    await expect(page.getByText('Ce champ est obligatoire.').first()).toBeVisible();
    await page.getByLabel('Nom de la boutique').fill(nomBoutique);
    await expect(page.getByLabel('Ville')).toHaveValue('Dakar');
    const creation = await attendreApi(page, 'POST', /\/api\/v1\/boutique$/, () => page.getByRole('button', { name: /^Créer ma boutique/ }).click());
    expect(creation.status()).toBe(201);
    // La session reste ouverte (le serveur renvoie { boutique, utilisateur }).
    await expect(page).toHaveURL(/\/demarrage$/);
    await expect(page.getByText('1 / 4 étapes')).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^1\\. Ma boutique ${nomBoutique.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBeVisible();

    // Étape 2 : portefeuille (URI invalide puis portefeuille simulé).
    const champUri = page.getByLabel('Lien Nostr Wallet Connect');
    await page.getByRole('button', { name: /^Connecter mon portefeuille/ }).click();
    await expect(page.getByText('Ce champ est obligatoire.').first()).toBeVisible();
    await champUri.fill('nostr+walletconnect://abc');
    const refus = await attendreApi(page, 'PUT', /\/boutique\/wallet$/, () => page.getByRole('button', { name: /^Connecter mon portefeuille/ }).click());
    expect(refus.status()).toBe(422);
    await expect(page.getByRole('alert').first()).toBeVisible();
    await champUri.fill(`mock://e2e-${s}`);
    const connexion = await attendreApi(page, 'PUT', /\/boutique\/wallet$/, () => page.getByRole('button', { name: /^Connecter mon portefeuille/ }).click());
    expect(connexion.status()).toBe(200);
    await expect(toast(page, 'Portefeuille connecté')).toBeVisible();
    await expect(page.getByText('2 / 4 étapes')).toBeVisible();

    // Étape 3 : mobile money facultatif → passer.
    await page.getByRole('button', { name: /^Passer cette étape/ }).click();
    await capturer(page, '02-demarrage-etape4');

    // Étape 4 : paiement test 100 FCFA, réglé en simulé → « Votre caisse est prête ! ».
    const vente = await attendreApi(page, 'POST', /\/api\/v1\/ventes$/, () => page.getByRole('button', { name: /^Lancer le paiement test/ }).click());
    expect(vente.status()).toBe(201);
    await expect(page).toHaveURL(/\/caisse\/paiement\/[0-9A-Z]{26}\?test=1$/);
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.locator('[data-qr="pret"]')).toBeVisible();
    const patch = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/api/v1/boutique');
    await page.locator('[data-simuler]').click();
    await expect(page.locator('[data-ecran="succes"]').getByRole('heading', { name: 'Votre caisse est prête !' })).toBeVisible();
    expect((await patch).status()).toBe(200);
    await capturer(page, '02-paiement-test-reussi');
    await page.getByRole('button', { name: /^Aller à la caisse/ }).click();
    await expect(page).toHaveURL(/\/caisse$/);
    await ecranPret(page, 'caisse');
    await expect(page.locator('[data-bandeau="demarrage"]')).toHaveCount(0);

    // Donnée enregistrée : rechargement, configuration complète côté serveur.
    await page.reload();
    await ecranPret(page, 'caisse');
    const api = await ClientApi.connecte({ identifiant: telephone, motDePasse });
    const boutique = await api.get('/boutique');
    expect(boutique.json.boutique.nom).toBe(nomBoutique);
    expect(boutique.json.boutique.configuration).toEqual({ wallet: true, paytech: false, paiement_test: true });
    await api.fermer();

    await page.goto('/demarrage');
    await expect(page.getByRole('heading', { name: 'Votre caisse est prête' })).toBeVisible();
  });
});
