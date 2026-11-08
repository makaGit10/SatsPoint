import fs from 'node:fs';
import { capturer, creerBoutiqueTest, creerCompteTest, ecranPret, estMobile, etatDemo, expect, suffixe, test } from './fixtures';
import { codeTotp } from './outils/admin';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 15 — Super-admin DE TEST : la console exige la 2FA → activation (QR, clé secrète, code TOTP calculé,
 * code faux refusé), codes de secours (téléchargement, case obligatoire), déconnexion / reconnexion → vérification
 * (code de secours puis TOTP), console : vue d'ensemble, boutiques (recherche, filtre, suspension dans les deux sens
 * sur une boutique de test, effet sur sa session), santé, journal ; menu réduit ; le propriétaire n'y entre pas.
 */
test.describe('15 · Super-admin : 2FA et console', () => {
  test('activation 2FA, vérification, console et suspension', async ({ ouvrir }) => {
    test.setTimeout(180_000);
    const compte = creerCompteTest(`Super-admin ${suffixe()}`, { superAdmin: true });
    const boutique = await creerBoutiqueTest('P15');
    const { page, surveillance } = await ouvrir(undefined);
    surveillance.tolerer(/\/api\/v1\/auth\/2fa\/(activer|verifier)$/, 422); // codes faux volontaires
    surveillance.tolerer(/\/api\/v1\/admin\//, 403); // avant validation de la 2FA : DEUX_FA_REQUISE

    // Connexion → la console renvoie à l'activation de la 2FA.
    await page.goto('/connexion?suite=%2Fadmin');
    await page.getByLabel('Téléphone ou e-mail').fill(compte.identifiant);
    await page.getByLabel('Mot de passe', { exact: true }).fill(compte.motDePasse);
    await page.getByRole('button', { name: /^Me connecter/ }).click();
    await expect(page).toHaveURL(/\/securite\/2fa\?suite=%2Fadmin/);
    await expect(page.locator('[data-ecran="securite-2fa"]')).toHaveAttribute('data-etape', 'activation');
    await expect(page.getByText('La console plateforme exige la double authentification. Activez-la pour continuer.')).toBeVisible();
    await expect(page.getByRole('img', { name: /Code QR à scanner/ })).toBeVisible();
    const secret = (await page.locator('code[data-secret]').innerText()).replace(/\s+/g, '');
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    await capturer(page, '15-2fa-activation');

    const champCode = page.getByLabel('Code à 6 chiffres');
    const faux = await attendreApi(page, 'POST', /\/auth\/2fa\/activer$/, () => champCode.fill('000000'));
    expect(faux.status()).toBe(422);
    await expect(page.getByText('Code incorrect. Vérifiez l\'heure de votre téléphone et réessayez.')).toBeVisible();
    await champCode.fill('');
    const activation = await attendreApi(page, 'POST', /\/auth\/2fa\/activer$/, () => champCode.fill(codeTotp(secret)));
    expect(activation.status()).toBe(200);
    await expect(toast(page, 'Double authentification activée')).toBeVisible();

    // Codes de secours : « Terminer » exige d'avoir rangé les codes.
    await expect(page.locator('[data-ecran="securite-2fa"]')).toHaveAttribute('data-etape', 'codes');
    const codes = page.getByRole('list', { name: 'Vos codes de secours' }).getByRole('listitem');
    await expect(codes).toHaveCount(8);
    const codeSecours = (await codes.first().innerText()).trim();
    await expect(page.getByRole('button', { name: /^Terminer/ })).toBeDisabled();
    const [fichier] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Télécharger/ }).click()]);
    expect(fichier.suggestedFilename()).toBe('satspoint-codes-de-secours.txt');
    expect(fs.readFileSync(await fichier.path(), 'utf8')).toContain(codeSecours);
    await expect(page.getByRole('checkbox', { name: "J'ai rangé ces codes en lieu sûr" })).toBeChecked();
    await capturer(page, '15-2fa-codes-secours');
    await page.getByRole('button', { name: /^Terminer/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // Déconnexion puis reconnexion : vérification par code de secours.
    await page.getByRole('button', { name: 'Mon compte' }).click();
    await page.getByRole('button', { name: /^Me déconnecter/ }).click();
    await expect(page).toHaveURL(/\/accueil$/);
    await page.goto('/connexion');
    await page.getByLabel('Téléphone ou e-mail').fill(compte.identifiant);
    await page.getByLabel('Mot de passe', { exact: true }).fill(compte.motDePasse);
    await page.getByRole('button', { name: /^Me connecter/ }).click();
    await expect(page).toHaveURL(/\/verification-2fa/);
    await page.getByRole('button', { name: /^Vérifier/ }).click();
    await expect(page.getByText('Saisissez les 6 chiffres.')).toBeVisible();
    await capturer(page, '15-verification-2fa');
    await page.getByRole('button', { name: /^Utiliser un code de secours/ }).click();
    await page.getByLabel('Code de secours').fill(codeSecours.toLowerCase());
    const verif = await attendreApi(page, 'POST', /\/auth\/2fa\/verifier$/, () => page.getByRole('button', { name: /^Vérifier/ }).click());
    expect(verif.status()).toBe(200);
    expect((await verif.json()).methode).toBe('secours');
    await expect(page).toHaveURL(/\/admin$/);

    // Console : vue d'ensemble.
    await ecranPret(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Console plateforme', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Vue d'ensemble/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Commerçants actifs')).toBeVisible();
    await capturer(page, '15-console-ensemble');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link')).toHaveText(estMobile(page) ? ['Console', 'Studio audio'] : ['Console', 'Studio audio']);

    // Boutiques : recherche, filtre, suspension (annuler puis confirmer) puis réactivation.
    await page.getByRole('tab', { name: 'Boutiques' }).click();
    await expect(page).toHaveURL(/onglet=boutiques/);
    await ecranPret(page, 'admin');
    const reqQ = page.waitForResponse((r) => r.url().includes('/api/v1/admin/boutiques') && r.url().includes('q='));
    await page.getByRole('searchbox', { name: 'Nom, ville ou propriétaire' }).fill(boutique.nom);
    expect((await reqQ).status()).toBe(200);
    const liste = page.getByRole('list', { name: 'Boutiques' });
    const ligne = liste.getByRole('listitem').filter({ hasText: boutique.nom });
    await expect(ligne).toHaveCount(1);
    await expect(ligne.getByRole('img', { name: 'Portefeuille connecté' })).toBeVisible();
    await capturer(page, '15-console-boutiques');
    await ligne.getByRole('button', { name: /^Suspendre la boutique/ }).click();
    await page.getByRole('dialog', { name: /^Suspendre / }).getByRole('button', { name: /^Annuler/ }).click();
    await expect(ligne.getByText('Active')).toBeVisible();
    await ligne.getByRole('button', { name: /^Suspendre la boutique/ }).click();
    const suspension = await attendreApi(page, 'PATCH', /\/admin\/boutiques\/[0-9A-Z]{26}$/, () => page.getByRole('dialog', { name: /^Suspendre / }).getByRole('button', { name: /^Suspendre la boutique/ }).click());
    expect(suspension.status()).toBe(200);
    await expect(toast(page, /est suspendue/)).toBeVisible();
    await expect(ligne.getByText('Suspendue')).toBeVisible();
    const refus = await boutique.api.get('/ventes');
    expect([401, 403]).toContain(refus.status); // sessions révoquées / BOUTIQUE_SUSPENDUE
    await page.getByRole('radio', { name: 'Suspendues' }).click();
    await expect(ligne).toHaveCount(1);
    await ligne.getByRole('button', { name: /^Réactiver la boutique/ }).click();
    const reactivation = await attendreApi(page, 'PATCH', /\/admin\/boutiques\/[0-9A-Z]{26}$/, () => page.getByRole('dialog', { name: /^Réactiver / }).getByRole('button', { name: /^Réactiver la boutique/ }).click());
    expect(reactivation.status()).toBe(200);
    await expect(toast(page, /est réactivée/)).toBeVisible();

    // Santé et journal.
    await page.getByRole('tab', { name: 'Santé' }).click();
    await ecranPret(page, 'admin');
    const sante = page.getByRole('list', { name: 'Santé' });
    await expect(sante.getByRole('listitem')).toHaveCount(7);
    const actualiser = await attendreApi(page, 'GET', /\/admin\/sante$/, () => page.getByRole('button', { name: /^Actualiser/ }).click());
    expect(actualiser.status()).toBe(200);
    await capturer(page, '15-console-sante');
    await page.getByRole('tab', { name: 'Journal' }).click();
    await ecranPret(page, 'admin');
    const filtre = page.waitForResponse((r) => r.url().includes('/api/v1/admin/journal') && r.url().includes('action=plateforme.'));
    await page.getByRole('combobox', { name: "Type d'action" }).selectOption({ label: 'Plateforme (suspensions)' });
    expect((await filtre).status()).toBe(200);
    await expect(page.getByRole('list', { name: 'Journal' })).toContainText('Boutique suspendue');
    await capturer(page, '15-console-journal');

    // Le super-admin n'entre pas dans la caisse ; le propriétaire n'entre pas dans la console.
    await page.goto('/caisse');
    await expect(page).toHaveURL(/\/admin$/);
    const { page: proprio, surveillance: s2 } = await ouvrir(await etatDemo('proprietaire'));
    s2.tolerer(/\/api\/v1\/admin\//, 403);
    await proprio.goto('/admin');
    await expect(proprio).toHaveURL(/\/caisse$/);
    await expect(toast(proprio, 'Cette page est réservée au propriétaire de la boutique.')).toBeVisible();
    await boutique.api.fermer();
  });
});
