import { ClientApi, capturer, ecranPret, expect, PREFIXE_TEST, suffixe, test, tolerer } from './fixtures';
import { superAdminValide } from './outils/admin';
import { attendreApi, taperMontant, toast } from './outils/ui';

/**
 * Parcours 23 — Autres pays de la zone XOF (CONTRAT_API § 14) :
 * - console : la super-admin ajoute une langue (puis la supprime : aucun audio) et un moyen de paiement au Togo ;
 * - boutique de test : le propriétaire passe la boutique au Togo, active le moyen avec SON numéro marchand ;
 * - caisse : le moyen est proposé, l'écran de paiement affiche le numéro en grand, confirmation manuelle → reçu ;
 * - garde-fous : moyen d'un autre pays → 404 (anti-IDOR), moyen déjà utilisé → 409 MOYEN_UTILISE ;
 * - écran de langue : sélecteur de pays, tuiles du pays + Français + English.
 * Données préfixées TEST-E2E (moyen et boutique supprimés par `e2e:nettoyer`) ; la langue de test est supprimée par le test.
 */
test.describe('23 · Pays, langues et moyens de paiement par pays', () => {
  test('console → réglages → caisse → paiement manuel avec un moyen du Togo', async ({ ouvrir, pageProprietaire: page, boutique }) => {
    test.setTimeout(180_000);
    const admin = await superAdminValide();
    const { page: console_ } = await ouvrir(admin.etat);

    // ---- Langue : ajout, puis suppression (aucun audio) ----
    const code = `zq${suffixe().replace(/[^a-z]/g, '').slice(0, 4) || 'abc'}`.slice(0, 8);
    await console_.goto('/admin?onglet=langues');
    await ecranPret(console_, 'admin');
    await expect(console_.locator('[data-vue="langues"] [data-langue="wo"]')).toBeVisible();
    await console_.getByRole('button', { name: /^Ajouter une langue/ }).click();
    const formLangue = console_.locator('[data-formulaire-langue]');
    await formLangue.getByLabel('Code').fill(code);
    await formLangue.getByLabel('Nom dans la langue').fill('TEST-E2E Langue');
    await formLangue.getByLabel('Nom en français').fill('TEST-E2E Langue');
    await formLangue.getByLabel('Nom en anglais').fill('TEST-E2E Language');
    await formLangue.locator('[data-choix-pays] label', { hasText: 'Togo' }).click();
    const creationLangue = await attendreApi(console_, 'POST', /\/api\/v1\/admin\/langues$/, () => formLangue.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(creationLangue.status()).toBe(201);
    await expect(toast(console_, 'Langue ajoutée')).toBeVisible();
    const ligneLangue = console_.locator(`[data-langue="${code}"]`);
    await expect(ligneLangue).toContainText('Togo');
    await capturer(console_, '23-console-langues');
    // Sa clé vocale « langue.{code} » est enregistrable au studio.
    const matrice = await admin.api.get('/admin/audio/matrice');
    expect(matrice.json.cles.some((c: { cle: string }) => c.cle === `langue.${code}`)).toBe(true);
    expect(matrice.json.langues.some((l: { code: string }) => l.code === code)).toBe(true);
    await ligneLangue.getByRole('button', { name: /^Supprimer la langue/ }).click();
    const suppression = await attendreApi(console_, 'DELETE', new RegExp(`/admin/langues/${code}$`), () => console_.getByRole('dialog').getByRole('button', { name: /^Supprimer la langue/ }).click());
    expect(suppression.status()).toBe(204);
    await expect(ligneLangue).toHaveCount(0);

    // ---- Moyen de paiement au Togo ----
    const nomMoyen = `${PREFIXE_TEST} Moyen`.slice(0, 40);
    await console_.getByRole('tab', { name: /Moyens de paiement|Paiements/ }).click();
    await expect(console_).toHaveURL(/onglet=moyens/);
    await console_.locator('select[data-filtre-pays]').selectOption('TG');
    await expect(console_.locator('[data-vue="moyens"] [data-moyen="Flooz"]')).toBeVisible();
    await console_.getByRole('button', { name: /^Ajouter un moyen/ }).click();
    const formMoyen = console_.locator('[data-formulaire-moyen]');
    await formMoyen.getByLabel('Nom').fill(nomMoyen);
    await formMoyen.getByRole('radio', { name: 'Vert' }).click();
    await formMoyen.getByLabel('Instructions (français)').fill('Payez au numéro affiché, puis montrez le message reçu.');
    const creationMoyen = await attendreApi(console_, 'POST', /\/api\/v1\/admin\/moyens-paiement$/, () => formMoyen.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(creationMoyen.status()).toBe(201);
    const moyen = (await creationMoyen.json()).moyen as { ulid: string; pays: string; type: string };
    expect(moyen).toMatchObject({ pays: 'TG', type: 'numero' });
    await expect(toast(console_, 'Moyen ajouté')).toBeVisible();
    await capturer(console_, '23-console-moyens');

    // ---- Propriétaire : la boutique passe au Togo, le moyen s'active avec son numéro ----
    await page.goto('/reglages');
    await ecranPret(page, 'reglages');
    await page.locator('select[data-champ-pays]').selectOption('TG');
    await expect(page.getByText("Changer de pays désactive les moyens de paiement de l'ancien pays.")).toBeVisible();
    const changement = await attendreApi(page, 'PATCH', /\/api\/v1\/boutique$/, () => page.locator('#boutique').getByRole('button', { name: /^Enregistrer/ }).click());
    expect(changement.status()).toBe(200);
    expect((await changement.json()).boutique.pays).toBe('TG');
    const carte = page.locator('[data-moyens-pays]');
    const ligne = carte.locator(`[data-moyen="${nomMoyen}"]`);
    await expect(ligne).toBeVisible();
    await expect(carte.locator('[data-moyen="Flooz"]')).toBeVisible();
    await ligne.getByRole('switch').click();
    await ligne.getByLabel('Numéro marchand').fill('+228 90 11 22 33');
    const activation = await attendreApi(page, 'PUT', new RegExp(`/boutique/moyens-pays/${moyen.ulid}$`), () => ligne.getByRole('button', { name: 'Enregistrer' }).click());
    expect(activation.status()).toBe(200);
    expect((await activation.json()).moyen).toMatchObject({ active: true, valeur: '+22890112233' });
    await capturer(page, '23-reglages-moyens-pays');

    // Anti-IDOR : un moyen d'un autre pays (Côte d'Ivoire) est introuvable pour cette boutique.
    tolerer(page, /\/boutique\/moyens-pays\//, 404);
    const ivoiriens = await admin.api.get('/admin/moyens-paiement?pays=CI');
    const etranger = ivoiriens.json.moyens[0].ulid as string;
    const refus = await boutique.api.put(`/boutique/moyens-pays/${etranger}`, { active: true, valeur: '+2250102030405' });
    expect(refus.status).toBe(404);

    // ---- Caisse : le moyen est proposé ; paiement au numéro marchand, confirmation manuelle ----
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await taperMontant(page, 1500);
    await page.getByRole('button', { name: /^Encaisser/ }).click();
    const choix = page.getByRole('dialog', { name: 'Comment le client paie-t-il ?' });
    const creation = await attendreApi(page, 'POST', /\/api\/v1\/ventes$/, () => choix.getByRole('button', { name: new RegExp(`^${nomMoyen}`) }).click());
    expect(creation.status()).toBe(201);
    const tentative = (await creation.json()).vente.paiements[0];
    expect(tentative).toMatchObject({ methode: 'moyen_pays', expire_le: null, moyen: { nom: nomMoyen, type: 'numero', valeur: '+22890112233' } });
    await expect(page.locator('[data-numero-marchand]')).toContainText('+228 90 11 22 33');
    await expect(page.getByText('En attente de confirmation')).toBeVisible();
    await capturer(page, '23-paiement-numero-marchand');
    await page.getByRole('button', { name: /^Confirmer la réception/ }).click();
    const dialogue = page.getByRole('dialog', { name: /^Confirmer la réception/ });
    await expect(dialogue).toContainText(nomMoyen);
    const confirmation = await attendreApi(page, 'POST', /\/confirmer-manuellement$/, () => dialogue.getByRole('button', { name: /^Confirmer la réception/ }).click());
    expect(confirmation.status()).toBe(200);
    await expect(page.getByText(`par ${nomMoyen}`)).toBeVisible();
    await capturer(page, '23-paiement-recu');

    // Le moyen a servi : il ne se supprime plus (désactivation seulement).
    const supprimer = await admin.api.delete(`/admin/moyens-paiement/${moyen.ulid}`);
    expect(supprimer.status).toBe(409);
    expect(supprimer.json.code).toBe('MOYEN_UTILISE');
    await admin.api.fermer();
  });

  test('écran de langue : pays puis langues du pays', async ({ ouvrir }) => {
    const { page } = await ouvrir(undefined, { premierLancement: true });
    await page.goto('/langue');
    await ecranPret(page, 'langue');
    const pays = page.getByRole('combobox', { name: 'Votre pays' });
    await expect(pays).toHaveValue('SN');
    // Tuiles de langue seulement (chaque tuile a aussi son haut-parleur, lui-même un bouton).
    const tuiles = page.getByRole('list', { name: 'Choisissez votre langue' }).locator('button[data-langue]');
    await expect(tuiles).toHaveCount(6);
    // Pays sans langue locale au catalogue de départ : Français + English.
    await pays.selectOption('NE');
    await expect(tuiles).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Français fr' })).toBeVisible();
    await pays.selectOption('SN');
    await expect(tuiles).toHaveCount(6);
    const config = await (await ClientApi.anonyme()).get('/config');
    expect(config.json.pays.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['SN', 'CI', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GW']));
    expect(config.json.langues.map((l: { code: string }) => l.code)).toEqual(expect.arrayContaining(['wo', 'srr', 'ff', 'dyo', 'fr']));
  });
});
