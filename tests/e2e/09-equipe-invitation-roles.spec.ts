import { capturer, ClientApi, creerCompteTelephone, ecranPret, etatCompte, expect, telephoneTest, test, tolerer } from './fixtures';
import { attendreApi, toast } from './outils/ui';

/**
 * Parcours 09 — Équipe : invitation par téléphone (lien affiché, copiable), annulation d'une invitation,
 * acceptation par la personne invitée (écran d'invitation), arrivée du membre en direct chez le propriétaire,
 * lien déjà utilisé / inconnu, changement de rôle, désactivation (deux sens, session coupée), réactivation,
 * retrait (deux sens), codes d'erreur (déjà membre, dernier propriétaire).
 */
test.describe('09 · Équipe', () => {
  test('inviter, accepter, rôles, désactiver, retirer', async ({ pageProprietaire: page, boutique, ouvrir }) => {
    test.setTimeout(180_000);
    tolerer(page, /\/api\/v1\/equipe\/invitations$/, 409); // invitation d'un membre déjà présent (volontaire)
    tolerer(page, /\/api\/v1\/equipe\/[0-9A-Z]{26}$/, 422); // dernier propriétaire (volontaire)
    await page.goto('/equipe');
    await ecranPret(page, 'equipe');
    await expect(page.getByRole('heading', { name: 'Équipe', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: "Vous êtes seul pour l'instant" })).toBeVisible();
    await capturer(page, '09-equipe-vide');

    // Invitation : validation, puis par téléphone → lien affiché et copiable.
    const telephone = telephoneTest();
    await page.getByRole('button', { name: /^Inviter/ }).first().click();
    const dialogue = page.getByRole('dialog', { name: 'Inviter une personne' });
    await dialogue.getByRole('button', { name: /^Inviter/ }).click();
    await expect(dialogue.getByText('Ce champ est obligatoire.')).toBeVisible();
    await dialogue.getByLabel('Téléphone ou e-mail').fill(telephone);
    await dialogue.getByRole('combobox', { name: 'Rôle' }).selectOption({ label: 'Caissier' });
    const invitation = await attendreApi(page, 'POST', /\/equipe\/invitations$/, () => dialogue.getByRole('button', { name: /^Inviter/ }).click());
    expect(invitation.status()).toBe(201);
    const lien = (await invitation.json()).invitation.lien as string;
    expect(lien).toMatch(/\/invitation\/[A-Za-z0-9]{40,64}$/);
    await expect(toast(page, 'Invitation envoyée')).toBeVisible();
    const lienDialogue = page.getByRole('dialog', { name: 'Invitation créée' });
    await expect(lienDialogue.getByLabel("Lien d'invitation")).toHaveValue(lien);
    await lienDialogue.getByRole('button', { name: /^Copier le lien/ }).click();
    await expect(toast(page, 'Lien copié')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(lien);
    await capturer(page, '09-invitation-lien');
    await lienDialogue.getByRole('button', { name: /^Fermer/ }).last().click();
    const invitations = page.getByRole('region', { name: 'Invitations en attente' });
    await expect(invitations.getByRole('listitem').filter({ hasText: 'Caissier' })).toHaveCount(1);

    // Une 2e invitation annulée.
    const jetable = await boutique.api.post('/equipe/invitations', { contact: telephoneTest(), role: 'gerant' });
    expect(jetable.status).toBe(201);
    // Même auteur : le signal temps réel est ignoré par conception (« on ignore ses propres modifications ») → rechargement.
    await page.reload();
    await ecranPret(page, 'equipe');
    await expect(invitations.getByRole('listitem')).toHaveCount(2);
    const annul = await attendreApi(page, 'DELETE', /\/equipe\/invitations\/[0-9A-Z]{26}$/, () =>
      invitations.getByRole('listitem').filter({ hasText: 'Gérant' }).getByRole('button', { name: "Annuler l'invitation" }).click(),
    );
    expect(annul.status()).toBe(204);
    await expect(invitations.getByRole('listitem')).toHaveCount(1);

    // La personne invitée ouvre le lien (sans compte), se connecte avec ce numéro puis accepte.
    const jeton = lien.split('/').pop()!;
    const { page: invite, surveillance: survInvite } = await ouvrir(undefined);
    survInvite.tolerer(new RegExp(`/api/v1/invitations/${jeton}$`), 410);
    survInvite.tolerer(/\/api\/v1\/invitations\/[A-Za-z0-9]{48}$/, 404);
    await invite.goto(`/invitation/${jeton}`);
    await expect(invite.getByRole('heading', { name: 'Vous êtes invité', level: 1 })).toBeVisible();
    await expect(invite.locator('[data-invitation]')).toContainText(boutique.nom);
    await expect(invite.locator('[data-invitation]')).toContainText('Caissier');
    await expect(invite.locator('[data-invitation]')).not.toContainText(telephone); // contact masqué
    await capturer(invite, '09-invitation-publique');
    await invite.getByRole('link', { name: /^J'ai déjà un compte/ }).click();
    await expect(invite).toHaveURL(new RegExp(`/connexion\\?suite=%2Finvitation%2F${jeton}$`));
    const compte = creerCompteTelephone('caissier invite', telephone);
    await invite.getByLabel('Téléphone ou e-mail').fill(telephone);
    await invite.getByLabel('Mot de passe', { exact: true }).fill(compte.motDePasse);
    await invite.getByRole('button', { name: /^Me connecter/ }).click();
    await expect(invite).toHaveURL(new RegExp(`/invitation/${jeton}$`));
    const accepter = await attendreApi(invite, 'POST', new RegExp(`/invitations/${jeton}/accepter$`), () => invite.getByRole('button', { name: /^Rejoindre la boutique/ }).click());
    expect(accepter.status()).toBe(200);
    await expect(invite).toHaveURL(/\/caisse$/);
    await expect(toast(invite, new RegExp(`^Bienvenue chez ${boutique.nom.slice(0, 20)}`))).toBeVisible();

    // Chez le propriétaire, sans recharger : le membre apparaît, l'invitation disparaît.
    const membres = page.getByRole('region', { name: 'Membres' });
    const ligneCaissier = membres.getByRole('listitem').filter({ hasText: 'caissier invite' });
    await expect(ligneCaissier).toBeVisible({ timeout: 5_000 });
    await expect(invitations).toHaveCount(0);

    // Lien déjà utilisé → invitation expirée ; jeton inventé → introuvable.
    const { page: autre, surveillance: survAutre } = await ouvrir(undefined);
    survAutre.tolerer(new RegExp(`/api/v1/invitations/${jeton}$`), 410);
    survAutre.tolerer(/\/api\/v1\/invitations\/Z{48}$/, 404);
    await autre.goto(`/invitation/${jeton}`);
    await expect(autre.getByRole('heading', { name: 'Invitation expirée' })).toBeVisible();
    await autre.goto(`/invitation/${'Z'.repeat(48)}`);
    await expect(autre.getByRole('heading', { name: 'Invitation introuvable' })).toBeVisible();

    // Inviter un membre déjà actif : message dédié.
    await page.getByRole('button', { name: /^Inviter/ }).first().click();
    const d2 = page.getByRole('dialog', { name: 'Inviter une personne' });
    await d2.getByLabel('Téléphone ou e-mail').fill(telephone);
    await d2.getByRole('button', { name: /^Inviter/ }).click();
    await expect(d2.getByText("Cette personne fait déjà partie de l'équipe.")).toBeVisible();
    await d2.getByRole('button', { name: /^Annuler/ }).click();

    // Changer le rôle : caissier → gérant → caissier.
    await ligneCaissier.getByRole('button', { name: 'Changer le rôle' }).click();
    const role = page.getByRole('dialog', { name: 'Changer le rôle' });
    await expect(role.getByRole('button', { name: /^Enregistrer/ })).toBeDisabled(); // rôle inchangé
    await role.getByRole('combobox', { name: 'Rôle' }).selectOption({ label: 'Gérant' });
    const modif = await attendreApi(page, 'PATCH', /\/equipe\/[0-9A-Z]{26}$/, () => role.getByRole('button', { name: /^Enregistrer/ }).click());
    expect(modif.status()).toBe(200);
    await expect(ligneCaissier.getByText('Gérant')).toBeVisible();
    await ligneCaissier.getByRole('button', { name: 'Changer le rôle' }).click();
    await page.getByRole('dialog', { name: 'Changer le rôle' }).getByRole('combobox', { name: 'Rôle' }).selectOption({ label: 'Caissier' });
    await page.getByRole('dialog', { name: 'Changer le rôle' }).getByRole('button', { name: /^Enregistrer/ }).click();
    await expect(ligneCaissier.getByText('Caissier', { exact: true }).first()).toBeVisible();

    // Désactiver : « Annuler » ne change rien ; confirmer coupe la session du membre ; réactiver.
    const apiMembre = await ClientApi.connecte(compte);
    await ligneCaissier.getByRole('button', { name: 'Désactiver' }).click();
    await page.getByRole('dialog', { name: /^Désactiver / }).getByRole('button', { name: /^Annuler/ }).click();
    await expect(ligneCaissier.getByText('Désactivé')).toHaveCount(0);
    await ligneCaissier.getByRole('button', { name: 'Désactiver' }).click();
    const desactivation = await attendreApi(page, 'PATCH', /\/equipe\/[0-9A-Z]{26}$/, () => page.getByRole('dialog', { name: /^Désactiver / }).getByRole('button', { name: /^Désactiver/ }).click());
    expect(desactivation.status()).toBe(200);
    await expect(ligneCaissier.getByText('Désactivé')).toBeVisible();
    await capturer(page, '09-equipe-membre-desactive');
    expect((await apiMembre.get('/ventes')).status).toBe(401);
    await ligneCaissier.getByRole('button', { name: 'Réactiver' }).click();
    await expect(ligneCaissier.getByText('Désactivé')).toHaveCount(0);

    // Dernier propriétaire : impossible de se rétrograder (message dédié, côté serveur).
    const moi = membres.getByRole('listitem').filter({ hasText: '(vous)' });
    await expect(moi.getByRole('button', { name: 'Changer le rôle' })).toHaveCount(0);
    const equipe = await boutique.api.get('/equipe');
    const monUlid = equipe.json.membres.find((m: { est_moi: boolean }) => m.est_moi).ulid;
    const dernier = await boutique.api.patch(`/equipe/${monUlid}`, { role: 'gerant' });
    expect(dernier.status).toBe(422);
    expect(dernier.json.code).toBe('DERNIER_PROPRIETAIRE');

    // Retirer : « Annuler » puis confirmer.
    await ligneCaissier.getByRole('button', { name: "Retirer de l'équipe" }).click();
    await page.getByRole('dialog', { name: /^Retirer / }).getByRole('button', { name: /^Annuler/ }).click();
    await expect(ligneCaissier).toBeVisible();
    await ligneCaissier.getByRole('button', { name: "Retirer de l'équipe" }).click();
    const retrait = await attendreApi(page, 'DELETE', /\/equipe\/[0-9A-Z]{26}$/, () => page.getByRole('dialog', { name: /^Retirer / }).getByRole('button', { name: /^Retirer de l'équipe/ }).click());
    expect(retrait.status()).toBe(204);
    await expect(ligneCaissier).toHaveCount(0);
    await page.reload();
    await ecranPret(page, 'equipe');
    await expect(page.getByRole('heading', { name: "Vous êtes seul pour l'instant" })).toBeVisible();
    await apiMembre.fermer();
    void etatCompte;
  });
});
