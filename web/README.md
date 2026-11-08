# SatsPoint — front (PWA)

Point de vente Lightning + mobile money pour commerçants. React 19 · TypeScript · Vite 8 · Tailwind 4 · Radix UI · TanStack Query · React Router 7 · i18next · Laravel Echo (Reverb) · `qrcode` · vite-plugin-pwa.

Les règles produit, design et sécurité sont dans [`docs/DIRECTIVES.md`](../docs/DIRECTIVES.md) et [`docs/CAHIER_DES_CHARGES.md`](../docs/CAHIER_DES_CHARGES.md) ; le contrat exact des échanges avec le back est dans [`docs/CONTRAT_API.md`](../docs/CONTRAT_API.md). Ils priment sur ce fichier.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement sur **http://localhost:5190** (port strict). Proxy vers l'API `http://localhost:8120` pour `/api`, `/sanctum`, `/broadcasting`, `/webhooks`, `/audio` et `/r` (les navigations HTML vers `/r/...` restent servies par la SPA). |
| `npm run dev:mock` | Idem, avec l'API **simulée dans le navigateur** (`.env.mock` → `VITE_MOCK_API=true`). Comptes : `proprio@demo.test`, `gerant@demo.test`, `caissier@demo.test`, `super@demo.test`, `nouveau@demo.test` — mot de passe `demo12345678`. Le mock (`src/api/mock.ts`) n'est jamais inclus dans le build. |
| `npm run typecheck` | `tsc -b` (strict, `noUncheckedIndexedAccess`). |
| `npm run lint` | oxlint (zéro avertissement attendu). |
| `npm test` | Vitest + jsdom : formats, parité i18n FR/EN (paquets à la demande compris), hook temps réel, `HautParleur`, `Bouton`, compte à rebours, machine d'état de l'écran de paiement (faux signal temps réel), saisie du pavé / panier / arrondi des sats, formatage du reçu, écran de succès, tracé de la courbe ; **vague 3** : registre des clés vocales (extraction, à jour, textes FR/EN, aucun bouton sans clé vocale), suggestions / correspondance d'import, recherche globale (récentes, navigation ↑ ↓ Entrée Échap, annulation, hors ligne), machine d'état d'enregistrement du studio (MediaRecorder simulé), gardes 2FA. |
| `npm run cles-vocales` | Régénère `src/voix/cles-vocales.json` (registre des clés vocales, CONTRAT_API § V3.1) ; `--verifier` n'écrit rien et échoue si le fichier n'est pas à jour. Échoue aussi si une clé vocale n'a pas de texte FR/EN ou si un bouton n'a pas de clé vocale. |
| `npm run build` | Registre des clés vocales, typecheck puis build de production (PWA : `sw.js`, `manifest.webmanifest`, `.vite/manifest.json`). |
| `npm run taille` | Mesure le JavaScript du premier écran (gzip/brotli) à partir du build ; échoue au-delà de **170 Ko gzip**. |
| `npm run icones` | Régénère `public/icones/*.png` (192/512, maskable, apple-touch : éclair or sur fond blanc) depuis un SVG, via le Chromium de Playwright. `public/favicon.svg` a sa variante sombre intégrée (`prefers-color-scheme`). |
| `npm run captures` | Lance Vite en mode mock et capture **48 écrans et états** (vague 3 : studio matrice / enregistrement / prise prête, console 4 onglets + suspension, 2FA activation / codes de secours / vérification / active, recherche récentes / résultats, import correspondance / progression, invitation, menu d'export ; le micro est simulé par Chromium) (caisse vide / avec montant / choix du moyen / cours indisponible, paiement Lightning / mobile money / Wave direct / expiré, succès, ventes + filtres + détail, tableau de bord, portefeuille + aperçu d'envoi + non connecté, réglages, démarrage, équipe, articles, reçu…) en 390×844 et 1366×768 (+ 1920×880 pour les écrans marqués `large` : caisse), clair/sombre, FR/EN dans `../captures/vague3/` ; inscription (vide / saisie / erreurs), caisse sans moyen de paiement (levier mock `satspoint.mock.moyens = aucun`) ; échoue à la moindre erreur console, requête en échec ou clé i18n brute (les identifiants techniques marqués `data-technique` — clés du studio, codes du journal — sont exclus). Options : `--seulement 09,13`, `--vues mobile`, `--themes clair`, `--locales fr`, `--dossier …`, `--garder-serveur`. |
| `npm run preview` | Sert le build sur le port 5190. |

Node 24, pas de Docker nécessaire pour le front. Première fois : `npx playwright install chromium` (icônes et captures).

## Structure

```
src/
├── api/            client HTTP typé (CSRF Sanctum, multipart, erreurs normalisées, 401 → connexion, 403 DEUX_FA_REQUISE → 2FA), un fichier par domaine
│                   (cours, ventes, tableauDeBord, wallet, boutique, articles, equipe, recu, moi, auth, config, audio, admin, deuxFa, recherche,
│                   imports, exports, invitations, telechargement), types du contrat, mock dev (mock.ts + mockV3.ts)
├── auth/           store de session (zustand), useMoi / mutations (connexion, inscription, préférences…), rôles
├── composants/     design system : Bouton, BoutonIcone, Champ, Selection, Segment, Carte, Pastille, Statuts (pastilles de statut, icône du moyen),
│                   QrCode, Dialogue, Toast, Onglets, Interrupteur, Squelette, EtatVide, Infobulle…
├── coquille/       coquille connectée : barre latérale (bureau), barre du bas (mobile), en-tête, recherche Ctrl/⌘+K (recherche/ : panneau, index local, fusion), sélecteurs, menu compte,
│                   bandeau démo, bandeau de progression du démarrage
├── ecrans/         un fichier par écran (chargés à la demande) + sous-dossiers par écran :
│   ├── Caisse.tsx + caisse/        pavé (Pave, saisie.ts), articles rapides + panier (Articles, panier.ts), feuille de choix du moyen (ChoixMethode)
│   ├── paiement/                   écran de paiement plein écran (Paiement), machine d'état (useSuiviPaiement), écran de succès (Succes)
│   ├── Ventes.tsx + ventes/        ligne partagée (LigneVente), filtres (FiltresVentes, filtres.ts), détail (DetailVente)
│   ├── TableauDeBord.tsx + tableau/ courbe SVG maison (Courbe, trace.ts)
│   ├── Portefeuille.tsx + portefeuille/ Recevoir, Envoyer (4 étapes), Scanner (BarcodeDetector), Historique, ConnexionWallet (réutilisé par le démarrage)
│   ├── Reglages.tsx + reglages/    FormulaireBoutique, FormulairePaiements, FormulairePaytech
│   ├── Demarrage.tsx, Equipe.tsx, Articles.tsx + articles/ (assistant d'import, correspondance.ts), Recu.tsx (public), Invitation.tsx (public)
│   ├── admin/                      Console (4 onglets : console/) et StudioAudio (studio/ : matrice, panneau, couverture, machine d'état du micro)
│   ├── securite/                   DeuxFacteurs (activation / désactivation) et VerificationDeuxFacteurs (code après connexion)
│   ├── auth/, PageVide (gabarit sans données)
├── i18n/           fr.json (embarqué), en.json (à la demande), paquets à la demande `admin|gestion|extras.{fr,en}.json`, init i18next, test de parité
├── lib/            format (FCFA, sats, dates Africa/Dakar), temps (relatif, secondes restantes), useCompteARebours, retours (vibration, son, copier,
│                   partager), methodes (libellés, QR Lightning), couleursArticles, thème, stockage local, queryClient, cn
├── routes/         routeur, gardes (session, rôle, super-admin, boutique), navigation hors React
├── styles/         jetons CSS (clair / sombre / auto, tuiles d'articles), base, utilitaires Tailwind
├── temps-reel/     Echo singleton, abonnements aux canaux, bus de signaux, useDonneesEnDirect, useSaisieEnCours
├── voix/           aide vocale : store, manifestes audio, lecteur unique, HautParleur, annoncer(), registre `cles-vocales.json` (généré)
└── test/           setup Vitest
```

## Écrans de la vague 2

| Route | Écran | Rubriques temps réel |
|---|---|---|
| `/caisse` | Pavé plein écran (touches 64 px, `000`, ⌫ appui long = tout effacer, vibration), montant + `≈ sats` depuis `GET /cours` (60 s), bornes affichées, note, articles rapides + panier (P1), feuille « Comment le client paie-t-il ? » → `POST /ventes`. Clavier physique sur bureau. | `parametres`, `articles`, `wallet` |
| `/caisse/paiement/:ulid` | Plein écran hors coquille. Onglets Bitcoin \| Mobile money (changer d'onglet ou d'opérateur = nouvelle tentative `POST /ventes/{ulid}/paiements`), QR `LIGHTNING:<BOLT11>` ou QR du lien PayTech / Wave, compte à rebours, copier / partager / vérifier (`POST …/verifier`) / annuler, « Simuler le paiement » si `paiement.simule`, Wave direct → « Confirmer la réception » (propriétaire/gérant). Expiré → « Nouvelle demande de paiement ». **Le statut vient toujours du serveur** : `useSuiviPaiement` relit `GET /paiements/{ulid}` sur signal `paiements`/`ventes` et toutes les 3 s en secours. Succès → écran vert, son, vibration, `annoncer('paiement.recu')`, reçu (WhatsApp, SMS, copie, Web Share), alertes `trop_percu` / `payee_apres_annulation`. `?test=1` = paiement test du démarrage. | `paiements`, `ventes` |
| `/r/:jeton` | Reçu public sans session, imprimable (`print:`), FR/EN. | — |
| `/ventes` | Liste compacte, recherche, filtres (période, statut, moyen, caissier), curseur « Voir plus », totaux, détail (lignes, tentatives, cours, horodatages, reçu), actions reçu / reprendre / annuler / confirmer, export CSV. Caissier : ses ventes du jour. | `ventes`, `paiements` |
| `/tableau-de-bord` | Cartes (CA, ventes, panier moyen, répartition), période, courbe SVG maison, dernières ventes, comparaison. Caissier : ses chiffres du jour. | `ventes`, `paiements` |
| `/portefeuille` | Solde sats + FCFA, Recevoir (QR), Envoyer (coller/scanner → aperçu → mot de passe → résultat, propriétaire seulement), historique, connexion NWC / révocation. | `wallet`, `parametres` |
| `/reglages` | Boutique, réglages (expiration 2–15 min, montant max, moyens, message de reçu, lien Wave), PayTech (clés jamais réaffichées), préférences. | `parametres` |
| `/demarrage` | 4 étapes (boutique → portefeuille → mobile money facultatif → paiement test de 100 FCFA) ; bandeau de progression sur la caisse tant que non terminé. | `parametres`, `wallet` |
| `/equipe`, `/articles` | Membres, invitations, rôles, désactivation ; articles CRUD + réordonnancement (P1). | `equipe`, `articles` |

## Écrans de la vague 3

| Route | Écran | Rubriques temps réel |
|---|---|---|
| `/admin/studio` | **Studio audio** (super-admin + 2FA validée) : couverture par langue (tuiles = langue de travail, barres publiés + brouillons, essentielles manquantes), filtres (écran, manquants seulement, recherche), légende, matrice clés × langues (✔ publié, ● brouillon, ⏳ en traitement, ⚠ erreur, ○ manquant ; mobile : une langue à la fois, panneau en feuille), panneau : textes FR/EN + contexte, micro (3-2-1, vumètre AnalyserNode, arrêt auto à 15 s, réécouter / refaire / valider), dépôt de fichier (glisser-déposer), brouillon (écouter, publier, supprimer), « Publier les brouillons » de la langue, **mode rafale** (après validation : case manquante suivante + décompte relancé), raccourcis `Espace` `Entrée` `R` `→` `←` `P`. Refus du micro → message clair, dépôt de fichier toujours possible. `/admin/studio-audio` redirige ici. | `audio` (`private-admin`), `audios` |
| `/admin` | **Console** : onglets Vue d'ensemble (commerçants actifs, paiements par commerçant, confirmation médiane, part bitcoin / mobile money, couverture audio), Boutiques (recherche, statut, configuration, ventes 7 j en nombre, suspendre / réactiver avec confirmation, curseur), Santé (voyants par service, actualisé toutes les 30 s), Journal (famille d'action, période, curseur). `?onglet=boutiques|sante|journal`. Aucune donnée d'argent des boutiques. | `boutiques`, `audio`, `audios`, `journal` |
| `/securite/2fa` | Double authentification : activation (QR généré localement depuis `otpauth_url`, clé secrète copiable, code à 6 chiffres validé automatiquement), **codes de secours affichés une seule fois** (copier, télécharger, case « rangés en lieu sûr »), désactivation avec mot de passe. Lien dans « Mon compte ». | — |
| `/verification-2fa` | Après connexion si `deux_fa.active && !validee` : code de l'application ou code de secours, `?suite=`. | — |
| Recherche (Ctrl/⌘+K) | Plein écran sur mobile, centrée sur bureau ; 4 dernières recherches (effaçables) ; après 150 ms (requête précédente annulée) résultats groupés par rubrique, les plus pertinents en tête, terme surligné (accents ignorés) ; ↑ ↓ Entrée Échap ; pages et réglages trouvables hors ligne (index local, droits du rôle). | — |
| `/articles` → Importer | Assistant 4 étapes : déposer (CSV/XLSX, modèle téléchargeable) → correspondance (listes pré-remplies par les suggestions ✨, colonnes ignorables, aperçu des 10 lignes transformées, erreurs ligne par ligne) → mode → progression en direct + rapport d'erreurs. Menu d'export CSV / Excel. | `imports`, `articles` |
| `/ventes` → Exporter | Menu CSV / Excel / PDF avec les filtres en cours. | — |
| `/invitation/:jeton` | Public : boutique, rôle (+ droits), contact masqué, expiration ; créer un compte ou se connecter (`?suite=`) puis « Rejoindre la boutique ». | — |

## Mode mock (`src/api/mock.ts`)

Machine d'état fidèle au contrat : ≈ 100 ventes sur 30 jours, cours qui bouge légèrement (60 s), tentatives stables pour les captures (`01PDEMOLIGHTNING…`, `01PDEMOPAYTECH…`, `01PDEMOWAVE…`, `01PDEMOEXPIRE…`, `01PDEMOPAYEE…`), expiration par minuterie, `simuler` → règlement côté « serveur » → signal temps réel simulé (`emettreSignal`, `auteur = null`) → les écrans relisent (paiement, ventes, tableau de bord, portefeuille). Leviers `sessionStorage` : `satspoint.mock.cours = indisponible`, `satspoint.mock.wallet = deconnecte`, `satspoint.mock.moyens = aucun` (ni portefeuille, ni PayTech, ni lien Wave), `satspoint.mock.vide = 1`.

Vague 3 (`src/api/mockV3.ts`) : studio ≈ 40 clés tirées du vrai registre × 5 langues, couverture partielle (une case « publiée + nouveau brouillon » pour `nouvelle_version`), dépôt → `en_traitement` → `brouillon` après 1,5 s + signal `audio`, publication → manifeste mis à jour + signal `audios` (l'enregistrement est réellement réécoutable) ; 2FA : code **`123456`** ou un code de secours (le super-admin a la 2FA active non validée ; levier `satspoint.mock.2fa = inactive | active | validee`) ; 24 boutiques, journal de 64 entrées, santé « dégradée » (passerelle en panne) ; recherche (ventes, articles, équipe, pages) et 3 dernières recherches ; import CSV réel (séparateur détecté, suggestions, progression par lots, rapport) ; invitations `demo` (caissier), `gerant`, `expiree` (410).

## Conventions

### Design
- Identité **blanc et or** : fond blanc cassé `#faf9f6`, surfaces blanches, bordures gris chaud, texte encre `#1a1814` ; sombre en option = anthracite chaud `#141311` / `#1c1a17`, texte ivoire `#f3eee3`. L'or est réservé à l'action principale et aux détails.
- Jetons dans `src/styles/jetons.css` (`--fond`, `--surface`, `--texte-2`, `--accent` = or `#c9a227` (surfaces, texte encre `--sur-accent` dessus), `--accent-texte` = or foncé `#7d5e0e` pour liens et texte sur blanc, `--accent-trait` pour traits / courbes / icônes (≥ 3:1), `--degrade-accent` + utilitaire `fond-or` pour le bouton principal, `--mm` = mobile money, `--succes`, `--attente` (ambre distinct de l'or), `--danger`, `--tuile-*` pour les articles…), exposés à Tailwind dans `src/styles/index.css`. Ratios de contraste notés en commentaire dans le fichier. **Aucune couleur en dur dans les composants** (seule exception : le dégradé du logo `Marque`).
- Thème : `data-theme="clair|sombre"` sur `<html>` ; **clair par défaut** au premier lancement ; « auto » (mémorisé explicitement) = attribut absent + `prefers-color-scheme`. Appliqué avant le premier rendu par le script inline de `index.html`. À l'inscription, le thème affiché sur l'appareil est enregistré sur le nouveau compte.
- Compact : base 14 px, grille 4 px, cibles tactiles ≥ 44 px au doigt (≥ 64 px sur le pavé), hauteurs réduites au pointeur via `md:`.
- Montants : `formaterFCFA`, `formaterSats`, classe `tabulaire`. Dates : toujours au fuseau `Africa/Dakar` (`src/lib/format.ts`) ; temps relatif via `tempsRelatif` → `t(cle, { count })`.
- Statuts : `PastilleStatutVente`, `PastilleStatutPaiement`, `PastilleAlerte`, `IconeMethode` (couleur + icône pour comprendre sans lire).
- Les libellés d'action longs deviennent des `BoutonIcone` (icône Lucide + infobulle + `aria-label` + `voix`).
- Les fenêtres (`Dialogue`), les infobulles et `qrcode` sont chargés à la demande : rien dans le JavaScript initial.

### i18n
- **Aucun texte en dur.** Clés `ecran.element` en camelCase : `caisse.encaisser`, `paiement.nouvelleDemande`, `ventes.vide.filtres`. Pluriels i18next : `ventes.nombre_one` / `_other`.
- **Paquets à la demande** (budget du premier écran) : `admin.*.json` (console, studio, 2FA, import), `gestion.*.json` (portefeuille, équipe), `extras.*.json` (recherche, invitation, export). Un écran qui en dépend se déclare avec `avecPaquet('nom', () => import(…))` dans `src/routes/ecrans.ts` (ou `chargerPaquet('nom')` avant un `lazy`) ; le paquet suit ensuite les changements de langue. Une clé n'existe que dans un seul paquet (test).
- Toute clé existe dans `fr.json` **et** `en.json` : `src/i18n/parite.test.ts` échoue sinon (clés, valeurs vides, paramètres `{{…}}`, convention de nommage — une clé commence par une lettre : `periodes.j7`, pas `7j`).
- Typographie française : espace fine insécable (` `) avant `? ! : ;`.

### Aide vocale
- **Registre** : `npm run cles-vocales` extrait toutes les clés vocales (`voix="…"`, `voix: '…'`, `<HautParleur cle="…">`, `annoncer('…')`, navigation, tuiles de langue, gabarits `prefixe.${…}`) vers `src/voix/cles-vocales.json`, dans l'ordre d'apparition (parcours d'encaissement d'abord, `essentielle`). Le back l'importe : toute nouvelle clé apparaît dans le studio comme « manquante ». Le test `cles-vocales.test.ts` échoue si un `Bouton` / `BoutonLien` / `BoutonIcone` / `Onglet` n'a pas de `voix` (les relais `{...reste}` sont tolérés).
- La **clé vocale est la clé i18n** : `<Bouton voix="caisse.encaisser">`, `<BoutonIcone voix="ventes.exporter">`, `<Onglet voix="paiement.lightning">`, `<HautParleur cle="langue.wo" langue="wo" />`.
- Un haut-parleur n'apparaît que si un audio existe pour la clé (langue choisie, puis repli `fr`) ; sinon rien. Il est masqué quand l'aide vocale est désactivée, sauf sur le sélecteur de langue.
- Un seul son à la fois (`src/voix/lecteur.ts`) ; `annoncer('paiement.recu')`, `annoncer('paiement.expire')`, `annoncer('paiement.annule')` sur l'écran de paiement.
- Manifestes `GET /api/v1/audio/manifeste/{langue}` mis en cache une heure (TanStack) et relus sur le signal temps réel `audios`.

### Données et temps réel
- Appels via `src/api/client.ts` (`http.get/post/patch/put/delete`) ; jamais de `fetch` direct dans un écran (exception : le téléchargement de l'export CSV, qui doit lire un blob). Les erreurs sont des `ErreurApi` (statut, code, `errors`) ; les messages affichés passent par `useMessageErreur` (codes du contrat § 12 → messages du cahier § 6.18).
- Chaque écran qui affiche des données appelle `useDonneesEnDirect(['rubrique'], recharger)` avec `recharger = () => queryClient.invalidateQueries(...)` (rechargement silencieux : le cache n'est jamais vidé, squelettes au premier affichage seulement). Le hook ignore ses propres modifications, regroupe sur 800 ms, attend la visibilité de l'onglet et ne recharge jamais pendant une saisie (`useSaisieEnCours()` dans les formulaires).
- **Jamais le front ne décide qu'un paiement est payé** : après `simuler`, un signal ou un compte à rebours à zéro, il relit `GET /paiements/{ulid}` (`deriverEtat` dans `useSuiviPaiement`).

### Contrat API (`/api/v1`)
Cookies de session Sanctum (`credentials: 'include'`), `GET /sanctum/csrf-cookie` avant la première requête mutante puis en-tête `X-XSRF-TOKEN`, `Accept: application/json`. Routes : voir `docs/CONTRAT_API.md` (§ 2 à § 12). Temps réel : Echo + Reverb, canaux `private-boutique.{ulid}`, `private-user.{ulid}`, `plateforme`, `private-admin` ; événement unique `.donnees.modifiees` `{ rubrique, auteur, horodatage }`. L'écran de paiement, hors coquille, monte lui-même `<TempsReel />`.

## Ajouter un écran

1. Créer `src/ecrans/MonEcran.tsx` (export par défaut), racine avec `data-ecran="mon-ecran"` ; squelettes avec `data-chargement` au premier chargement seulement. Pour un écran sans données, partir de `PageVide` ; sinon `EnTetePage` + composants du design system.
2. Ajouter les clés dans `fr.json` **et** `en.json` (`monEcran.titre`, `monEcran.vide.titre`…).
3. Déclarer le chargement à la demande dans `src/routes/ecrans.ts`, puis la route dans `src/routes/index.tsx` sous la bonne garde (`RequiertSession` → `Coquille` → `RequiertBoutique` ; `RequiertRole` pour les rubriques réservées ; `RequiertSuperAdmin` pour `/admin/*`).
4. Si l'écran est une rubrique de navigation : l'ajouter dans `src/coquille/navigation.ts` (rôles autorisés, `barreBas` pour la barre mobile, `cleCourte` si le libellé est long).
5. Brancher `useDonneesEnDirect([...rubriques], recharger)` et donner une clé `voix` à chaque action ; étendre `src/api/mock.ts` si une route manque (et `docs/CONTRAT_API.md` d'abord).
6. Ajouter l'écran et ses états dans `scripts/captures.mjs`, puis `npm run typecheck && npm run lint && npm test && npm run captures` et regarder les captures (390 px et 1366 px, clair et sombre, FR et EN).
