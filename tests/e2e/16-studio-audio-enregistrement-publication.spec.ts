import { artisan, capturer, ClientApi, ecranPret, estMobile, expect, PREFIXE_TEST, test } from './fixtures';
import { superAdminValide, wav } from './outils/admin';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 16 — Studio audio (super-admin DE TEST, 2FA validée) : matrice, langue de travail, filtres,
 * refus d'un format, dépôt d'un fichier → traitement serveur → brouillon écoutable, enregistrement au micro
 * (micro simulé par Chromium : décompte, arrêt, réécoute / refaire / valider), publication → manifeste public.
 * L'audio publié est supprimé par le nettoyage de fin (`e2e:nettoyer`, audios déposés par un compte de test).
 */
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test.describe('16 · Studio audio', () => {
  // Les audios publiés sont visibles de tous : suppression dès la fin du test (et pas seulement en fin de suite).
  test.afterEach(() => {
    artisan('e2e:nettoyer', PREFIXE_TEST);
  });

  test('dépôt, brouillon, micro, publication', async ({ ouvrir }) => {
    test.setTimeout(180_000);
    const admin = await superAdminValide();
    const { page, contexte } = await ouvrir(admin.etat);
    await contexte.grantPermissions(['microphone']);

    await page.goto('/admin/studio-audio');
    await expect(page).toHaveURL(/\/admin\/studio$/);
    await ecranPret(page, 'studio');
    await expect(page.getByRole('heading', { name: 'Studio audio', level: 1 })).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Langue de travail' }).getByRole('radio', { name: /^Wolof/ }).click();
    await capturer(page, '16-studio-matrice');
    // Mode rafale (actif par défaut) : désactivé pour vérifier chaque étape sur la même case.
    const rafale = page.getByRole('button', { name: /^Mode rafale/ });
    if ((await rafale.getAttribute('aria-pressed')) === 'true') await rafale.click();
    await expect(rafale).toHaveAttribute('aria-pressed', 'false');

    // Filtre sur la clé « Encaisser » (caisse), case Wolof manquante → panneau d'enregistrement.
    const recherche = page.getByRole('searchbox', { name: 'Chercher une clé ou un texte' });
    await recherche.fill('caisse.encaisser');
    const caseWolof = page.getByRole('button', { name: /^Wolof — « Encaisser » : Manquant/ }).first();
    await expect(caseWolof).toBeVisible();
    await caseWolof.click();
    const panneau = page.locator('[data-panneau="enregistrement"]');
    await expect(panneau).toBeVisible();

    // Format refusé côté client.
    const depot = panneau.locator('[data-depot] input[type=file]');
    await depot.setInputFiles({ name: 'texte.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
    await expect(panneau.getByText('Format non pris en charge : mp3, wav, m4a, ogg ou webm.')).toBeVisible();

    // Dépôt d'un fichier WAV → traitement → brouillon.
    const envoi = await attendreApi(page, 'POST', /\/api\/v1\/admin\/audio$/, () => depot.setInputFiles({ name: 'encaisser.wav', mimeType: 'audio/wav', buffer: wav() }));
    expect([201, 202]).toContain(envoi.status());
    await expect(toast(page, 'Enregistrement envoyé')).toBeVisible();
    // Le panneau (feuille sur mobile) indique l'état de la version en préparation.
    const version = panneau.locator('[data-version]');
    await expect(version).toContainText('Brouillon', { timeout: 60_000 });
    const ecoute = page.waitForResponse((r) => /\/admin\/audio\/\d+\/ecouter$/.test(new URL(r.url()).pathname));
    await panneau.getByRole('button', { name: /^Écouter le brouillon/ }).click();
    const reponseEcoute = await ecoute;
    expect([200, 206]).toContain(reponseEcoute.status()); // lecture par plages (Range) acceptée
    expect(reponseEcoute.headers()['content-type']).toContain('audio/mpeg');
    await capturer(page, '16-studio-brouillon');

    // Publication du brouillon → disponible dans le manifeste public, fichier servi.
    const publication = await attendreApi(page, 'POST', /\/admin\/audio\/publier$/, () => panneau.getByRole('button', { name: /^Publier$/ }).click());
    expect(publication.status()).toBe(200);
    await expect(toast(page, 'Audio publié : disponible chez tout le monde')).toBeVisible();
    await expect(version).toContainText('Version publiée');
    const anonyme = await ClientApi.anonyme();
    await expect.poll(async () => Object.keys((await anonyme.get('/api/v1/audio/manifeste/wo')).json.audios)).toContain('caisse.encaisser');
    const manifeste = (await anonyme.get('/api/v1/audio/manifeste/wo')).json;
    const fichier = await anonyme.get(manifeste.audios['caisse.encaisser']);
    expect(fichier.status).toBe(200);
    expect(fichier.entetes['content-type']).toContain('audio/mpeg');
    await anonyme.fermer();
    await capturer(page, '16-studio-publie');

    // Micro simulé : décompte, enregistrement, arrêt, réécouter / refaire / valider → nouvelle version en brouillon.
    await panneau.locator('[data-action="enregistrer"]').click();
    await expect(panneau.locator('[data-decompte]')).toBeVisible();
    const arreter = panneau.locator('[data-action="arreter"]');
    await expect(arreter).toBeVisible({ timeout: 10_000 });
    await expect(panneau.getByText(/0:0[1-9] \/ 0:15/)).toBeVisible({ timeout: 10_000 });
    await arreter.click();
    await expect(panneau.locator('[data-action="valider"]')).toBeVisible();
    await expect(panneau.getByRole('button', { name: /^Réécouter/ })).toBeVisible();
    await capturer(page, '16-studio-prise-prete');
    // « Refaire » relance aussitôt une prise (décompte puis enregistrement).
    await panneau.getByRole('button', { name: /^Refaire/ }).click();
    await expect(arreter).toBeVisible({ timeout: 10_000 });
    await expect(panneau.getByText(/0:0[1-9] \/ 0:15/)).toBeVisible({ timeout: 10_000 });
    await arreter.click();
    const validation = await attendreApi(page, 'POST', /\/api\/v1\/admin\/audio$/, () => panneau.locator('[data-action="valider"]').click());
    expect([201, 202]).toContain(validation.status());
    await expect(version).toContainText('Brouillon', { timeout: 60_000 });

    // Suppression du nouveau brouillon : la version publiée reste.
    const suppression = await attendreApi(page, 'DELETE', /\/api\/v1\/admin\/audio\/\d+$/, () => panneau.getByRole('button', { name: /^Supprimer le brouillon/ }).click());
    expect(suppression.status()).toBe(204);
    await expect(toast(page, 'Brouillon supprimé')).toBeVisible();
    await expect(version).toContainText('Version publiée');

  });
});
