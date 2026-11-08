import { ClientApi, creerBoutiqueTest, creerVente, ecranPret, etatDemo, expect, test, tolerer } from './fixtures';

/**
 * Parcours 20 — Sécurité des accès directs : routes privées sans session (retour exact après connexion),
 * redirections ouvertes refusées, API anonyme 401, CSRF obligatoire, cloisonnement entre deux boutiques
 * (IDOR sur ventes, paiements, articles, équipe, imports), console refusée aux commerçants.
 */
test.describe('20 · Sécurité : accès directs', () => {
  test('visiteur : routes privées → connexion, puis retour exact ; pas de redirection ouverte', async ({ ouvrir, boutique }) => {
    const { page, surveillance } = await ouvrir(undefined);
    surveillance.tolerer(/\/api\/v1\/ventes\/x$/, 404); // identifiant de vente inventé dans `?vente=x` (volontaire)
    const privees = ['/caisse', '/ventes', '/tableau-de-bord', '/articles', '/demarrage', '/portefeuille', '/equipe', '/reglages', '/securite/2fa', '/admin', '/admin/studio', `/caisse/paiement/${'0'.repeat(26)}`];
    for (const chemin of privees) {
      await page.goto(chemin);
      await expect(page, chemin).toHaveURL(new RegExp(`/connexion\\?suite=${encodeURIComponent(chemin).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    }
    // Connexion → retour exact sur la page demandée.
    await page.goto(`/connexion?suite=${encodeURIComponent('/ventes?vente=x')}`);
    await page.getByLabel('Téléphone ou e-mail').fill(boutique.compte.identifiant);
    await page.getByLabel('Mot de passe', { exact: true }).fill(boutique.compte.motDePasse);
    await page.getByRole('button', { name: /^Me connecter/ }).click();
    await expect(page).toHaveURL(/\/ventes(\?vente=x)?$/);
    await ecranPret(page, 'ventes');

    // Redirections ouvertes : jamais un autre hôte.
    for (const suite of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
      const { page: p } = await ouvrir(undefined);
      await p.goto(`/connexion?suite=${encodeURIComponent(suite)}`);
      await p.getByLabel('Téléphone ou e-mail').fill(boutique.compte.identifiant);
      await p.getByLabel('Mot de passe', { exact: true }).fill(boutique.compte.motDePasse);
      await p.getByRole('button', { name: /^Me connecter/ }).click();
      await expect(p).toHaveURL(/^http:\/\/localhost:\d+\/caisse$/);
    }
  });

  test('API : 401 sans session, 419 sans jeton CSRF, mauvais identifiants génériques', async ({ ouvrir }) => {
    const anonyme = await ClientApi.anonyme();
    for (const chemin of ['/moi', '/ventes', '/cours', '/wallet', '/boutique', '/admin/statistiques']) expect((await anonyme.get(chemin)).status, chemin).toBe(401);
    const sansCsrf = await anonyme.ctx.post('/api/v1/auth/connexion', { data: { identifiant: 'x@y.z', password: 'abcdefghijkl' } });
    expect(sansCsrf.status()).toBe(419);
    const faux = await anonyme.post('/auth/connexion', { identifiant: 'personne-inconnue@e2e.satspoint.test', password: 'mauvais-mot-de-passe' });
    expect(faux.status).toBe(401);
    expect(JSON.stringify(faux.json)).not.toMatch(/existe|inconnu|not found/i);
    await anonyme.fermer();

    // Écran : message générique « Téléphone ou mot de passe incorrect. » (et non « session expirée »).
    const { page, surveillance } = await ouvrir(undefined);
    surveillance.tolerer(/\/api\/v1\/auth\/connexion$/, 401);
    await page.goto('/connexion');
    await page.getByLabel('Téléphone ou e-mail').fill('personne-inconnue@e2e.satspoint.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: /^Me connecter/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Téléphone ou mot de passe incorrect.' })).toBeVisible();
  });

  test('cloisonnement : aucune donnée d’une boutique B lisible ou modifiable depuis A (IDOR)', async ({ pageProprietaire: page, boutique }) => {
    const autre = await creerBoutiqueTest('P20B');
    const { vente, paiement } = await creerVente(autre.api, 1200);
    const article = (await autre.api.post('/articles', { nom: 'Article B', prix_xof: 100, couleur: '#16A34A' })).json.article;
    const equipeB = (await autre.api.get('/equipe')).json.membres[0];
    const a = boutique.api;
    const tentatives: Array<[string, string, unknown?]> = [
      ['GET', `/ventes/${vente.ulid}`],
      ['POST', `/ventes/${vente.ulid}/annuler`],
      ['POST', `/ventes/${vente.ulid}/paiements`, { methode: 'lightning' }],
      ['GET', `/paiements/${paiement.ulid}`],
      ['POST', `/paiements/${paiement.ulid}/verifier`],
      ['POST', `/paiements/${paiement.ulid}/simuler`],
      ['POST', `/paiements/${paiement.ulid}/confirmer-manuellement`, { confirmation: true }],
      ['PATCH', `/articles/${article.ulid}`, { nom: 'pirate' }],
      ['DELETE', `/articles/${article.ulid}`],
      ['PATCH', `/equipe/${equipeB.ulid}`, { role: 'caissier' }],
      ['DELETE', `/equipe/${equipeB.ulid}`],
    ];
    for (const [methode, chemin, corps] of tentatives) {
      const r = await a.requete(methode, chemin, corps);
      expect([403, 404], `${methode} ${chemin} → ${r.status}`).toContain(r.status);
      expect(r.texte).not.toContain(autre.nom);
    }
    // Rien n'a bougé chez B.
    expect((await autre.api.get(`/ventes/${vente.ulid}`)).json.vente.statut).toBe('en_attente');
    expect((await autre.api.get('/articles')).json.articles[0].nom).toBe('Article B');
    // Listes : jamais les données de B.
    expect(JSON.stringify((await a.get('/ventes?periode=30j')).json)).not.toContain(vente.ulid);
    expect(JSON.stringify((await a.get('/articles')).json)).not.toContain(article.ulid);
    // Écran de paiement d'une vente de B : introuvable.
    tolerer(page, /\/api\/v1\/paiements\/[0-9A-Z]{26}/, 404);
    await page.goto(`/caisse/paiement/${paiement.ulid}`);
    await expect(page.getByRole('heading', { name: 'Cette demande de paiement est introuvable.' })).toBeVisible();
    // Console plateforme : refusée à un commerçant (API).
    expect((await a.get('/admin/journal')).status).toBe(403);
    expect((await a.patch(`/admin/boutiques/${autre.ulid}`, { statut: 'suspendue' })).status).toBe(403);
    // Boutique démo (réelle) : rien de lisible depuis la boutique de test.
    const demo = await ClientApi.depuisEtat(await etatDemo('proprietaire'));
    const ventesDemo = (await demo.get('/ventes?periode=30j')).json.ventes as Array<{ ulid: string }>;
    if (ventesDemo.length) expect([403, 404]).toContain((await a.get(`/ventes/${ventesDemo[0]!.ulid}`)).status);
    await demo.fermer();
    await autre.api.fermer();
  });
});
