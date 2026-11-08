# SatsPoint — front (PWA)

Point de vente Lightning + mobile money pour commerçants. React 19 · TypeScript · Vite 8 · Tailwind 4 · Radix UI · TanStack Query · React Router 7 · i18next · Laravel Echo (Reverb) · vite-plugin-pwa.

Les règles produit, design et sécurité sont dans [`docs/DIRECTIVES.md`](../docs/DIRECTIVES.md) et [`docs/CAHIER_DES_CHARGES.md`](../docs/CAHIER_DES_CHARGES.md) : elles priment sur ce fichier.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement sur **http://localhost:5190** (port strict). Proxy vers l'API `http://localhost:8120` pour `/api`, `/sanctum`, `/broadcasting`, `/webhooks`, `/audio` et `/r` (les navigations HTML vers `/r/...` restent servies par la SPA). |
| `npm run dev:mock` | Idem, avec l'API **simulée dans le navigateur** (`.env.mock` → `VITE_MOCK_API=true`). Comptes : `proprio@demo.test`, `gerant@demo.test`, `caissier@demo.test`, `super@demo.test`, `nouveau@demo.test` — mot de passe `demo12345678`. Le mock (`src/api/mock.ts`) n'est jamais inclus dans le build. |
| `npm run typecheck` | `tsc -b` (strict, `noUncheckedIndexedAccess`). |
| `npm run lint` | oxlint (zéro avertissement attendu). |
| `npm test` | Vitest + jsdom : formats, parité i18n FR/EN, hook temps réel, `HautParleur`, `Bouton`. |
| `npm run build` | Typecheck puis build de production (PWA : `sw.js`, `manifest.webmanifest`, `.vite/manifest.json`). |
| `npm run taille` | Mesure le JavaScript du premier écran (gzip/brotli) à partir du build ; échoue au-delà de **170 Ko gzip**. |
| `npm run icones` | Régénère `public/icones/*.png` (192/512, maskable, apple-touch) depuis un SVG, via le Chromium de Playwright. |
| `npm run captures` | Lance Vite en mode mock et capture les écrans clés en 390×844 et 1366×768, clair/sombre, FR/EN dans `../captures/socle/` ; échoue à la moindre erreur console, requête en échec ou clé i18n brute. |
| `npm run preview` | Sert le build sur le port 5190. |

Node 24, pas de Docker nécessaire pour le front. Première fois : `npx playwright install chromium` (icônes et captures).

## Structure

```
src/
├── api/            client HTTP typé (CSRF Sanctum, erreurs normalisées, 401 → connexion), un fichier par domaine, mock dev
├── auth/           store de session (zustand), useMoi / mutations (connexion, inscription, préférences…), rôles
├── composants/     design system : Bouton, BoutonIcone, Champ, Carte, Pastille, Dialogue, Toast, Onglets, Interrupteur, Squelette, EtatVide, Infobulle…
├── coquille/       coquille connectée : barre latérale (bureau), barre du bas (mobile), en-tête, recherche Ctrl/⌘+K, sélecteurs, menu compte, bandeau démo
├── ecrans/         un fichier par écran (chargés à la demande) ; `auth/` et `admin/` ; `PageVide` = gabarit d'écran sans données
├── i18n/           fr.json (embarqué), en.json (chargé à la demande), init i18next, test de parité
├── lib/            format (FCFA, sats, dates Africa/Dakar), thème, stockage local, queryClient, cn
├── routes/         routeur, gardes (session, rôle, super-admin, boutique), navigation hors React
├── styles/         jetons CSS (clair / sombre / auto), base, utilitaires Tailwind
├── temps-reel/     Echo singleton, abonnements aux canaux, bus de signaux, useDonneesEnDirect, useSaisieEnCours
├── voix/           aide vocale : store, manifestes audio, lecteur unique, HautParleur, annoncer()
└── test/           setup Vitest
```

## Conventions

### Design
- Jetons dans `src/styles/jetons.css` (`--fond`, `--surface`, `--texte-2`, `--accent` = orange Bitcoin `#F7931A`, `--mm` = mobile money, `--succes`, `--attente`, `--danger`…), exposés à Tailwind dans `src/styles/index.css` (`bg-surface`, `text-texte-2`, `border-bordure`, `rounded-md`…). **Aucune couleur en dur dans les composants.**
- Thème : `data-theme="clair|sombre"` sur `<html>` ; « auto » = attribut absent + `prefers-color-scheme`. Appliqué avant le premier rendu par le script inline de `index.html`.
- Compact : base 14 px, grille 4 px, cibles tactiles ≥ 44 px au doigt (hauteurs réduites au pointeur via `md:`).
- Montants : `formaterFCFA`, `formaterSats`, classe `tabulaire`. Dates : toujours au fuseau `Africa/Dakar` (`src/lib/format.ts`).
- Les libellés d'action longs deviennent des `BoutonIcone` (icône Lucide + infobulle + `aria-label` + `voix`).
- Les fenêtres (`Dialogue`) et les infobulles sont chargées à la demande : rien dans le JavaScript initial.

### i18n
- **Aucun texte en dur.** Clés `ecran.element` en camelCase : `caisse.encaisser`, `auth.connexion.titre`, `ventes.vide.texte`.
- Toute clé existe dans `fr.json` **et** `en.json` : `src/i18n/parite.test.ts` échoue sinon (clés, valeurs vides, paramètres `{{…}}`).
- Typographie française : espace fine insécable (` `) avant `? ! : ;`.

### Aide vocale
- La **clé vocale est la clé i18n** : `<Bouton voix="caisse.encaisser">`, `<BoutonIcone voix="ventes.exporter">`, `<HautParleur cle="langue.wo" langue="wo" />`.
- Un haut-parleur n'apparaît que si un audio existe pour la clé (langue choisie, puis repli `fr`) ; sinon rien (jamais de haut-parleur muet). Il est masqué quand l'aide vocale est désactivée, sauf sur le sélecteur de langue.
- Un seul son à la fois (`src/voix/lecteur.ts`) ; `annoncer('caisse.paiementRecu')` pour les annonces automatiques.
- Manifestes `GET /audio/manifeste/{langue}` mis en cache une heure (TanStack) et relus sur le signal temps réel `audios`.

### Données et temps réel
- Appels via `src/api/client.ts` (`http.get/post/patch/delete`) ; jamais de `fetch` direct dans un écran. Les erreurs sont des `ErreurApi` (statut, code, `errors` de validation) ; les messages affichés passent par i18n (`useMessageErreur`).
- Chaque écran qui affiche des données appelle `useDonneesEnDirect(['rubrique'], recharger)` avec `recharger = () => queryClient.invalidateQueries(...)` (rechargement silencieux : le cache n'est jamais vidé). Le hook ignore ses propres modifications, regroupe sur 800 ms, attend la visibilité de l'onglet et ne recharge jamais pendant une saisie (`useSaisieEnCours()` dans les formulaires).

### Contrat API (`/api/v1`)
Cookies de session Sanctum (`credentials: 'include'`), `GET /sanctum/csrf-cookie` avant la première requête mutante puis en-tête `X-XSRF-TOKEN`, `Accept: application/json`. Routes utilisées par le socle : `GET /config`, `POST /auth/inscription|connexion|deconnexion`, `POST /auth/mot-de-passe/oubli|reinitialisation`, `GET /moi`, `PATCH /moi/preferences`, `GET /audio/manifeste/{langue}`, `GET /r/{jeton}` (JSON). Temps réel : Echo + Reverb, canaux `private-boutique.{ulid}`, `private-user.{ulid}`, `plateforme`, `private-admin` ; événement unique `.donnees.modifiees` `{ rubrique, auteur, horodatage }`.

## Ajouter un écran

1. Créer `src/ecrans/MonEcran.tsx` (export par défaut), racine avec `data-ecran="mon-ecran"`. Pour un écran sans données, partir de `PageVide` ; sinon `EnTetePage` + composants du design system.
2. Ajouter les clés dans `fr.json` **et** `en.json` (`monEcran.titre`, `monEcran.vide.titre`…).
3. Déclarer le chargement à la demande dans `src/routes/ecrans.ts`, puis la route dans `src/routes/index.tsx` sous la bonne garde (`RequiertSession` → `Coquille` → `RequiertBoutique` ; `RequiertRole` pour les rubriques réservées ; `RequiertSuperAdmin` pour `/admin/*`).
4. Si l'écran est une rubrique de navigation : l'ajouter dans `src/coquille/navigation.ts` (rôles autorisés, `barreBas` pour la barre mobile, `cleCourte` si le libellé est long).
5. Brancher `useDonneesEnDirect([...rubriques], recharger)` et donner une clé `voix` à chaque action.
6. Lancer `npm run typecheck && npm run lint && npm test`, puis `npm run captures` et regarder les captures (390 px et 1366 px, clair et sombre, FR et EN).
