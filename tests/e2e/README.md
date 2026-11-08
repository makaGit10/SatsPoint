# Tests de bout en bout (Playwright)

Méthode : [docs/DIRECTIVES.md § 4 et annexe A.3](../../docs/DIRECTIVES.md). Carte de l'application et parcours : [`PARCOURS.md`](PARCOURS.md). Résultats : [`RAPPORT.md`](RAPPORT.md).

## Lancer

```bash
# Pile de dev démarrée : API http://localhost:8120 (docker compose), Reverb :8125, file + planificateur,
# front Vite sans mock : cd web && npm run dev   (http://localhost:5190)
cd tests/e2e
npm install && npm run install-navigateurs
npm test                         # les deux tailles (bureau 1366×768, mobile 390×844)
npm run test:mobile              # téléphone seulement
npx playwright test 18-          # un parcours
npm run rapport                  # rapport HTML
```

- Les mots de passe des comptes de démo sont lus dans le `.env` racine (`DEMO_PASSWORD`) par `outils/env.ts` s'ils ne sont pas fournis (`E2E_MDP_DEMO`). Rien n'est écrit sur disque, sauf les sessions en cache dans `.auth/` (non versionné, supprimées en fin de suite sauf celles de la démo).
- `E2E_BASE_URL` (défaut `http://localhost:5190`) : URL du front. Pour mesurer la performance sur le build : `npm run build` puis `vite preview`, et `E2E_BASE_URL` sur le port du preview.
- Données de test : comptes créés par `php artisan e2e:compte TEST-E2E-<date>` (local uniquement, mot de passe aléatoire), boutiques créées par l'API réelle (`POST /boutique`) reliées à un portefeuille **simulé** (`PUT /boutique/wallet { uri: 'mock://e2e-…' }`). Tout est supprimé avant et après la suite par `php artisan e2e:nettoyer TEST-E2E-` (global-setup / global-teardown), et après les tests qui publient des audios.
- La boutique démo est branchée sur un **vrai** portefeuille : seuls des écrans en lecture et le parcours 21 (facture réelle de 100 FCFA **annulée**, sans paiement) l'utilisent.

## Règles
- Jamais la production. Port de test fixe. On n'arrête jamais un processus qu'on n'a pas lancé.
- Aucun `waitForTimeout` : attendre un élément, une réponse ou une trame WebSocket. Seuls les constats d'**absence** du parcours 18 (« aucun rechargement pendant 12 s ») utilisent une fenêtre d'observation explicite.
- Zéro réponse 4xx/5xx inattendue et zéro erreur console : la surveillance de chaque page (fixture `ouvrir`) échoue sinon ; les réponses volontaires sont déclarées (`tolerer(page, motif, statut)`).
- Un test qui passe à la relance est instable : corriger le test, pas l'application.

## Fichiers
- `playwright.config.ts` — projets `bureau` et `mobile`, `retries: 1`, `trace: retain-on-failure`, nettoyage global.
- `fixtures.ts` — client API avec session (CSRF Sanctum), sessions par rôle, boutique de test, membres par invitation, surveillance réseau/console, captures.
- `outils/` — saisie au pavé, attentes d'API, toasts (`ui.ts`) ; super-admin de test avec 2FA (TOTP calculé), dépôt / publication d'audios (`admin.ts`) ; lecture du `.env` (`env.ts`) ; nettoyage (`global-setup.ts`, `global-teardown.ts`).
- `01-…` à `21-…` — un fichier par parcours métier ; `22-audits-…` — accessibilité (axe-core), performance (web-vitals, CPU ×4, Slow 4G), en-têtes / CORS / cookies, délai règlement → écran vert.
- `../../captures/<date>/` — captures de référence et preuves de défauts.
