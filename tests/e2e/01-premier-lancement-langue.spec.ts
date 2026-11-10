import { capturer, expect, test } from './fixtures';

/**
 * Parcours 01 — Premier lancement (personne qui ne lit pas) : choix de la langue → accueil → liens,
 * changement de langue d'interface et de thème, persistance après rechargement.
 */
test.describe('01 · Premier lancement et langue', () => {
  test('choix de la langue, accueil, langue d’interface et thème', async ({ ouvrir }) => {
    const { page } = await ouvrir(undefined, { premierLancement: true });

    // Visiteur sur « / » : page de présentation, dont l'appel principal mène à l'inscription (donc à la langue).
    await page.goto('/');
    await expect(page.locator('[data-ecran="landing"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'La caisse qui encaisse tout.', level: 1 })).toBeVisible();
    await capturer(page, '01-landing');
    await page.getByRole('link', { name: /^Créer ma boutique gratuitement/ }).click();
    await expect(page).toHaveURL(/\/langue$/);
    await expect(page.locator('[data-ecran="langue"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choisissez votre langue', level: 1 })).toBeVisible();
    const tuiles = page.getByRole('list', { name: 'Choisissez votre langue' }).getByRole('button', { name: /^(Wolof|Seereer|Pulaar|Joola|Français|English) / });
    await expect(tuiles).toHaveCount(6);
    // Pays d'abord (Sénégal par défaut, CONTRAT_API § 14) : les six tuiles du Sénégal restent inchangées.
    await expect(page.getByRole('combobox', { name: 'Votre pays' })).toHaveValue('SN');
    for (const nom of ['Wolof wo', 'Seereer srr', 'Pulaar ff', 'Joola dyo', 'Français fr', 'English en']) {
      await expect(page.getByRole('button', { name: nom })).toBeVisible();
    }
    await capturer(page, '01-langue');

    // Toute page invitée renvoie au choix de la langue tant qu'il n'est pas fait.
    await page.goto('/connexion');
    await expect(page).toHaveURL(/\/langue$/);

    // Choix « Wolof » : aide vocale activée, interface en français.
    await page.getByRole('button', { name: 'Wolof wo' }).click();
    await expect(page).toHaveURL(/\/accueil$/);
    const stockage = await page.evaluate(() => ({ ...localStorage }));
    expect(stockage['satspoint.langue-choisie']).toBe('wo');
    expect(stockage['satspoint.langue-audio']).toBe('wo');
    expect(stockage['satspoint.aide-vocale']).toBe('1');
    await expect(page.getByRole('heading', { name: 'La caisse qui encaisse tout.', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await capturer(page, '01-accueil');

    // Liens de l'accueil.
    await page.getByRole('link', { name: /^Créer ma boutique/ }).click();
    await expect(page).toHaveURL(/\/inscription$/);
    await page.goBack();
    await page.getByRole('link', { name: /^Me connecter/ }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goBack();
    await page.getByRole('link', { name: /^Changer de langue/ }).click();
    await expect(page).toHaveURL(/\/langue$/);

    // English : interface anglaise, aide vocale coupée, pas de langue audio.
    await page.getByRole('button', { name: 'English en' }).click();
    await expect(page).toHaveURL(/\/accueil$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/The till that takes everything/);
    const anglais = await page.evaluate(() => ({ ...localStorage }));
    expect(anglais['satspoint.aide-vocale']).toBe('0');
    expect(anglais['satspoint.langue-audio']).toBeUndefined();

    // Retour au français par le sélecteur d'interface, conservé après rechargement.
    await page.getByRole('group', { name: /Interface language|Langue de l'interface/ }).getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('heading', { name: 'La caisse qui encaisse tout.', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'La caisse qui encaisse tout.', level: 1 })).toBeVisible();

    // Thème : bascule soleil / lune, appliquée sans rechargement et conservée (« automatique » reste dans les réglages).
    await page.getByRole('button', { name: 'Thème : Sombre' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
    await capturer(page, '01-accueil-sombre');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
    await page.getByRole('button', { name: 'Thème : Clair' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
  });

  test('page introuvable', async ({ ouvrir }) => {
    const { page } = await ouvrir(undefined);
    await page.goto('/cette-page-n-existe-pas');
    await expect(page.locator('[data-ecran="introuvable"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await capturer(page, '01-introuvable');
    await page.getByRole('link', { name: /^Retour à l'accueil/ }).click();
    await expect(page).toHaveURL(/\/accueil$/);
  });
});
