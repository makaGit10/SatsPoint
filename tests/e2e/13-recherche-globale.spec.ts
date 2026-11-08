import { capturer, creerVente, ecranPret, estMobile, expect, PREFIXE_TEST, test, tolererEchec } from './fixtures';
import { attendreApi } from './outils/ui';

/**
 * Parcours 13 — Recherche globale : Ctrl+K, aide avant frappe, résultats groupés (articles, ventes, pages),
 * tolérance aux fautes, navigation clavier, dernières recherches (effaçables), résultat de vente → détail,
 * page de réglages → ancre, aucun résultat, hors ligne (pages locales seulement).
 */
test.describe('13 · Recherche globale', () => {
  test('raccourci, groupes, tolérance, clavier, récentes, destinations, hors ligne', async ({ pageProprietaire: page, boutique }) => {
    const article = await boutique.api.post('/articles', { nom: `${PREFIXE_TEST} Bissap`, prix_xof: 500, couleur: '#DC2626' });
    expect(article.status).toBe(201);
    const { vente } = await creerVente(boutique.api, 1700, { note: `${PREFIXE_TEST} table bazin` });

    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    const ouvrir = async () => {
      if (estMobile(page)) await page.getByRole('button', { name: 'Recherche globale' }).click();
      else await page.keyboard.press('Control+K');
      const d = page.getByRole('dialog', { name: 'Recherche' });
      await expect(d).toBeVisible();
      return d;
    };
    let recherche = await ouvrir();
    const champ = recherche.getByRole('combobox', { name: 'Recherche' });
    await expect(champ).toBeFocused();
    await expect(recherche.getByRole('region', { name: 'Dernières recherches' }).getByText(/Tapez au moins 2 lettres/)).toBeVisible();

    // Faute de frappe tolérée : « bisap » trouve l'article.
    const r1 = page.waitForResponse((r) => r.url().includes('/api/v1/recherche?q=bisap'));
    await champ.fill('bisap');
    expect((await r1).status()).toBe(200);
    const groupeArticles = recherche.locator('[data-rubrique="articles"]');
    await expect(groupeArticles.locator('[data-resultat]').filter({ hasText: 'Bissap' })).toBeVisible();
    await capturer(page, '13-recherche-resultats');

    // Clavier : ↓ + Entrée → fiche de l'article ouverte ; le terme est mémorisé.
    await champ.press('ArrowDown');
    const memo = await attendreApi(page, 'POST', /\/recherche\/recentes$/, () => champ.press('Enter'));
    expect(memo.status()).toBe(204);
    await expect(page.getByRole('dialog', { name: "Modifier l'article" })).toBeVisible();
    await expect(page.getByRole('dialog', { name: "Modifier l'article" }).getByLabel('Nom', { exact: true })).toHaveValue(`${PREFIXE_TEST} Bissap`);
    await page.keyboard.press('Escape');

    // Vente par numéro → détail de la vente.
    recherche = await ouvrir();
    const champ2 = recherche.getByRole('combobox', { name: 'Recherche' });
    await expect(recherche.locator('[data-recente]').filter({ hasText: 'bisap' })).toBeVisible();
    const r2 = page.waitForResponse((r) => r.url().includes('/api/v1/recherche?q='));
    await champ2.fill(vente.numero);
    expect((await r2).status()).toBe(200);
    await recherche.locator('[data-rubrique="ventes"] [data-resultat]').first().click();
    await expect(page.getByRole('dialog', { name: `Détail de la vente · ${vente.numero}` })).toBeVisible();
    await expect(page).toHaveURL(/\/ventes$/);
    await page.keyboard.press('Escape');

    // Page de réglages (accents ignorés) → section préférences.
    recherche = await ouvrir();
    await recherche.getByRole('combobox', { name: 'Recherche' }).fill('theme');
    const pageTheme = recherche.locator('[data-rubrique="pages"] [data-resultat]').filter({ hasText: /Thème/ }).first();
    await expect(pageTheme).toBeVisible();
    await pageTheme.click();
    await expect(page).toHaveURL(/\/reglages#preferences$/);
    await ecranPret(page, 'reglages');
    await expect(page.locator('#preferences')).toBeInViewport();

    // Aucun résultat ; effacer la recherche ; effacer les récentes.
    recherche = await ouvrir();
    const champ3 = recherche.getByRole('combobox', { name: 'Recherche' });
    await champ3.fill('zzzzqq');
    await expect(recherche.getByText(/Aucun résultat pour « zzzzqq »/)).toBeVisible();
    await recherche.getByRole('button', { name: 'Effacer la recherche' }).click();
    await expect(champ3).toHaveValue('');
    const effacer = await attendreApi(page, 'DELETE', /\/recherche\/recentes$/, () => recherche.getByRole('button', { name: 'Effacer les dernières recherches' }).click());
    expect(effacer.status()).toBe(204);
    await expect(recherche.locator('[data-recente]')).toHaveCount(0);
    expect((await boutique.api.get('/recherche/recentes')).json.recentes).toEqual([]);

    // Hors ligne : seules les pages locales sont proposées.
    tolererEchec(page, /ERR_INTERNET_DISCONNECTED/); // hors ligne volontaire
    await page.context().setOffline(true);
    await champ3.fill('portefeuille');
    await expect(recherche.getByText('Hors connexion : seules les pages et réglages sont proposés.')).toBeVisible();
    await expect(recherche.locator('[data-rubrique="pages"] [data-resultat]').filter({ hasText: 'Portefeuille' }).first()).toBeVisible();
    await page.context().setOffline(false);
    await page.keyboard.press('Escape');
    await expect(recherche).toBeHidden();
  });
});
