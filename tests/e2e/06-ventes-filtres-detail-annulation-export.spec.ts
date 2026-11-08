import fs from 'node:fs';
import { ajouterMembreTest, capturer, creerVente, ecranPret, expect, PREFIXE_TEST, test } from './fixtures';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 06 — Ventes : liste et totaux, recherche par numéro, filtres (statut, moyen, période), détail,
 * annulation (deux sens), reprise du paiement, reçu, exports CSV / Excel / PDF ; vue restreinte du caissier.
 */
test.describe('06 · Ventes', () => {
  test('liste, recherche, filtres, détail, annulation, reprise, exports', async ({ pageProprietaire: page, boutique }) => {
    const note = `${PREFIXE_TEST} vente`;
    const a = await creerVente(boutique.api, 1500, { note });
    expect((await boutique.api.post(`/paiements/${a.paiement.ulid}/simuler`)).status).toBe(200);
    const b = await creerVente(boutique.api, 2500, { note });
    const c = await creerVente(boutique.api, 3500, { note });

    await page.goto('/ventes');
    await ecranPret(page, 'ventes');
    await expect(page.getByRole('heading', { name: 'Ventes', level: 1 })).toBeVisible();
    const liste = page.getByRole('list', { name: 'Ventes' });
    await expect(liste.getByRole('button')).toHaveCount(3);
    await expect(page.getByText('3 ventes')).toBeVisible();
    await expect(page.locator('dl')).toContainText(/7\s?500\sFCFA/); // total
    await expect(page.locator('dl')).toContainText(/1\s?500\sFCFA/); // encaissé
    await capturer(page, '06-ventes-liste');

    // Recherche par numéro.
    const recherche = page.getByRole('searchbox', { name: 'N° ou montant' });
    const rep = page.waitForResponse((r) => r.url().includes('/api/v1/ventes?') && r.url().includes('q='));
    await recherche.fill(b.vente.numero);
    expect((await rep).status()).toBe(200);
    await expect(liste.getByRole('button')).toHaveCount(1);
    await expect(liste.getByRole('button', { name: new RegExp(`^${b.vente.numero} · `) })).toBeVisible();
    await recherche.fill('');
    await expect(liste.getByRole('button')).toHaveCount(3);

    // Filtres.
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page.locator('[data-filtres]')).toBeVisible();
    await page.getByRole('combobox', { name: 'Statut' }).selectOption({ label: 'En attente' });
    await expect(liste.getByRole('button')).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Moyen' }).selectOption({ label: 'Wave direct' });
    await expect(page.getByText('Aucune vente ne correspond à ces filtres.')).toBeVisible();
    await capturer(page, '06-ventes-filtres-vide');
    await page.getByRole('button', { name: /^Réinitialiser les filtres/ }).click();
    await expect(liste.getByRole('button')).toHaveCount(3);
    const septJours = page.waitForResponse((r) => r.url().includes('/api/v1/ventes?') && r.url().includes('periode=7j'));
    await page.getByRole('radio', { name: '7 jours' }).click();
    expect((await septJours).status()).toBe(200);
    await expect(liste.getByRole('button')).toHaveCount(3);
    await page.getByRole('radio', { name: 'Personnalisée' }).click();
    await expect(page.getByLabel('Du')).toBeVisible();
    await expect(page.getByLabel('Au')).toBeVisible();
    await page.getByRole('radio', { name: "Aujourd'hui" }).click();

    // Détail de B : annulation refusée puis confirmée.
    await liste.getByRole('button', { name: new RegExp(`^${b.vente.numero} · `) }).click();
    const detail = page.getByRole('dialog', { name: `Détail de la vente · ${b.vente.numero}` });
    await expect(detail).toBeVisible();
    await expect(detail.getByText(note)).toBeVisible();
    await expect(detail.getByText('simulé')).toBeVisible();
    await capturer(page, '06-vente-detail');
    await detail.getByRole('button', { name: /^Annuler la vente/ }).click();
    const confirmation = page.getByRole('dialog', { name: 'Annuler cette vente ?' });
    await confirmation.getByRole('button', { name: /^Garder la vente/ }).click();
    await expect(confirmation).toBeHidden();
    expect((await boutique.api.get(`/ventes/${b.vente.ulid}`)).json.vente.statut).toBe('en_attente');
    await page.getByRole('dialog', { name: `Détail de la vente · ${b.vente.numero}` }).getByRole('button', { name: /^Annuler la vente/ }).click();
    const annulation = await attendreApi(page, 'POST', new RegExp(`/ventes/${b.vente.ulid}/annuler$`), () =>
      page.getByRole('dialog', { name: 'Annuler cette vente ?' }).getByRole('button', { name: /^Annuler la vente/ }).click(),
    );
    expect(annulation.status()).toBe(200);
    await expect(toast(page, 'Vente annulée')).toBeVisible();
    const detailB = page.getByRole('dialog', { name: `Détail de la vente · ${b.vente.numero}` });
    await expect(detailB.getByText('Annulée').first()).toBeVisible();
    await expect(detailB.getByRole('button', { name: /^Annuler la vente/ })).toHaveCount(0);
    await detailB.getByRole('button', { name: 'Fermer' }).first().click();

    // C : reprendre le paiement.
    await liste.getByRole('button', { name: new RegExp(`^${c.vente.numero} · `) }).click();
    await page.getByRole('dialog', { name: `Détail de la vente · ${c.vente.numero}` }).getByRole('button', { name: /^Reprendre le paiement/ }).click();
    await expect(page).toHaveURL(new RegExp(`/caisse/paiement/${c.paiement.ulid}$`));
    await expect(page.locator('[data-ecran="paiement"]')).toHaveAttribute('data-etat', 'en_attente');

    // A : lien du reçu ; ouverture directe par ?vente=.
    await page.goto(`/ventes?vente=${a.vente.ulid}`);
    const detailA = page.getByRole('dialog', { name: `Détail de la vente · ${a.vente.numero}` });
    await expect(detailA).toBeVisible();
    await expect(page).toHaveURL(/\/ventes$/);
    await expect(detailA.getByRole('link', { name: /^Voir le reçu/ })).toHaveAttribute('href', /\/r\/[A-Za-z0-9]{32}$/);
    await detailA.getByRole('button', { name: 'Fermer' }).first().click();

    // Données conservées après rechargement : B annulée.
    await page.reload();
    await ecranPret(page, 'ventes');
    await expect(page.getByRole('list', { name: 'Ventes' }).getByRole('button', { name: new RegExp(`^${b.vente.numero} · .* · Annulée`) })).toBeVisible();

    // Exports (CSV, Excel, PDF) : fichiers téléchargés, contenu CSV vérifié.
    for (const [libelle, extension] of [
      [/^CSV/, 'csv'],
      [/^Excel/, 'xlsx'],
      [/^PDF/, 'pdf'],
    ] as const) {
      await page.getByRole('button', { name: 'Exporter' }).click();
      const menu = page.getByRole('menu', { name: /^Exporter/ });
      await expect(menu).toBeVisible();
      const [telechargement] = await Promise.all([page.waitForEvent('download'), menu.getByRole('menuitem', { name: libelle }).click()]);
      expect(telechargement.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
      const chemin = await telechargement.path();
      const contenu = fs.readFileSync(chemin);
      expect(contenu.length).toBeGreaterThan(100);
      if (extension === 'csv') {
        const texte = contenu.toString('utf8');
        expect(texte.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8 pour Excel
        expect(texte).toContain(a.vente.numero);
        expect(texte).toContain('Numéro;');
      }
      if (extension === 'pdf') expect(contenu.subarray(0, 4).toString()).toBe('%PDF');
      await expect(toast(page, 'Export téléchargé').first()).toBeVisible();
    }
  });

  test('caissier : ses ventes du jour, sans export ni filtres de période', async ({ boutique, ouvrir }) => {
    const proprio = await creerVente(boutique.api, 900);
    const caissier = await ajouterMembreTest(boutique, 'caissier');
    const sienne = await creerVente(caissier.api, 1100);
    const { page, surveillance } = await ouvrir(caissier.etat);
    surveillance.tolerer(/\/api\/v1\/exports\/ventes/, 403);
    await page.goto('/ventes');
    await ecranPret(page, 'ventes');
    await expect(page.getByText("Vos ventes d'aujourd'hui")).toBeVisible();
    const liste = page.getByRole('list', { name: 'Ventes' });
    await expect(liste.getByRole('button')).toHaveCount(1);
    await expect(liste.getByRole('button', { name: new RegExp(`^${sienne.vente.numero} · `) })).toBeVisible();
    await expect(liste.getByRole('button', { name: new RegExp(`^${proprio.vente.numero} · `) })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exporter' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Période' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Caissier' })).toHaveCount(0);
    await capturer(page, '06-ventes-caissier');
    expect((await caissier.api.get('/exports/ventes?format=csv')).status).toBe(403);
    expect([403, 404]).toContain((await caissier.api.get(`/ventes/${proprio.vente.ulid}`)).status);
  });
});
