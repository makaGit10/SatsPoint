import { ajouterMembreTest, capturer, creerVente, ecranPret, estMobile, expect, test } from './fixtures';
import { encaisser, taperMontant, toast } from './outils/ui';

/**
 * Parcours 10 — Caissier : menu réduit, écrans réservés refusés (menu ET adresse tapée ET API),
 * vues en lecture seule, encaissement et annulation de SES ventes, pas de confirmation Wave direct.
 */
test.describe('10 · Caissier : droits et interdits', () => {
  test('menu, adresses interdites, lecture seule, encaissement, API refusées', async ({ boutique, ouvrir }) => {
    test.setTimeout(150_000);
    await boutique.api.patch('/boutique', { reglages: { wave_lien: 'https://pay.wave.com/m/M_e2e_cais/c/sn/', moyens: { lightning: true, paytech: false, wave_manuel: true } } });
    const venteProprio = await creerVente(boutique.api, 900);
    const caissier = await ajouterMembreTest(boutique, 'caissier');
    const { page, surveillance } = await ouvrir(caissier.etat);
    surveillance.tolerer(/\/api\/v1\/demarrage/, 403);

    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await expect(page.locator('[data-bandeau="demarrage"]')).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    if (estMobile(page)) {
      await expect(nav.getByRole('link')).toHaveText(['Caisse', 'Ventes', 'Tableau']);
      await nav.getByRole('button', { name: /^Plus/ }).click();
      const plus = page.getByRole('dialog', { name: 'Plus' });
      await expect(plus.getByRole('list', { name: 'Autres rubriques' }).getByRole('button')).toHaveText(['Articles']);
      await page.keyboard.press('Escape');
    } else {
      await expect(nav.getByRole('link')).toHaveText(['Caisse', 'Ventes', 'Tableau de bord', 'Articles']);
    }
    await capturer(page, '10-caisse-caissier');

    // Adresses tapées : refus + retour à la caisse, avec message.
    for (const chemin of ['/portefeuille', '/equipe', '/reglages', '/admin', '/admin/studio', '/demarrage']) {
      await page.goto(chemin);
      await expect(page, `accès direct à ${chemin}`).toHaveURL(/\/caisse$/);
      await expect(toast(page, 'Cette page est réservée au propriétaire de la boutique.')).toBeVisible();
    }

    // Lecture seule.
    await page.goto('/articles');
    await ecranPret(page, 'articles');
    await expect(page.getByText('Lecture seule : seul le propriétaire ou le gérant modifie les articles.')).toBeVisible();
    for (const nom of ['Importer', 'Exporter les articles', 'Ajouter', 'Modifier l\'article', 'Supprimer']) {
      await expect(page.getByRole('button', { name: nom, exact: true })).toHaveCount(0);
    }
    await page.goto('/tableau-de-bord');
    await ecranPret(page, 'tableau-de-bord');
    await expect(page.getByRole('radiogroup', { name: 'Période' })).toHaveCount(0);
    await page.goto('/ventes');
    await ecranPret(page, 'ventes');
    await expect(page.getByRole('button', { name: 'Exporter' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Ventes' }).getByRole('button', { name: new RegExp(`^${venteProprio.vente.numero} · `) })).toHaveCount(0);

    // Encaissement bitcoin réglé, puis Wave direct sans bouton de confirmation, annulé par le caissier.
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await taperMontant(page, 100);
    await page.getByRole('button', { name: /^Encaisser/ }).click();
    await page.getByRole('dialog', { name: 'Comment le client paie-t-il ?' }).getByRole('button', { name: /^Bitcoin/ }).click();
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await page.locator('[data-simuler]').click();
    await expect(page.locator('[data-ecran="succes"]')).toBeVisible();
    await page.getByRole('button', { name: /^Nouvelle vente/ }).click();
    await ecranPret(page, 'caisse');
    await taperMontant(page, 300);
    await page.getByRole('button', { name: /^Encaisser/ }).click();
    await page.getByRole('dialog', { name: 'Comment le client paie-t-il ?' }).getByRole('button', { name: /^Wave direct/ }).click();
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.getByRole('button', { name: /^Confirmer la réception/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Annuler la vente' }).click();
    await page.getByRole('dialog', { name: 'Annuler cette vente ?' }).getByRole('button', { name: /^Annuler la vente/ }).click();
    await expect(page.getByRole('heading', { name: 'Paiement annulé' })).toBeVisible();
    void encaisser;

    // Recherche globale : aucune page réservée proposée.
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await page.keyboard.press('Control+K');
    const recherche = page.getByRole('dialog', { name: 'Recherche' });
    const champ = recherche.getByRole('combobox', { name: 'Recherche' });
    for (const terme of ['reglages', 'portefeuille', 'equipe']) {
      const r = page.waitForResponse((x) => x.url().includes('/api/v1/recherche?q='));
      await champ.fill(terme);
      expect((await r).status()).toBe(200);
      await expect(recherche.locator('[data-resultat]').filter({ hasText: /^(Réglages|Portefeuille|Équipe)/ })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');

    // API directes : refus côté serveur.
    const api = caissier.api;
    const refus: Array<[string, string, unknown?]> = [
      ['GET', '/wallet'],
      ['GET', '/equipe'],
      ['PATCH', '/boutique', { nom: 'pirate' }],
      ['POST', '/articles', { nom: 'pirate', prix_xof: 100 }],
      ['GET', '/exports/ventes?format=csv'],
      ['GET', '/exports/articles?format=csv'],
      ['POST', '/wallet/envoyer/apercu', { destination: 'lnbc1' }],
      ['PUT', '/boutique/paytech', { api_key: 'aaaaaaaa', api_secret: 'bbbbbbbb', environnement: 'test' }],
      ['DELETE', '/boutique/wallet'],
      ['GET', '/admin/statistiques'],
    ];
    for (const [methode, chemin, corps] of refus) {
      const r = await api.requete(methode, chemin, corps);
      expect(r.status, `${methode} ${chemin}`).toBe(403);
    }
    expect([403, 404]).toContain((await api.get(`/ventes/${venteProprio.vente.ulid}`)).status);
    expect([403, 404]).toContain((await api.post(`/ventes/${venteProprio.vente.ulid}/annuler`)).status);
    const lecture = await api.get('/boutique');
    expect(lecture.status).toBe(200);
    expect(lecture.json.boutique.mon_role).toBe('caissier');
  });
});
