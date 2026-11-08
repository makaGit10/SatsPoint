# Tests de bout en bout (Playwright)

Méthode : [docs/DIRECTIVES.md § 4 et annexe A.3](../../docs/DIRECTIVES.md). On cartographie **avant** d'écrire un test (`PARCOURS.md`), un fichier par parcours métier numéroté (`01-connexion.spec.ts`, `02-encaissement-lightning.spec.ts`…), vraies assertions, zéro 4xx/5xx inattendu, zéro erreur console, tous les boutons testés, captures en 1366×768 **et** 390×844, rapport final `RAPPORT.md`.

## Lancer

```bash
# Pile de test démarrée : API http://localhost:8120, front http://localhost:5190 (ou la PWA servie par Caddy sur :8120)
cd tests/e2e
npm install && npm run install-navigateurs
E2E_MDP_DEMO=… E2E_MDP_ADMIN=… npm test            # les deux tailles
npm run test:mobile                                  # téléphone seulement
npm run rapport                                      # rapport HTML
```

Variables : `E2E_BASE_URL` (défaut `http://localhost:5190`), `E2E_API_URL` (défaut `http://localhost:8120`), `E2E_MDP_DEMO`, `E2E_MDP_ADMIN`, `E2E_ADMIN_EMAIL`. Les mots de passe viennent du `.env` racine (`DEMO_PASSWORD`, `SUPERADMIN_PASSWORD`), jamais du code.

## Règles
- Jamais la production. Port de test fixe. On n'arrête jamais un processus qu'on n'a pas lancé.
- Données créées avec le préfixe `TEST-E2E-<date>`, supprimées à la fin même en cas d'échec.
- Aucun `waitForTimeout` : attendre un élément, une réponse ou un état.
- Un test qui passe à la relance est instable : corriger le test, pas l'application.
- Ne jamais modifier l'application pour faire passer un test : décrire le défaut dans `RAPPORT.md`.

## Fichiers
- `playwright.config.ts` — projets `bureau` (1366×768) et `mobile` (390×844), `retries: 1`, `trace: retain-on-failure`.
- `fixtures.ts` — connexion par rôle, surveillance réseau/console, captures nommées.
- `PARCOURS.md` — carte réelle de l'application (écrans, droits, boutons, effets attendus) et parcours métier.
- `RAPPORT.md` — résultats, boutons OK/KO, défauts par gravité, captures conservées/supprimées.
- `../../captures/<date>/` — captures de référence et preuves de défauts.
