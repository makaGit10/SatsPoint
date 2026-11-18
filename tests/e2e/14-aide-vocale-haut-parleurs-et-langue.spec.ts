import { artisan, capturer, creerBoutiqueTest, ecranPret, expect, PREFIXE_TEST, test } from './fixtures';
import { deposerAudio, publierAudios, superAdminValide } from './outils/admin';
import { taperMontant } from './outils/ui';

/**
 * Parcours 14 — Aide vocale : des audios sont publiés par un super-admin de test (API), puis
 * - le sélecteur de langue est parlé (haut-parleur par tuile, lecture sans choisir la tuile) ;
 * - après le choix du wolof, les boutons ont un haut-parleur qui lit l'audio sans déclencher le bouton ;
 * - repli sur le français quand la langue choisie n'a pas l'audio ; haut-parleurs masqués quand l'aide est coupée ;
 * - annonce automatique « Paiement reçu » à l'écran vert ; l'anglais coupe l'aide vocale.
 * Les audios sont supprimés à la fin du test (ils seraient sinon visibles de tous).
 */
test.describe('14 · Aide vocale', () => {
  test.afterEach(() => {
    artisan('e2e:nettoyer', PREFIXE_TEST);
  });

  test('sélecteur parlé, haut-parleurs, repli, désactivation, annonce, anglais', async ({ ouvrir }) => {
    test.setTimeout(180_000);
    const admin = await superAdminValide();
    const idsWo = [await deposerAudio(admin, 'langue.wo', 'wo'), await deposerAudio(admin, 'accueil.creerBoutique', 'wo'), await deposerAudio(admin, 'paiement.recu', 'wo')];
    await publierAudios(admin, idsWo, 'wo', ['langue.wo', 'accueil.creerBoutique', 'paiement.recu']);
    const idFr = await deposerAudio(admin, 'caisse.encaisser', 'fr');
    await publierAudios(admin, [idFr], 'fr', ['caisse.encaisser']);

    // 1. Sélecteur de langue parlé (visiteur, premier lancement).
    const { page } = await ouvrir(undefined, { premierLancement: true });
    await page.goto('/langue');
    const hpWolof = page.locator('[data-haut-parleur="langue.wo"]');
    await expect(hpWolof).toBeVisible();
    // Pas d'audio seereer : la tuile parle quand même (enregistrement français, sinon voix du navigateur) — aucun bouton muet.
    await expect(page.locator('[data-haut-parleur="langue.srr"]')).toBeVisible();
    const lecture = page.waitForResponse((r) => /\/audio\/wo\/langue\.wo\.[0-9a-f]{8}\.mp3$/.test(new URL(r.url()).pathname));
    await hpWolof.click();
    expect([200, 206]).toContain((await lecture).status());
    await expect(page).toHaveURL(/\/langue$/); // écouter ne choisit pas la langue
    await capturer(page, '14-langue-haut-parleurs');

    // 2. Choix du wolof : aide vocale active, haut-parleur dans le bouton « Créer ma boutique ».
    await page.getByRole('button', { name: /^Wolof wo/ }).click();
    await expect(page).toHaveURL(/\/accueil$/);
    const creer = page.getByRole('link', { name: /^Créer ma boutique/ });
    const hpCreer = creer.locator('[data-haut-parleur="accueil.creerBoutique"]');
    await expect(hpCreer).toBeVisible();
    const lecture2 = page.waitForResponse((r) => /\/audio\/wo\/accueil\.creerBoutique\./.test(new URL(r.url()).pathname));
    await hpCreer.click();
    expect([200, 206]).toContain((await lecture2).status());
    await expect(page).toHaveURL(/\/accueil$/); // le haut-parleur ne déclenche pas le lien
    await capturer(page, '14-accueil-haut-parleurs');
    // Les ondes du haut-parleur s'animent pendant la lecture : Playwright attendrait leur fin pour juger l'élément « stable ».
    await creer.click({ position: { x: 10, y: 10 }, force: true });
    await expect(page).toHaveURL(/\/inscription$/);

    // 3. Commerçant en pulaar : repli sur le français pour « Encaisser » ; désactivation de l'aide vocale.
    const boutique = await creerBoutiqueTest('P14');
    expect((await boutique.api.patch('/moi/preferences', { aide_vocale: true, langue_audio: 'ff' })).status).toBe(200);
    const { page: caisse } = await ouvrir(boutique.etat, { aideVocale: true });
    await caisse.goto('/caisse');
    await ecranPret(caisse, 'caisse');
    const encaisser = caisse.getByRole('button', { name: /^Encaisser/ });
    await expect(encaisser.locator('[data-haut-parleur="caisse.encaisser"]')).toBeVisible();
    await caisse.getByRole('button', { name: 'Mon compte' }).click();
    const compte = caisse.getByRole('dialog', { name: /Propriétaire/ });
    const interrupteur = compte.getByRole('switch', { name: /^Aide vocale/ });
    await expect(interrupteur).toBeChecked();
    const coupe = caisse.waitForResponse((r) => r.url().endsWith('/api/v1/moi/preferences') && r.request().method() === 'PATCH');
    await interrupteur.click();
    expect((await coupe).status()).toBe(200);
    await caisse.keyboard.press('Escape');
    await expect(encaisser.locator('[data-haut-parleur]')).toHaveCount(0);
    expect((await boutique.api.get('/moi')).json.utilisateur.preferences.aide_vocale).toBe(false);

    // 4. Annonce automatique au règlement (aide vocale réactivée, langue wolof).
    expect((await boutique.api.patch('/moi/preferences', { aide_vocale: true, langue_audio: 'wo' })).status).toBe(200);
    await caisse.reload();
    await ecranPret(caisse, 'caisse');
    await taperMontant(caisse, 500);
    await encaisser.click();
    await expect(caisse.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    const annonce = caisse.waitForResponse((r) => /\/audio\/wo\/paiement\.recu\./.test(new URL(r.url()).pathname));
    await caisse.locator('[data-simuler]').click();
    await expect(caisse.locator('[data-ecran="succes"]')).toBeVisible();
    expect([200, 206]).toContain((await annonce).status());

    // 5. Anglais : interface anglaise, aide vocale coupée.
    await caisse.goto('/langue');
    await caisse.getByRole('button', { name: /^English en/ }).click();
    await expect(caisse).toHaveURL(/\/caisse$/);
    await expect(caisse.locator('html')).toHaveAttribute('lang', 'en');
    await expect(caisse.getByRole('button', { name: /^Charge/ })).toBeVisible();
    await expect(caisse.locator('[data-haut-parleur]')).toHaveCount(0);
    await capturer(caisse, '14-caisse-anglais');
    await expect.poll(async () => (await boutique.api.get('/moi')).json.utilisateur.preferences.locale).toBe('en');
    await boutique.api.fermer();
  });
});
