import { capturer, ecranPret, expect, test } from './fixtures';
import { attendreApi, encaisser, regexFCFA, taperMontant, toast } from './outils/ui';

/**
 * Parcours 03 — Encaisser en bitcoin (portefeuille simulé) : caisse → demande de paiement (QR, compte à rebours)
 * → « Simuler le paiement » → écran vert → reçu → la vente est « Payée » dans la liste, après rechargement.
 */
test.describe('03 · Encaissement Lightning simulé', () => {
  test('caisse → QR → règlement simulé → écran vert → reçu → vente payée', async ({ pageProprietaire: page, boutique }) => {
    await page.goto('/caisse');
    await ecranPret(page, 'caisse');
    await expect(page.getByRole('heading', { name: 'Caisse', level: 1 })).toBeVisible();
    const montant = page.getByLabel('Montant en FCFA');
    await expect(montant).toHaveText(/^0\sFCFA$/);
    await expect(page.getByRole('button', { name: /^Encaisser/ })).toBeDisabled();

    // Bornes : 50 FCFA → refusé avec la raison, puis 1 500 FCFA.
    await taperMontant(page, 50);
    await expect(page.getByRole('alert').filter({ hasText: "Le montant doit être d'au moins 100 FCFA." })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Encaisser/ })).toBeDisabled();
    await page.getByRole('button', { name: /^Effacer/ }).click();
    await page.getByRole('button', { name: /^Effacer/ }).click();
    await taperMontant(page, 1500);
    await expect(montant).toHaveText(regexFCFA(1500));
    await expect(page.getByText(/≈\s[\d\s ]+\ssats/).first()).toBeVisible();
    await capturer(page, '03-caisse-montant');

    // Un seul moyen actif (bitcoin) : la vente part directement.
    const vente = await encaisser(page);
    expect(vente.numero).toBe('V-000001');
    const ecran = page.locator('[data-ecran="paiement"]');
    await expect(ecran).toHaveAttribute('data-etat', 'en_attente');
    await expect(page.getByRole('heading', { name: 'Demande de paiement' })).toBeVisible();
    await expect(page.getByText(`Vente ${vente.numero}`)).toBeVisible();
    await expect(page.locator('[data-qr="pret"]')).toBeVisible();
    await expect(page.getByText(/Expire dans \d+:\d{2}/)).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Bitcoin/ })).toHaveAttribute('aria-selected', 'true');
    await capturer(page, '03-paiement-attente');

    // Vérifier : toujours en attente.
    const verif = await attendreApi(page, 'POST', /\/paiements\/[0-9A-Z]{26}\/verifier$/, () => page.getByRole('button', { name: 'Vérifier le paiement' }).click());
    expect(verif.status()).toBe(200);
    await expect(toast(page, 'Vérifié : toujours en attente du paiement.')).toBeVisible();

    // Copier la demande : le presse-papiers contient la facture (portefeuille simulé).
    await page.getByRole('button', { name: 'Copier la demande' }).click();
    await expect(toast(page, 'Demande copiée')).toBeVisible();
    const copie = await page.evaluate(() => navigator.clipboard.readText());
    expect(copie.toLowerCase()).toMatch(/^lnbc/);

    // Règlement simulé (le statut vient du serveur).
    const sim = await attendreApi(page, 'POST', /\/simuler$/, () => page.locator('[data-simuler]').click());
    expect(sim.status()).toBe(200);
    const succes = page.locator('[data-ecran="succes"]');
    await expect(succes).toBeVisible();
    await expect(succes.getByRole('heading', { name: 'Paiement reçu' })).toBeVisible();
    await expect(succes.getByText(regexFCFA(1500))).toBeVisible();
    await expect(succes.getByText(/sats · par Bitcoin/)).toBeVisible();

    // Reçu : bouton actif dès que le lien est prêt, copie du lien.
    const boutonRecu = succes.getByRole('button', { name: /^Envoyer le reçu/ });
    await expect(boutonRecu).toBeEnabled();
    await capturer(page, '03-succes');
    await boutonRecu.click();
    const dialogue = page.getByRole('dialog', { name: 'Envoyer le reçu' });
    await expect(dialogue).toBeVisible();
    await expect(dialogue.getByText(/\/r\/[A-Za-z0-9]{32}/)).toBeVisible();
    await expect(dialogue.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
    await dialogue.getByRole('button', { name: 'Copier le lien' }).click();
    await expect(toast(page, 'Lien du reçu copié')).toBeVisible();
    const lienRecu = await page.evaluate(() => navigator.clipboard.readText());
    expect(lienRecu).toMatch(/\/r\/[A-Za-z0-9]{32}$/);

    // Donnée réellement enregistrée : rechargement → toujours payée ; liste des ventes.
    await page.reload();
    await expect(page.locator('[data-ecran="succes"]')).toBeVisible();
    await page.getByRole('button', { name: /^Nouvelle vente/ }).click();
    await expect(page).toHaveURL(/\/caisse$/);
    await page.goto('/ventes');
    await ecranPret(page, 'ventes');
    await expect(page.getByRole('button', { name: new RegExp(`${vente.numero}\\b.*Payée.*1\\s?500\\sFCFA`) })).toBeVisible();

    const api = await boutique.api.get(`/ventes/${vente.ulid}`);
    expect(api.json.vente.statut).toBe('payee');
    expect(api.json.vente.paiement_reussi.methode).toBe('lightning');
    expect(api.json.vente.paiement_reussi.simule).toBe(true);
    expect(api.json.vente.recu_url).toMatch(/^\/r\/[A-Za-z0-9]{32}$/);
  });
});
