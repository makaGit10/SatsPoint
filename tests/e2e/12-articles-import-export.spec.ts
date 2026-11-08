import fs from 'node:fs';
import { ajouterMembreTest, capturer, ecranPret, expect, PREFIXE_TEST, test, tolerer } from './fixtures';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 12 — Articles : état vide, création (validation, couleur), modification, ordre, suppression
 * (deux sens), tuiles dans la caisse ; import CSV avec correspondance des colonnes, aperçu, erreurs ligne par
 * ligne, modes « ignorer les erreurs » et « tout ou rien », rapport ; export CSV / Excel ; caissier en lecture.
 */
test.describe('12 · Articles, import et export', () => {
  test('CRUD, ordre, caisse', async ({ pageProprietaire: page, boutique }) => {
    await page.goto('/articles');
    await ecranPret(page, 'articles');
    await expect(page.getByRole('heading', { name: 'Aucun article' })).toBeVisible();
    await capturer(page, '12-articles-vide');

    // Création : validation puis enregistrement avec la couleur « Vert ».
    await page.getByRole('button', { name: /^Ajouter un article/ }).click();
    const dialogue = page.getByRole('dialog', { name: 'Ajouter un article' });
    await dialogue.getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(dialogue.getByText('Ce champ est obligatoire.')).toHaveCount(2);
    await dialogue.getByLabel('Nom', { exact: true }).fill(`${PREFIXE_TEST} Thé`);
    await dialogue.getByLabel('Prix').fill('1200');
    await dialogue.getByRole('radio', { name: 'Vert' }).click();
    const creation = await attendreApi(page, 'POST', /\/api\/v1\/articles$/, () => dialogue.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(creation.status()).toBe(201);
    const the = (await creation.json()).article;
    expect(the.couleur).toMatch(/^#[0-9A-F]{6}$/i);
    await expect(toast(page, 'Article enregistré')).toBeVisible();
    for (const [nom, prix] of [['Café', 300], ['Bissap', 500]] as const) {
      expect((await boutique.api.post('/articles', { nom: `${PREFIXE_TEST} ${nom}`, prix_xof: prix, couleur: '#DC2626' })).status).toBe(201);
    }
    await page.reload();
    await ecranPret(page, 'articles');
    const liste = page.getByRole('list', { name: 'Articles' });
    await expect(liste.getByRole('listitem')).toHaveCount(3);
    await expect(liste.getByRole('listitem').first().getByRole('img', { name: 'Vert' })).toBeVisible();
    await capturer(page, '12-articles-liste');

    // Modification : la couleur choisie est conservée.
    await liste.getByRole('listitem').first().getByRole('button', { name: "Modifier l'article" }).click();
    const modif = page.getByRole('dialog', { name: "Modifier l'article" });
    await expect(modif.getByRole('radio', { name: 'Vert' })).toBeChecked();
    await modif.getByLabel('Prix').fill('1300');
    const patch = await attendreApi(page, 'PATCH', /\/api\/v1\/articles\/[0-9A-Z]{26}$/, () => modif.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(patch.status()).toBe(200);
    await expect(liste.getByRole('listitem').first()).toContainText(/1\s?300\sFCFA/);

    // Ordre (bureau et mobile ≥ 640 px seulement).
    const monter = liste.getByRole('listitem').first().getByRole('button', { name: 'Monter' });
    if (await monter.count()) {
      await expect(monter).toBeDisabled();
      const ordre = await attendreApi(page, 'POST', /\/articles\/ordre$/, () => liste.getByRole('listitem').first().getByRole('button', { name: 'Descendre' }).click());
      expect(ordre.status()).toBe(200);
      await expect(liste.getByRole('listitem').nth(1)).toContainText('Thé');
    }

    // Suppression : annuler puis confirmer (Bissap).
    const bissap = liste.getByRole('listitem').filter({ hasText: 'Bissap' });
    await bissap.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog', { name: /^Supprimer / }).getByRole('button', { name: /^Annuler/ }).click();
    await expect(bissap).toBeVisible();
    await bissap.getByRole('button', { name: 'Supprimer' }).click();
    const suppr = await attendreApi(page, 'DELETE', /\/api\/v1\/articles\/[0-9A-Z]{26}$/, () => page.getByRole('dialog', { name: /^Supprimer / }).getByRole('button', { name: /^Supprimer/ }).click());
    expect(suppr.status()).toBe(204);
    await expect(toast(page, 'Article supprimé')).toBeVisible();
    await expect(liste.getByRole('listitem')).toHaveCount(2);

    // Les articles actifs sont des tuiles de la caisse (bureau) ou dans la feuille « Articles » (mobile).
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    const boutonArticles = page.getByRole('button', { name: 'Articles', exact: true });
    if (await boutonArticles.count()) await boutonArticles.click();
    await page.getByRole('button', { name: new RegExp(`^${PREFIXE_TEST} Thé`) }).click();
    await expect(page.getByText(/Total/).first()).toBeVisible();
  });

  test('import CSV avec correspondance, rapport, export ; caissier en lecture', async ({ pageProprietaire: page, boutique, ouvrir }) => {
    test.setTimeout(150_000);
    await page.goto('/articles');
    await ecranPret(page, 'articles');
    await page.getByRole('button', { name: 'Importer' }).click();
    const assistant = page.getByRole('dialog', { name: 'Importer des articles' });
    await expect(assistant.getByLabel('Étape 1 sur 4')).toBeVisible();

    // Modèle téléchargeable, format refusé côté client.
    const [modele] = await Promise.all([page.waitForEvent('download'), assistant.getByRole('button', { name: /^Télécharger un modèle/ }).click()]);
    expect(modele.suggestedFilename()).toBe('modele-articles.csv');
    const fichier = assistant.locator('input[type=file]');
    await fichier.setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(assistant.getByText('Format non pris en charge : CSV ou Excel (.xlsx).')).toBeVisible();

    // CSV : 2 lignes valides + 1 ligne au prix illisible.
    const csv = `Désignation;Tarif;Catégorie;Référence\n${PREFIXE_TEST} Pagne;6000;Tissus;E2E-PG\n${PREFIXE_TEST} Bazin;15000;Tissus;E2E-BZ\n${PREFIXE_TEST} Erreur;abc;Tissus;E2E-ER\n`;
    const analyse = await attendreApi(page, 'POST', /\/imports\/analyser$/, () => fichier.setInputFiles({ name: 'articles-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }));
    expect(analyse.status()).toBe(201);
    await expect(assistant.locator('[data-import="colonnes"]')).toBeVisible();
    await expect(assistant.getByText(/4 colonnes · 3 lignes/)).toBeVisible();
    const colNom = assistant.getByRole('combobox', { name: 'Champ SatsPoint pour la colonne « Désignation »' });
    const colPrix = assistant.getByRole('combobox', { name: 'Champ SatsPoint pour la colonne « Tarif »' });
    await expect(colNom).toHaveValue('nom'); // suggestion automatique (synonymes)
    await expect(colPrix).toHaveValue('prix_xof');
    await expect(assistant.getByText(/1 ligne en erreur/)).toBeVisible();
    await capturer(page, '12-import-correspondance');

    // Prix ignoré → « Continuer » bloqué avec la raison ; rétabli.
    await colPrix.selectOption('');
    await expect(assistant.getByText(/Associez une colonne à\s?:\s?Prix \(FCFA\)/)).toBeVisible();
    await expect(assistant.getByRole('button', { name: /^Continuer/ })).toBeDisabled();
    await colPrix.selectOption('prix_xof');
    await assistant.getByRole('button', { name: /^Continuer/ }).click();

    // Mode « ignorer les lignes en erreur » → 2 créés, 1 en erreur, rapport.
    await assistant.getByRole('radio', { name: /^Ignorer les lignes en erreur/ }).click();
    const execution = await attendreApi(page, 'POST', /\/imports\/[0-9A-Z]{26}\/executer$/, () => assistant.getByRole('button', { name: /^Importer \d+ lignes?/ }).click());
    expect(execution.status()).toBe(202);
    await expect(assistant.getByText('Import terminé')).toBeVisible({ timeout: 30_000 });
    await expect(assistant.getByRole('region', { name: "Rapport d'erreurs" })).toBeVisible();
    await capturer(page, '12-import-termine');
    const [rapport] = await Promise.all([page.waitForEvent('download'), assistant.getByRole('button', { name: /^Télécharger le rapport/ }).click()]);
    expect(fs.readFileSync(await rapport.path()).toString('utf8')).toMatch(/abc|prix/i);
    await assistant.getByRole('button', { name: /^Terminer/ }).click();
    await expect(toast(page, /2 articles importés/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Articles' }).getByRole('listitem')).toHaveCount(2);
    const articles = await boutique.api.get('/articles');
    expect(articles.json.articles.map((a: { sku: string }) => a.sku).sort()).toEqual(['E2E-BZ', 'E2E-PG']);

    // Mode « tout ou rien » avec une ligne en erreur → échec, rien d'écrit.
    await page.goto('/articles?importer=1');
    const assistant2 = page.getByRole('dialog', { name: 'Importer des articles' });
    await expect(assistant2).toBeVisible();
    await attendreApi(page, 'POST', /\/imports\/analyser$/, () => assistant2.locator('input[type=file]').setInputFiles({ name: 'articles-e2e-2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv.replace(/E2E-(PG|BZ|ER)/g, 'E2E-X$1'), 'utf8') }));
    await assistant2.getByRole('button', { name: /^Continuer/ }).click();
    await assistant2.getByRole('radio', { name: /^Créer seulement les nouveaux/ }).click();
    await assistant2.getByRole('button', { name: /^Importer \d+ lignes?/ }).click();
    await expect(assistant2.getByText("L'import a échoué")).toBeVisible({ timeout: 30_000 });
    expect((await boutique.api.get('/articles')).json.articles).toHaveLength(2);
    await page.keyboard.press('Escape');

    // Export des articles (CSV, Excel).
    await page.goto('/articles');
    await ecranPret(page, 'articles');
    for (const [libelle, ext] of [[/^CSV/, 'csv'], [/^Excel/, 'xlsx']] as const) {
      await page.getByRole('button', { name: 'Exporter les articles' }).click();
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('menu', { name: /^Exporter/ }).getByRole('menuitem', { name: libelle }).click()]);
      expect(d.suggestedFilename()).toMatch(new RegExp(`^articles-.*\\.${ext}$`));
      if (ext === 'csv') expect(fs.readFileSync(await d.path()).toString('utf8')).toContain(`${PREFIXE_TEST} Pagne`);
      await expect(toast(page, 'Export téléchargé').first()).toBeVisible();
    }

    // Caissier : lecture seule, l'API refuse import et export.
    const caissier = await ajouterMembreTest(boutique, 'caissier');
    const { page: pageCaissier } = await ouvrir(caissier.etat);
    await pageCaissier.goto('/articles');
    await ecranPret(pageCaissier, 'articles');
    await expect(pageCaissier.getByRole('list', { name: 'Articles' }).getByRole('listitem')).toHaveCount(2);
    await expect(pageCaissier.getByRole('button', { name: 'Importer' })).toHaveCount(0);
    expect((await caissier.api.get('/exports/articles?format=csv')).status).toBe(403);
    void tolerer;
  });
});
