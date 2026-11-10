# PARCOURS — carte réelle de SatsPoint pour les tests Playwright

> Étape 1 de la méthode (docs/DIRECTIVES.md annexe A.3) : carte **tirée du code** (`web/src`, `api/routes`, `api/app/Policies`, contrôleurs), rien n'est deviné.
> Relevé du 08/11/2026, branche courante. Les références `fichier:ligne` renvoient au dépôt `C:\SatsPoint`.
> Les noms entre guillemets sont les **noms accessibles exacts en français** (`getByRole(rôle, { name })`).

---

## 0. En-tête

### 0.1 Lancer la pile de test
| Élément | Adresse | Source |
|---|---|---|
| Front (Vite, port strict) | `http://localhost:5190` — `cd web && npm run dev` | `web/vite.config.ts:87-88` |
| API (FrankenPHP/Caddy, conteneur `app`) | `http://localhost:8120` (proxy Vite : `/api`, `/sanctum`, `/broadcasting`, `/webhooks`, `/audio`, `/r` (sauf navigation HTML)) | `docker-compose.yml:108`, `web/vite.config.ts:89-96` |
| Reverb (WebSocket) | `ws://localhost:8125` (`REVERB_PUBLIC_PORT`) | `docker-compose.yml:129`, `.env.example:47` |
| File d'attente + planificateur | conteneurs `queue` (paiements, audio, imports) et `scheduler` (`paiements:expirer` chaque minute, `cours:rafraichir`) — **obligatoires** pour l'expiration, le traitement audio et l'import | `api/routes/console.php:15-19` |
| Passerelle Lightning | conteneur `lightning-gateway` ; `mock://…` = portefeuille simulé en mémoire (factures `lnbcrt`, solde initial 100 000 sats, auto-paiement accepté) | `lightning-gateway/src/portefeuilles/mock.ts:34,59-62,164-189` |

Variables Playwright : `E2E_BASE_URL` (5190), `E2E_API_URL` (8120), `E2E_MDP_DEMO`, `E2E_MDP_ADMIN`, `E2E_ADMIN_EMAIL` (lus dans `.env` racine par `outils/env.ts`). **Manque** : un secret TOTP du super-admin (voir § 5).

### 0.2 Rôles
| Rôle | Nature | Atterrissage (`cheminAccueil`, `coquille/navigation.ts:56-61`) |
|---|---|---|
| visiteur | non connecté | `/accueil` (ou `/langue` si la langue n'a jamais été choisie) |
| (connecté sans boutique) | inscrit, pas encore de boutique | `/demarrage` |
| `caissier` | membre de boutique | `/caisse` |
| `gerant` | membre de boutique | `/caisse` |
| `proprietaire` | membre de boutique | `/caisse` |
| `super_admin` | `role_plateforme`, aucune boutique | `/admin` (2FA obligatoire) |

### 0.3 Comptes (mots de passe : jamais ici)
| Compte | Rôle | Remarque |
|---|---|---|
| `demo@satspoint.local` | propriétaire « Boutique Démo » | **branchée sur un VRAI portefeuille** (`DEMO_NWC_URI`) → aucun encaissement, aucun « Simuler », aucun envoi, aucune révocation, aucun changement PayTech sur cette boutique |
| `caissier@satspoint.local` | caissier « Boutique Démo » | même mot de passe que la démo (`DEMO_PASSWORD`) ; ne pas encaisser |
| `SUPERADMIN_EMAIL` (`E2E_ADMIN_EMAIL`) | super_admin | `fixtures.ts:19` code en dur une adresse personnelle par défaut |
| *(aucun gérant seedé)* | — | un gérant s'obtient par invitation dans une boutique de test (parcours 09) |
| Boutique de test `TEST-E2E-<date>-<suffixe>` | propriétaire créé par le test | inscription (téléphone `+22177xxxxxxx` aléatoire) + `POST /api/v1/boutique` + `PUT /api/v1/boutique/wallet { uri: 'mock://e2e-<suffixe>' }` (motif accepté hors production : `mock://[a-z0-9_-]{1,40}`, `ConnecterWalletRequest.php`) |

### 0.4 Clés `localStorage` (`web/src/lib/stockage.ts`)
| Clé | Valeurs | Effet |
|---|---|---|
| `satspoint.langue-choisie` | `wo` `srr` `ff` `dyo` `fr` `en` | **sans elle, `/`, `/accueil`, `/connexion`, `/inscription`, `/mot-de-passe/*` redirigent vers `/langue`** (`routes/gardes.tsx:14,22`) |
| `satspoint.locale` | `fr` `en` | langue d'interface (détecteur i18next, `i18n/index.ts:31-35`) |
| `satspoint.langue-audio` | `wo` `srr` `ff` `dyo` `fr` (absent = aucune) | langue des haut-parleurs |
| `satspoint.aide-vocale` | `1` / `0` (absent : `1` si langue locale) | affiche les haut-parleurs |
| `satspoint.theme` | `clair` `sombre` (absent = `auto`) | `html[data-theme]` |
| `satspoint.laterale-repliee` | `1` / `0` | barre latérale repliée |
| `satspoint.studio.langue`, `satspoint.studio.rafale` | code langue, `0`/`1` | studio audio |
| `satspoint.import.correspondance` | JSON | mémoire des colonnes d'import |

**Préparation recommandée** (`context.addInitScript`) : `langue-choisie=fr`, `locale=fr`, `aide-vocale=0` (sauf parcours 01 et 14).

### 0.5 Règles de sélection (lues dans `composants/*`)
- **`Bouton` / `BoutonLien`** (`composants/Bouton.tsx:121-155`) : nom = texte enfant. Si une clé `voix` a un audio **et** que l'aide vocale est active, un `<span role="button" aria-label="Écouter" data-haut-parleur="<clé>">` est **imbriqué** dans le bouton → le nom devient « Encaisser Écouter ». Avec `aide-vocale=0` (ou sans audio publié) les noms sont propres. Utiliser `{ name: 'Encaisser', exact: false }` ou `/^Encaisser/`.
- **`BoutonIcone`** (`composants/BoutonIcone.tsx:55-73`) : nom = `aria-label={libelle}` (le haut-parleur imbriqué ne change pas le nom). Infobulle uniquement au pointeur fin.
- **`Onglet`** (`composants/Onglets.tsx:226-246`) : `role="tab"`, nom = texte (+ « Écouter » éventuel). **`Segment`** : `role="radiogroup"` (nom = `libelle`) + `role="radio"` (nom = texte). **`Interrupteur`** : `role="switch"`, nom = contenu du `<label>` (libellé + description + « Écouter » éventuel) → filtrer par début de nom.
- **`Champ`** : `<label for>` → `getByLabel`. Le libellé contient aussi la mention « facultatif » quand elle existe (nom « Téléphone facultatif »). Erreur : `<p role="alert">` sous le champ. **`ChampMotDePasse`** ajoute un bouton « Afficher le mot de passe » / « Masquer le mot de passe » (aria-label) : `getByLabel(/mot de passe/i)` attrape **aussi** ce bouton → utiliser `getByLabel('Mot de passe', { exact: true })`.
- **`Selection`** : `<select>` natif → `role="combobox"`, nom = libellé (souvent `sr-only`). **`Menu`** : bouton `aria-haspopup="menu"`, liste `role="menu"` (nom = titre), éléments `role="menuitem"` (nom = libellé + détail, ex. « CSV Lisible par Excel »).
- **`Dialogue`** (`DialogueRadix.tsx`) : `role="dialog"`, nom = titre ; bouton « Fermer » dans l'en-tête ; Radix masque le reste de la page (les boutons homonymes hors fenêtre ne gênent pas). Chargé à la première ouverture (attendre le dialogue, pas un délai).
- **`HautParleur`** (`voix/HautParleur.tsx`) : masqué s'il n'y a aucun audio (langue choisie, repli FR) ou si l'aide vocale est coupée — **sauf** quand une langue est imposée (tuiles de `/langue`, radios « Langue de la voix ») : alors toujours visible si l'audio existe. Cibler par `[data-haut-parleur="<clé>"]`.
- **Toasts** (`composants/Toast.tsx`) : Radix Toast, titre texte ; erreurs 8 s, autres 5 s ; bouton « Fermer ». Chargés à la première notification.
- **Montants** : `15 000 FCFA` avec U+202F entre milliers et U+00A0 avant `FCFA` (`lib/format.ts:9-25`) → regex `/15\s000\sFCFA/`. Sats : `≈ 23 450 sats`. Dates : `JJ/MM/AAAA HH:MM`, fuseau Dakar. N° de vente : `V-000123` (`api/app/Models/Vente.php:85-88`).
- **Squelettes** : `[data-chargement="…"]` + `aria-busy="true"` au premier chargement uniquement. Coquille : `[data-chargement="ecran"]` ; session inconnue : `[data-chargement="application"]`.
- Bandeau `role="status"` « Mode démo : paiements simulés » (`[data-bandeau="demo"]`) quand `GET /api/v1/config` → `app.demo` (vrai si **toutes** les connexions actives sont `mock://`, `ConfigController.php:39-60`) : il disparaît dès que la démo est sur un vrai portefeuille.

### 0.6 Limites de débit qui touchent les tests (`AppServiceProvider.php:97-160`)
connexion 5/min par identifiant (→ **réutiliser un `storageState` par rôle**) · inscription **10/h par IP** (→ une boutique de test par exécution, partagée par fichier) · oubli 3/h · 2FA 5/min · exports 6/min · configuration (wallet, PayTech) 10/min · ventes 30/min · recherche 60/min · imports 10/min · invitations 20/h. Le mot de passe passe `Password::uncompromised()` (HIBP) → mots de passe aléatoires.

---

## 1. Routes et gardes (`web/src/routes/index.tsx`, `routes/gardes.tsx`)

| Garde | Règle | Redirection |
|---|---|---|
| `Aiguillage` (`/`) | langue non choisie → `/langue` ; session inconnue → squelette | sinon `cheminAccueil` |
| `RequiertInvite` | langue non choisie → `/langue` ; connecté → `cheminAccueil` (sans toast) | — |
| `RequiertSession` | anonyme → `/connexion?suite=<chemin+requête encodés>` ; 2FA active non validée → `/verification-2fa?suite=…` | — |
| `RequiertBoutique` | super-admin → `/admin` ; sans boutique et chemin ≠ `/demarrage` → `/demarrage` | sans toast |
| `RequiertRole(['proprietaire','gerant'])` | refus → **toast erreur « Cette page est réservée au propriétaire de la boutique. »** + `cheminAccueil` | `gardes.tsx:50-64` |
| `RequiertSuperAdmin` | non super-admin → même toast + `cheminAccueil` ; 2FA non activée → `/securite/2fa?suite=/admin…` ; non validée → `/verification-2fa?suite=…` | `gardes.tsx:67-74` |
| 401 sur une route privée | session tombée → `/connexion?suite=<chemin>` (sauf chemins publics) | `auth/store.ts:51-60` |
| 403 `DEUX_FA_REQUISE` | → `/securite/2fa` ou `/verification-2fa?suite=` | `auth/store.ts:63-68` |
| `?suite=` | accepté seulement s'il commence par `/` et pas `//` ni `/\` | `routes/navigation.ts:32-34` |

Hors coquille : `/langue`, écrans invités, `/caisse/paiement/:ulid`, `/verification-2fa`, `/r/:jeton`, `/invitation/:jeton`, `*`. `/admin/studio-audio` → `/admin/studio` (replace).

---

## 2. Écrans

### 2.0 Coquille connectée (`coquille/Coquille.tsx`, `[data-coquille]`)
Monte `TempsReel` (une connexion Reverb : canaux `private-boutique.{ulid}`, `private-user.{ulid}`, `private-admin` (super-admin), `plateforme` public ; événement `.donnees.modifiees`). Rubriques globales : `audios` → relecture des manifestes ; `preferences`/`sessions` → relecture `/moi`.

**En-tête** (`EnTete.tsx`)
| Élément | Rôle / nom | Affichage | Effet |
|---|---|---|---|
| Logo + nom de boutique | link « Aller à l'accueil » | mobile seulement | → `cheminAccueil` |
| Faux champ de recherche | button « Recherche globale » (texte « Rechercher… » + `Ctrl K`), `aria-keyshortcuts="Control+K Meta+K"`, `[data-recherche-declencheur]` | ≥ 768 px | ouvre la recherche (§ 2.0.4) |
| Loupe | button « Recherche globale » | < 768 px | idem |
| Thème | combobox « Thème » (options « Clair », « Sombre », « Automatique ») | ≥ 768 px | `html[data-theme]`, `localStorage`, `PATCH /api/v1/moi/preferences {theme}` 200 |
| Langue | combobox « Langue de l'interface » (« Français », « English ») | ≥ 768 px | change les textes, `html[lang]`, `PATCH /moi/preferences {locale}` |
| Avatar | button « Mon compte » (`aria-haspopup="dialog"`) | toujours | fenêtre « Mon compte » |

**Fenêtre « Mon compte »** (`MenuUtilisateur.tsx`) — dialog dont le nom = « <Nom> <Boutique> · <Rôle> » (rôle : « Propriétaire », « Gérant », « Caissier », « Administration »).
| Élément | Rôle / nom | Effet |
|---|---|---|
| Panneau préférences | voir ci-dessous | — |
| link « Sécurité du compte » (+ pastille « 2FA active » si active, nom alors « Sécurité du compte 2FA active ») | link | → `/securite/2fa`, ferme la fenêtre |
| button « Me déconnecter » | button | `POST /api/v1/auth/deconnexion` 204 → `/accueil` |
| button « Fermer » | button | ferme |

**Panneau préférences** (`Preferences.tsx`, aussi dans « Plus » et `/reglages`)
| Élément | Rôle / nom | Effet |
|---|---|---|
| Thème | radiogroup « Thème » → radios « Clair », « Sombre », « Automatique » | `aria-checked`, `html[data-theme]`, PATCH préférences |
| Langue | radiogroup « Langue de l'interface » → radios « Français », « English » | idem `{locale}` |
| Aide vocale | switch « Aide vocale Un haut-parleur sur chaque bouton lit son nom à voix haute. » | `satspoint.aide-vocale`, `{aide_vocale}` |
| Langue de la voix | radiogroup « Langue de la voix » → radios « Wolof », « Seereer », « Pulaar », « Joola », « Français » (`nom_local` de `/config`) + haut-parleur par langue (langue imposée) | `{langue_audio}` |

**Barre latérale** (`BarreLaterale.tsx`, ≥ 768 px)
| Élément | Rôle / nom | Effet |
|---|---|---|
| Logo | link « Aller à l'accueil » | → `cheminAccueil` |
| Menu | navigation « Navigation principale » → links selon le rôle (tableau ci-dessous), `aria-current="page"` sur l'actif | navigation |
| Replier | button « Replier le menu » / « Déplier le menu » | `satspoint.laterale-repliee` ; **repliée, les liens n'ont plus de nom accessible** (§ 5) |

Menu par rôle (`coquille/navigation.ts:30-54`) :
| Rôle | Liens (ordre) |
|---|---|
| propriétaire | « Caisse », « Ventes », « Tableau de bord », « Portefeuille », « Articles », « Équipe », « Réglages », « Démarrage guidé » (tant que `wallet` et `paiement_test` ne sont pas tous deux vrais) |
| gérant | « Caisse », « Ventes », « Tableau de bord », « Portefeuille », « Articles », « Équipe », « Réglages » |
| caissier | « Caisse », « Ventes », « Tableau de bord », « Articles » |
| sans boutique | « Démarrage guidé » |
| super-admin | « Console », « Studio audio » |

**Barre du bas** (`BarreBas.tsx`, < 768 px) : navigation « Navigation principale », ≤ 4 links (libellés courts : « Caisse », « Ventes », « Tableau », « Portefeuille » ; caissier : 3 ; super-admin : « Console », « Studio audio »), puis button « Plus » (`aria-haspopup="dialog"`, actif si la page courante est dans « Plus ») → dialog « Plus » : liste « Autres rubriques » (buttons « Articles », « Équipe », « Réglages », « Démarrage guidé » selon rôle ; caissier : « Articles » ; super-admin : aucun) + panneau préférences. Absente si aucun élément « barre du bas » (connecté sans boutique).

**Bandeau démarrage** (`BandeauDemarrage.tsx`, sur `/caisse`, propriétaire tant que la config n'est pas finie) : link `[data-bandeau="demarrage"]` nom « Continuer le démarrage N / 4 étapes », progressbar `aria-valuenow=N` → `/demarrage`.

#### 2.0.4 Recherche globale (`RechercheGlobale.tsx`, `recherche/PanneauRecherche.tsx`)
Ouverture : clic sur « Recherche globale » ou **Ctrl+K / ⌘+K** (bascule). Dialog nom « Recherche » (`[data-recherche]`, plein écran mobile).
| Élément | Rôle / nom | Condition | Effet |
|---|---|---|---|
| Champ | combobox « Recherche » (placeholder « Ventes, articles, équipe, réglages… »), focus auto | — | < 2 caractères : récentes ; ≥ 2 : `GET /api/v1/recherche?q=` après 150 ms |
| button « Effacer la recherche » | button | terme non vide | vide le champ |
| button « Fermer » (flèche) | button | mobile seulement | ferme (bureau : Échap ou clic hors fenêtre) |
| Liste | listbox « Résultats de recherche » | — | — |
| Récentes | region « Dernières recherches » (h3) + options `[data-recente]` (≤ 4) ; sinon texte « Tapez au moins 2 lettres : ventes, articles, équipe, pages et réglages. » | avant frappe ; `GET /recherche/recentes` à l'ouverture | clic → remplit le champ |
| button « Effacer les dernières recherches » | button | ≥ 1 récente | `DELETE /recherche/recentes` 204 |
| Groupes | regions « Ventes », « Articles », « Équipe », « Pages et réglages » (`[data-rubrique]`), options `[data-resultat]` (≤ 5, terme en `<mark>`) | ≥ 2 caractères | Entrée / clic → `POST /recherche/recentes {terme}` + navigation vers `url` |
| États | status « Aucun résultat pour « x » » / « Chargement… » / « Hors connexion : seules les pages et réglages sont proposés. » | — | — |
Clavier : ↑ ↓ (circulaire), Entrée, Échap. Pages locales (`recherche/resultats.ts:22-41`) filtrées par rôle.

### 2.1 `/langue` — choix de la langue (`ecrans/Langue.tsx`)
Garde : aucune (accessible connecté ou non). `[data-ecran="langue"]`. Pas d'en-tête invité (ni thème ni langue).
- h1 « Choisissez votre langue » (+ haut-parleur `langue.titre`, langue FR imposée). Sous-titre « Touchez le haut-parleur pour entendre le nom de la langue. »
- list « Choisissez votre langue » : 6 tuiles.

| Élément | Rôle / nom | Condition | Effet |
|---|---|---|---|
| Tuile | button « Wolof wo », « Seereer srr », « Pulaar ff », « Joola dyo », « Français fr », « English en » (`aria-pressed` = langue audio courante, jamais pour `en`) | — | écrit `langue-choisie`, `langue-audio` (`en` → retirée), `aide-vocale` (`1` pour wo/srr/ff/dyo, `0` sinon), `locale` ; si connecté `PATCH /moi/preferences {locale, langue_audio, aide_vocale}` ; navigation `replace` → `/accueil` (anonyme) ou `cheminAccueil` |
| Haut-parleur de tuile | button « Écouter » `[data-haut-parleur="langue.wo"]`… (anglais : clé `langue.en` lue dans le manifeste FR) | audio publié pour cette langue | lit l'audio, **ne choisit pas** la tuile ; `aria-pressed=true` pendant la lecture ; zone `aria-live` « Lecture en cours » |

### 2.2 `/accueil` (`ecrans/Accueil.tsx`)
Garde : `RequiertInvite`. `[data-ecran="accueil"]` (mise en page invité : combobox « Thème », combobox « Langue de l'interface », pas de logo-lien).
- h1 « Bienvenue sur SatsPoint » ; accroche « Votre caisse en bitcoin et mobile money. Simple, rapide, sans commission cachée. » ; 3 points : « Paiement bitcoin reçu en quelques secondes », « Wave, Orange Money et Free Money acceptés », « Aide vocale en wolof, seereer, pulaar et joola ».

| Élément | Rôle / nom | Effet |
|---|---|---|
| link « Créer ma boutique » | link | → `/inscription` |
| link « Me connecter » | link | → `/connexion` |
| link « Changer de langue » | link | → `/langue` |

### 2.3 `/connexion` (`ecrans/auth/Connexion.tsx`)
Garde : `RequiertInvite`. `[data-ecran="connexion"]`. En-tête : link « Aller à l'accueil » → `/accueil`, Thème, Langue.
- h1 « Me connecter » ; « Retrouvez votre caisse et vos ventes. »

| Élément | Rôle / nom | Condition / validation | Effet |
|---|---|---|---|
| textbox « Téléphone ou e-mail » | textbox | vide → « Ce champ est obligatoire. » | — |
| « Mot de passe » (exact) | textbox (password) | vide → « Ce champ est obligatoire. » | — |
| button « Afficher le mot de passe » | button (tabindex -1) | — | type text, nom → « Masquer le mot de passe » |
| checkbox « Rester connecté sur cet appareil » | checkbox | cochée par défaut | `se_souvenir` |
| link « Mot de passe oublié ? » | link | — | → `/mot-de-passe/oubli` |
| button « Me connecter » (submit) | button | `aria-busy` pendant l'appel | `GET /sanctum/csrf-cookie` puis `POST /api/v1/auth/connexion {identifiant,password,se_souvenir}` 200 → `suite` ou `cheminAccueil` ; 2FA active non validée → `/verification-2fa?suite=` |
| link « Créer ma boutique » | link | conserve `?suite=` | → `/inscription` |
Erreurs (`ErreurFormulaire`, `role="alert"`) : identifiants faux → **401 `IDENTIFIANTS_INCORRECTS`** → affiche aujourd'hui « Votre session a expiré. Reconnectez-vous. » (attendu « Téléphone ou mot de passe incorrect. », § 5) ; 429 → « Trop de tentatives. Patientez une minute avant de réessayer. » ; réseau → « Pas de connexion. Vérifiez votre réseau et réessayez. »

### 2.4 `/inscription` (`ecrans/auth/Inscription.tsx`)
Garde : `RequiertInvite`. `[data-ecran="inscription"]`. h1 « Créer ma boutique » ; « Un compte en moins d'une minute. Vous configurerez votre boutique juste après. »

| Élément | Rôle / nom | Validation client | Effet |
|---|---|---|---|
| « Votre nom » | textbox | vide → « Ce champ est obligatoire. » | — |
| « Téléphone ou e-mail » (aide « Vous l'utiliserez pour vous connecter. ») | textbox | vide → idem | — |
| « Mot de passe » (exact, aide « 12 caractères minimum. ») | password | < 12 → « Le mot de passe doit contenir au moins 12 caractères. » | — |
| « Confirmez le mot de passe » | password | ≠ → « Les deux mots de passe ne sont pas identiques. » | — |
| 2 × button « Afficher le mot de passe » | button | — | bascule |
| button « Créer mon compte » | submit | — | `POST /api/v1/auth/inscription {nom,identifiant,password,password_confirmation,locale}` 201 → toast « Votre compte est créé. Bienvenue ! » → `suite` ou `/demarrage` ; 422 → erreurs par champ (messages serveur) + alerte « Vérifiez les champs en rouge. » |
| link « Me connecter » | link | conserve `?suite=` | → `/connexion` |

### 2.5 `/mot-de-passe/oubli` (`ecrans/auth/MotDePasseOublie.tsx`)
Garde : `RequiertInvite`. `[data-ecran="oubli"]`. h1 « Mot de passe oublié ».
| Élément | Rôle / nom | Effet |
|---|---|---|
| « Téléphone ou e-mail » | textbox | vide → « Ce champ est obligatoire. » |
| button « Envoyer le lien » | submit | `POST /api/v1/auth/mot-de-passe/oubli {identifiant}` **202** → écran `[data-ecran="oubli-envoye"]` : h2 « Vérifiez vos messages », « Si un compte existe pour cet identifiant, un lien valable 30 minutes vient d'être envoyé. », link « Retour à la connexion » |
| link « Retour à la connexion » | link | → `/connexion` |
⚠ Un compte avec e-mail reçoit un **vrai e-mail** : n'utiliser qu'un identifiant inconnu ou un compte téléphone seul. 3 demandes/h/identifiant.

### 2.6 `/mot-de-passe/reinitialisation?jeton=&identifiant=` (`ecrans/auth/Reinitialisation.tsx`)
Garde : `RequiertInvite`. `[data-ecran="reinitialisation"]`. h1 « Nouveau mot de passe » ; « Choisissez un mot de passe de 12 caractères minimum. »
- Sans `jeton` : alerte « Ce lien n'est plus valable. Demandez-en un nouveau. » + link « Mot de passe oublié » → `/mot-de-passe/oubli` ; button « Changer le mot de passe » **désactivé** (raison : lien invalide).
- Champs « Téléphone ou e-mail » (prérempli par `?identifiant`), « Nouveau mot de passe » (aide « 12 caractères minimum. »), « Confirmez le mot de passe » ; mêmes messages que l'inscription.
- Submit → `POST /api/v1/auth/mot-de-passe/reinitialisation` 200 → toast « Mot de passe changé. Vous pouvez vous connecter. » → `/connexion` ; 422 `jeton`/`identifiant` → alerte lien invalide.

### 2.7 `/demarrage` — démarrage guidé (`ecrans/Demarrage.tsx`)
Garde : session + coquille + `RequiertBoutique` (super-admin → `/admin`) ; **aucun filtre de rôle** (gérant et caissier y entrent par l'adresse). `[data-ecran="demarrage"]`. Temps réel `['parametres','wallet']`.
- h1 « Démarrage guidé » ; « Quatre étapes, environ trois minutes. » ; texte « N / 4 étapes » ; progressbar nom « Démarrage guidé » `aria-valuenow=N`.
- Terminé (boutique + portefeuille + paiement test) : h2 « Votre caisse est prête », « Tout fonctionne. Encaissez votre première vente. », button « Aller à la caisse » → `/caisse`.
- 4 étapes (`<ol>`), chacune un button `aria-expanded` ; la première non faite est ouverte. Noms : « 1. Ma boutique Nom, téléphone et ville. » (fait : « 1. Ma boutique <Nom> · <Ville> »), « 2. Mon portefeuille Lien Nostr Wallet Connect. », « 3. Mobile money (facultatif) Clés PayTech ou lien Wave (facultatif). », « 4. Paiement test 100 FCFA pour vérifier que tout marche. ».

| Étape | Éléments (nom exact) | Validation | Effet |
|---|---|---|---|
| 1 (sans boutique) | « Nom de la boutique », « Téléphone facultatif », « Ville » (préremplie « Dakar »), button « Créer ma boutique » | nom < 2 car. ou ville vide → « Ce champ est obligatoire. » | `POST /api/v1/boutique {nom,telephone,ville}` 201 → **le front attend `{ boutique, utilisateur }` mais reçoit `{ boutique }` : session effacée côté client → renvoi vers `/connexion?suite=%2Fdemarrage`** (§ 5) |
| 1 (faite) | link « Modifier » | — | → `/reglages` |
| 2 | « Lien Nostr Wallet Connect » (password, aide « Commence par nostr+walletconnect:// »), button « Quels portefeuilles ? » (`aria-expanded`, déplie l'aide), button « Connecter mon portefeuille » | vide → « Ce champ est obligatoire. » ; 422 → « L'URI de connexion au portefeuille est invalide (attendu : nostr+walletconnect://…). » | `PUT /api/v1/boutique/wallet {uri}` 200 → toast « Portefeuille connecté » (propriétaire seul côté serveur : gérant 403) |
| 3 | radiogroup « Moyens de paiement » → radios « Mobile money (PayTech) », « Wave direct » ; PayTech : « Clé API », « Secret API » (password simples), radiogroup « Environnement » (« Test », « Production ») ; Wave : « Lien Wave direct » ; buttons « Enregistrer », « Passer cette étape » | champs vides → « Ce champ est obligatoire. » | PayTech `PUT /api/v1/boutique/paytech` ; Wave `PATCH /api/v1/boutique {reglages:{wave_lien, moyens:{…,wave_manuel:true}}}` → toast « Réglages enregistrés » ; « Passer cette étape » ouvre l'étape 4 |
| 4 | texte « Créez une demande de 100 FCFA et payez-la vous-même… » ; sans moyen : « Aucun moyen de paiement n'est actif. Activez-en un dans les réglages. » ; button « Lancer le paiement test » (désactivé sans moyen actif) | — | `POST /api/v1/ventes {montant_xof:100, note:'Test', methode:lightning|paytech+wave|wave_manuel}` 201 → `/caisse/paiement/{ulid}?test=1` |

### 2.8 `/caisse` (`ecrans/Caisse.tsx`, `caisse/*`)
Garde : `RequiertBoutique` (sans boutique → `/demarrage` ; super-admin → `/admin`). `[data-ecran="caisse"]`. Temps réel `['parametres','articles','wallet']`. Appels : `GET /boutique`, `GET /cours` (toutes les 60 s), `GET /articles`.
- Bandeau démarrage (propriétaire, § 2.0). Section region « Caisse », h1 « Caisse ».
- Montant (`<p aria-label="Montant en FCFA">`, `aria-live`) : « 0 FCFA » puis la saisie ; ligne sats « ≈ N sats » ou « Le prix du bitcoin n'est pas disponible pour le moment. » ; cours « 1 BTC = X FCFA · il y a N min » ou « Encaissez par mobile money. ».
- Alerte bornes (`role="alert"`) : « Le montant doit être d'au moins 100 FCFA. » / « Le montant ne peut pas dépasser 2 000 000 FCFA. » (plafond de la boutique).
- Bandeaux : « Aucun moyen de paiement n'est actif. » + link « Ouvrir les réglages » (gestion) → `/reglages` ; « Aucun portefeuille connecté : le bitcoin est indisponible. » + link « Connecter mon portefeuille » (gestion) → `/portefeuille`.

| Élément | Rôle / nom | Condition / désactivation | Effet |
|---|---|---|---|
| button « Articles » | BoutonIcone (`aria-pressed`) | mobile, ≥ 1 article actif | dialog « Articles » |
| button « Note » | BoutonIcone (`aria-pressed`) | — | affiche « Note facultatif » (placeholder « Table 4, 2 m de bazin… », 120 car.) |
| group « Pavé numérique » | buttons « Touche 1 » … « Touche 9 », « Touche 000 », « Touche 0 », « Effacer — Appui long sur ⌫ pour tout effacer » | désactivés pendant la création | saisie (9 chiffres max, pas de zéro en tête) ; appui long ≥ 500 ms sur Effacer → tout effacer ; clavier physique : chiffres, Retour arrière, Échap, Entrée = Encaisser |
| button « Encaisser » | Bouton xl | désactivé si montant 0 ou hors bornes ; `aria-busy` pendant l'appel | 0 moyen → toast erreur « Aucun moyen de paiement n'est actif. » (+ raison) ; 1 seul moyen non PayTech → `POST /api/v1/ventes` directement ; sinon fenêtre « Comment le client paie-t-il ? » |
| Grille articles (bureau) | carte h2 « Articles », list « Articles », buttons « <nom> <prix> » | ≥ 1 article actif | ajoute au panier |
| Panier | h3 « Panier » ; vide « Touchez un article pour l'ajouter au panier. » ; list « Panier » ; buttons « Retirer », « Ajouter », « Vider le panier » ; « Total X FCFA » | — | quantités ; total ajouté au montant libre |
| button « Panier · n · X FCFA » | button | mobile, panier non vide | dialog « Articles » (grille + panier + button « Continuer ») |

**Fenêtre « Comment le client paie-t-il ? »** (`caisse/ChoixMethode.tsx`), description = montant ; list :
| Option (nom) | Condition | Effet |
|---|---|---|
| « Bitcoin ≈ N sats » | toujours listée ; **désactivée** si moyen off / portefeuille non connecté (« Bitcoin Aucun portefeuille connecté : le bitcoin est indisponible. ») / cours absent | `POST /ventes {…, methode:'lightning'}` |
| « Wave Mobile money », « Orange Money Mobile money », « Free Money Mobile money » | PayTech actif et configuré | `{methode:'paytech', operateur}` |
| « Wave direct Confirmation manuelle par le propriétaire ou le gérant. » | Wave direct actif + lien | `{methode:'wave_manuel'}` |
Résultat : 201 → `/caisse/paiement/{paiement.ulid}` ; erreur → alerte dans la fenêtre (ex. « Le prix du bitcoin n'est pas disponible pour le moment. », « Votre portefeuille ne répond pas. »). **Chemin direct (1 moyen) : l'erreur n'est affichée nulle part** (§ 5).

### 2.9 `/caisse/paiement/:ulid` — demande de paiement (`ecrans/paiement/Paiement.tsx`)
Garde : session + `RequiertBoutique`, **hors coquille** (monte son propre `TempsReel`). `[data-ecran="paiement"][data-etat="chargement|en_attente|expire|annule|echoue|introuvable|erreur"]`. Suivi (`useSuiviPaiement.ts`) : `GET /api/v1/paiements/{ulid}` toutes les **3 s** tant que tentative et vente sont en attente + temps réel `['paiements','ventes']`. Le statut « payé » vient toujours du serveur.
- En-tête : h1 « Demande de paiement », « Vente V-000123 ». Montant « X FCFA », « N sats ». Squelette `[data-chargement="paiement"]`.

| Élément | Rôle / nom | Condition / désactivation | Effet |
|---|---|---|---|
| button « Annuler la vente » (icône, en-tête) | BoutonIcone | état `en_attente` | dialog « Annuler cette vente ? » (« La demande de paiement sera fermée. Si le client a déjà payé, le paiement sera tout de même enregistré. ») : « Garder la vente » ferme ; « Annuler la vente » → `POST /api/v1/ventes/{vente}/annuler` 200 → état `annule` |
| tab « Bitcoin » | tab | désactivé si Lightning off ou sans portefeuille, ou tentative en cours | changer d'onglet = `POST /api/v1/ventes/{vente}/paiements {methode:'lightning'}` 201 → `replace` vers le nouvel ulid (garde `?test=1`) |
| tab « Mobile money » | tab | désactivé si ni PayTech ni Wave direct | idem avec le 1er moyen mobile |
| radiogroup « Choisissez l'opérateur » → radios « Wave », « Orange Money », « Free Money », « Wave direct » | — | > 1 choix mobile ; radios désactivées hors attente | nouvelle tentative |
| img « Code QR de la demande de paiement » (`[data-qr="pret"]`) | img | attente | QR `LIGHTNING:<BOLT11 MAJ>` / lien PayTech / lien Wave |
| Textes | « Le client scanne ce code avec son portefeuille bitcoin. » / « Le client scanne ce code avec son téléphone, ou ouvrez la page de paiement sur cet appareil. » / Wave : « Le client paie avec Wave via ce lien… » ; « En attente du paiement… » / « En attente de confirmation » ; compte à rebours « Expire dans m:ss » (rouge ≤ 30 s) | — | à 0 : relecture immédiate, panneau « expiré » local |
| link « Ouvrir la page de paiement » / « Ouvrir le lien Wave » | link `target=_blank` | non Lightning | ouvre `redirect_url` / `wave_lien` |
| button « Copier la demande » | BoutonIcone | attente | presse-papiers (BOLT11 ou lien) → toast « Demande copiée » / « Impossible de copier automatiquement. Sélectionnez le texte à la main. » |
| button « Partager » | BoutonIcone | `navigator.share` disponible (souvent absent en headless) | Web Share |
| button « Vérifier le paiement » | BoutonIcone | désactivé pendant la vérification | `POST /api/v1/paiements/{ulid}/verifier` 200 → toast info « Vérifié : toujours en attente du paiement. » |
| button « Confirmer la réception » | Bouton | `wave_manuel` **et** propriétaire/gérant | dialog « Confirmer la réception de X FCFA ? » (« Vérifiez d'abord que l'argent est bien arrivé sur votre compte Wave… ») : « Annuler » / « Confirmer la réception » → `POST /paiements/{ulid}/confirmer-manuellement {confirmation:true}` 200 → succès |
| button « Simuler le paiement » (`[data-simuler]`) | Bouton | `paiement.simule` (portefeuille `mock://` ou PayTech simulé ; jamais Wave direct, jamais la démo réelle) | `POST /paiements/{ulid}/simuler` 200 → succès ; 409 `PAIEMENT_CLOS` si close |

États (`role="status"`, h2) :
| État | Titre | Boutons |
|---|---|---|
| expiré | « Le délai de paiement est dépassé. » + « Aucun paiement n'a été reçu. Relancez une demande : elle sera calculée au cours actuel. » | « Nouvelle demande de paiement » (nouvelle tentative même méthode), « Changer de moyen de paiement » (si l'autre famille est dispo) |
| annulé | « Paiement annulé » + « Cette vente a été annulée. Aucun paiement n'est attendu. » | « Nouvelle vente » → `/caisse` |
| échoué | « Le paiement n'a pas abouti. Le client n'a pas été débité. » | « Réessayer », « Changer de moyen de paiement » |
| introuvable (404) | h2 « Cette demande de paiement est introuvable. » | « Retour à la caisse » |
| erreur (autre, dont 403 d'un caissier sur la vente d'un autre) | « Un problème est survenu. Réessayez dans un instant. » | « Réessayer », « Retour à la caisse » |
`?test=1` : au succès, `PATCH /api/v1/boutique {paiement_test:true}` puis relecture `/boutique` et `/moi`.

### 2.10 Écran de succès (`ecrans/paiement/Succes.tsx`)
Rendu par `Paiement` quand la vente est payée : `[data-ecran="succes"]` plein écran vert, `role="status"`. Annonce vocale `paiement.recu` + son + vibration.
- h1 « Paiement reçu » (test : « Votre caisse est prête ! » + « Le paiement test a réussi. Tout fonctionne. ») ; montant ; « N sats · par Bitcoin » (ou « par Mobile money · Wave », « par Wave direct ») ; « Vente V-000123 » ; alerte éventuelle « Ce client a payé deux fois… » / « Ce paiement est arrivé après l'annulation de la vente… ».

| Élément | Rôle / nom | Condition | Effet |
|---|---|---|---|
| button « Envoyer le reçu » | Bouton | **désactivé** (« Reçu en préparation… ») tant que `recu_url` est nul (`GET /ventes/{ulid}`) | dialog « Envoyer le reçu » (description = lien absolu `/r/<jeton>`) |
| ↳ link « WhatsApp » | link `https://wa.me/?text=…` | — | nouvel onglet |
| ↳ link « SMS » | link `sms:?body=…` | — | — |
| ↳ button « Copier le lien » | button | — | toast « Lien du reçu copié », ferme |
| ↳ button « Partager » | button | Web Share | — |
| button « Nouvelle vente » (test : « Aller à la caisse ») | Bouton | — | → `/caisse` (replace) |

### 2.11 `/ventes` (`ecrans/Ventes.tsx`, `ventes/*`)
Garde : `RequiertBoutique` (tous rôles de boutique). `[data-ecran="ventes"]`. Temps réel `['ventes','paiements']` (invalide aussi le détail ouvert). Squelette `[data-chargement="ventes"]`.
- h1 « Ventes » ; caissier : « Vos ventes d'aujourd'hui » (le serveur borne à ses ventes du jour).
- Totaux (`<dl>`) : « Ventes » → « N vente(s) », « Total » → X FCFA, « Encaissé » → X FCFA.
- Liste list « Ventes » ; ligne = button nom « V-000123 · 1 500 FCFA · Payée » (statuts « Payée », « En attente », « Annulée », « Expirée »).
- Vide : h2 « Aucune vente pour l'instant » + « Vos ventes apparaîtront ici dès le premier encaissement, avec leur statut et leur reçu. » ; avec filtres : « Aucune vente ne correspond à ces filtres. » ; erreur : « Un problème est survenu. Réessayez dans un instant. » + « Réessayer ».

| Élément | Rôle / nom | Condition | Effet |
|---|---|---|---|
| button « Filtrer » | BoutonIcone `aria-pressed` (vrai si panneau ouvert ou filtres actifs) | — | panneau `[data-filtres]` |
| button « Exporter » | Menu (`aria-haspopup="menu"`) | propriétaire/gérant ; désactivé pendant l'export | menu « Exporter » (ou « Exporter (filtres en cours) ») : menuitems « CSV Lisible par Excel », « Excel Classeur .xlsx », « PDF Rapport à imprimer » → `GET /api/v1/exports/ventes?<filtres>&format=csv|xlsx|pdf` 200 (téléchargement, nom serveur ou `ventes-AAAA-MM-JJ.<ext>`) → toast « Export téléchargé » / « L'export n'a pas pu être téléchargé. Réessayez. » |
| searchbox « N° ou montant » | searchbox (libellé sr-only) | — | filtre `q` après 300 ms → `GET /ventes?periode=aujourdhui&q=` |
| radiogroup « Période » → « Aujourd'hui », « Hier », « 7 jours », « 30 jours », « Personnalisée » | radios | pas pour le caissier | `periode=` ; Personnalisée → champs date « Du », « Au » |
| combobox « Statut » (« Statut · Tous », « Payée », « En attente », « Annulée », « Expirée ») | combobox | — | `statut=` |
| combobox « Moyen » (« Moyen · Tous », « Bitcoin », « Mobile money », « Wave direct ») | combobox | — | `methode=` |
| combobox « Caissier » (« Caissier · Tous » + caissiers vus) | combobox | pas pour le caissier | `caissier=<ulid>` |
| button « Réinitialiser les filtres » | Bouton | filtres actifs | revient à « Aujourd'hui » |
| ligne de vente | button | — | ouvre le détail |
| navigation « Pages de la liste » : « Page précédente » / numéros « Page N » (`aria-current="page"` sur la page courante) / « Page suivante » ; résumé « 21–40 sur 248 » ; téléphone : « Page 2 / 9 » | Boutons | page demandée, adresse `?page=N`, retour en haut de la liste ; boutons désactivés aux extrémités ; absente s'il n'y a qu'une page | `GET /ventes?…&page=N&par_page=20` → `pagination: { page, par_page, total, pages }` ; un filtre ou une recherche ramène à la page 1 ; `?page=99` → dernière page |
`?vente=<ulid>` ouvre le détail puis nettoie l'adresse.

**Détail d'une vente** (`ventes/DetailVente.tsx`) — dialog « Détail de la vente · V-000123 » (`GET /api/v1/ventes/{ulid}`, squelette `[data-chargement="detail-vente"]`, erreur « Un problème est survenu… »).
Contenu : montant, sats, moyen ; pastille statut (+ alerte « Trop-perçu » / « Payée après annulation ») ; « Caissier », « Créée », « Payée », « Note » ; h3 « Articles » (libellé, « × q », total) ; h3 « Tentatives de paiement » (moyen, « simulé », statut « En attente/Réussi/Expiré/Échoué/Annulé », « Cours appliqué » « 1 BTC = X FCFA », « Équivalent en sats », « Empreinte », « Créée », « Réglée » ou « Expire »).
| Action | Rôle / nom | Condition | Effet |
|---|---|---|---|
| link « Voir le reçu » | link `target=_blank` | vente payée (`recu_url`) | `/r/<jeton>` |
| button « Annuler la vente » | Bouton danger | vente en attente (tous rôles ; serveur : caissier seulement ses ventes) | dialog « Annuler cette vente ? » → « Garder la vente » / « Annuler la vente » → `POST /ventes/{ulid}/annuler` 200 → toast « Vente annulée » ; 409 → toast « Ces données ont changé entre-temps. L'écran a été actualisé. » |
| button « Confirmer la réception » | Bouton | gestion + tentative `wave_manuel` en attente | dialog « Confirmer la réception de X FCFA ? » → « Annuler » / « Confirmer la réception » → `POST /paiements/{ulid}/confirmer-manuellement` 200 → toast « Réception confirmée » |
| button « Reprendre le paiement » | Bouton | vente + tentative en attente | ferme → `/caisse/paiement/{ulid}` |
| button « Fermer » | BoutonIcone | — | ferme |

### 2.12 `/tableau-de-bord` (`ecrans/TableauDeBord.tsx`)
Garde : `RequiertBoutique`. `[data-ecran="tableau-de-bord"]`. Temps réel `['ventes','paiements']`. Squelette `[data-chargement="tableau-de-bord"]`. `GET /api/v1/tableau-de-bord?periode=aujourdhui|hier|7j|30j`.
- h1 « Tableau de bord » ; caissier : « Vos chiffres d'aujourd'hui », période forcée « aujourd'hui », pas de sélecteur.
- radiogroup « Période » → « Aujourd'hui », « Hier », « 7 jours », « 30 jours » (pas pour le caissier).
- Indicateurs : « Chiffre du jour » (sinon « Chiffre d'affaires ») + comparaison « +12 % » (« vs période précédente » ≥ 1024 px) ; « Ventes payées » ; « Panier moyen » ; carte « Répartition » : img « Bitcoin N % · Mobile money M % », lignes « Bitcoin » / « Mobile money » avec montants.
- Carte h2 « Évolution » : img « Courbe du chiffre d'affaires par jour » (≤ 1 point vide : « Aucune vente payée sur cette période. »).
- Carte h2 « Dernières ventes » + link « Voir toutes les ventes » → `/ventes` ; vide : « Dès la première vente, vous verrez ici votre chiffre du jour et la répartition bitcoin / mobile money, en direct. » ; list « Dernières ventes » (lignes compactes, même nom que § 2.11) → détail de vente (fenêtre du § 2.11).
- Erreur : « Un problème est survenu… » + « Réessayer ».

### 2.13 `/portefeuille` (`ecrans/Portefeuille.tsx`, `portefeuille/*`)
Garde : `RequiertRole(propriétaire, gérant)` (caissier → toast + `/caisse`). `[data-ecran="portefeuille"]`. Temps réel `['wallet','parametres']`. `GET /api/v1/wallet`, `GET /api/v1/wallet/transactions?limite=30` (si connecté). Squelettes `[data-chargement="solde"]`, `[data-chargement="historique"]`.
- h1 « Portefeuille ». Carte solde : « Solde » + pastille « Connecté » / « Non connecté » ; « N sats » ou « — » ; « X FCFA » ou « Aucun portefeuille connecté » ; « Vérifié il y a N min ». Gérant : « Seul le propriétaire peut envoyer des sats. »
- Carte h2 « Historique » : vide h2 « Aucun mouvement pour l'instant. » ; list « Historique » (img « Reçu » / « Envoyé », description, « il y a … », « +N sats » / « −N sats », frais).
- Carte h2 « Connexion du portefeuille » + pastille. Connecté : « Portefeuille » (alias, mock : « Portefeuille simulé SatsPoint »), « Adresse Lightning » + button « Copier » (toast « Copié »), « Budget d'envoi restant », « Connecté » « Vérifié … », list « Autorisations » ; propriétaire : button « Révoquer ». Non connecté + propriétaire : texte + formulaire (« Lien Nostr Wallet Connect », « Quels portefeuilles ? », « Connecter mon portefeuille », cf. § 2.7). Non connecté + gérant : h2 « Aucun portefeuille connecté » + « Connectez votre portefeuille Lightning pour recevoir vos paiements directement, sans intermédiaire. »

| Action | Rôle / nom | Condition | Effet |
|---|---|---|---|
| button « Recevoir » | Bouton | désactivé si non connecté | dialog « Recevoir des sats » |
| ↳ radiogroup « Montant » → « FCFA », « sats » ; textbox « Montant en FCFA » / « Montant en sats » ; « Description facultatif » ; button « Créer la demande » | — | montant vide/0 → « Ce champ est obligatoire. » | `POST /api/v1/wallet/recevoir {montant_xof|montant_sats, description?}` **201** → img « Code QR de la demande », « N sats », « X FCFA », « Expire dans m:ss », buttons « Copier la demande » (toast « Demande copiée »), « Partager » |
| button « Envoyer » | Bouton | **propriétaire seulement** ; désactivé si non connecté | dialog « Envoyer des sats » (4 étapes ci-dessous) |
| ↳ étape 1 : textbox « Facture ou adresse Lightning » (aide « Collez une facture (lnbc…), une adresse (nom@domaine) ou un LNURL. ») ; buttons « Coller » (presse-papiers), « Scanner un code » ; « Montant en sats » (adresse/LNURL sans montant) ; button « Aperçu » | — | vide → « Ce champ est obligatoire. » | `POST /api/v1/wallet/envoyer/apercu` 200 |
| ↳ « Scanner un code » | dialog « Scanner un code » | sans `BarcodeDetector`/caméra : h2 « La caméra n'est pas disponible sur cet appareil : collez le code. » | code lu → destination |
| ↳ étape 2 aperçu : « Destinataire », « Montant », « Frais estimés » « ≈ N sats », « Description » ; buttons « Retour », « Continuer » | — | — | — |
| ↳ étape 3 : « N sats », password « Votre mot de passe pour confirmer » + « Afficher le mot de passe » ; buttons « Retour », « Confirmer l'envoi » | « Confirmer l'envoi » désactivé si mot de passe vide | — | `POST /api/v1/wallet/envoyer {destination, montant_sats?, password}` 200 |
| ↳ étape 4 : succès « Envoi effectué » + « N sats envoyés · frais F · empreinte H » + « Fermer » ; échec : alerte + « Fermer » + « Modifier le montant » (`SOLDE_INSUFFISANT`, `DESTINATION_INVALIDE`) ou « Réessayer » (`MOT_DE_PASSE_INCORRECT`, jamais émis, § 5) ; `BUDGET_DEPASSE` : « Le budget d'envoi est fixé dans votre portefeuille lors de la connexion. » | — | messages : « Solde insuffisant pour cet envoi. », « Limite d'envoi atteinte pour aujourd'hui. », « Cette destination n'est pas reconnue. Vérifiez la facture ou l'adresse. », « L'envoi est incertain. Vérifiez votre portefeuille avant de réessayer. » | — |
| button « Révoquer » | Bouton | propriétaire, connecté | dialog « Révoquer la connexion ? » → « Annuler » / « Révoquer » → `DELETE /api/v1/boutique/wallet` 204 → toast « Connexion révoquée » |
| button « Connecter mon portefeuille » | Bouton | propriétaire, non connecté | `PUT /api/v1/boutique/wallet` 200 → toast « Portefeuille connecté » |

### 2.14 `/reglages` (`ecrans/Reglages.tsx`, `reglages/*`)
Garde : `RequiertRole(propriétaire, gérant)`. `[data-ecran="reglages"]`. Temps réel `['parametres']` (**bloqué en permanence**, § 5). Squelette `[data-chargement="ecran"]`. Ancres : `#boutique`, `#paytech`, `#paiements`, `#preferences` (défilement si `location.hash`). ⚠ 3 boutons « Enregistrer » : cibler par carte (h2).

| Carte (h2) | Éléments (nom exact) | Validation | Effet |
|---|---|---|---|
| « Ma boutique » | « Nom de la boutique » (60), « Téléphone facultatif », « Ville » (60), button « Enregistrer » | nom/ville vides → « Ce champ est obligatoire. » ; 422 par champ | `PATCH /api/v1/boutique {nom,telephone,ville}` 200 → toast « Réglages enregistrés » |
| « PayTech » (sous-titre « Vos clés restent chiffrées… », pastille « Non configuré » / « Configuré · Test » / « Configuré · Production ») — propriétaire | « Clé API », « Secret API » (password + « Afficher le mot de passe » ; aide « Laissez vide pour conserver la valeur enregistrée. » si configuré) ; radiogroup « Environnement » → « Test », « Production » ; si configuré : buttons « Supprimer les clés », « Tester la connexion » ; button « Enregistrer » | non configuré et champ vide → « Ce champ est obligatoire. » ; 422 par champ (8–255 `[A-Za-z0-9._-]`) | `PUT /api/v1/boutique/paytech {api_key?,api_secret?,environnement}` 200 → toast « Réglages enregistrés » ; « Tester la connexion » → `POST /boutique/paytech/verifier` 200 → toast « Tester la connexion » (succès ou erreur) + description serveur ; « Supprimer les clés » → dialog « Supprimer les clés PayTech ? » (« Le mobile money sera désactivé jusqu'à la saisie de nouvelles clés. ») → « Annuler » / « Supprimer les clés » → `DELETE /boutique/paytech` 204 → toast info « Supprimer les clés » |
| « PayTech » — gérant | texte « Cette page est réservée au propriétaire de la boutique. » | — | aucun formulaire (serveur : 403) |
| « Moyens de paiement » | slider « Durée d'une demande de paiement N min » (2–15, aide « Entre 2 et 15 minutes. ») ; « Montant maximum par vente » (aide = montant formaté) ; « Moyens actifs » : switch « Bitcoin (Lightning) », switch « Mobile money (PayTech) » (désactivé + « Non configuré » si PayTech absent), switch « Wave direct Confirmation manuelle par le propriétaire ou le gérant. » ; « Lien Wave direct » (url, placeholder `https://pay.wave.com/m/…`, « facultatif » si Wave off) ; textarea « Message sur le reçu 0/160 » ; button « Enregistrer » | max < 100 → « Le montant doit être d'au moins 100 FCFA. » ; Wave on + lien vide → « Ce champ est obligatoire. » ; serveur : « Le lien Wave doit commencer par https://pay.wave.com/. » ; tous moyens off → 422 `reglages.moyens` affiché « Certaines informations sont invalides. » | `PATCH /api/v1/boutique {reglages:{expiration_facture_min,montant_max_xof,moyens,wave_lien,message_recu}}` 200 → toast « Réglages enregistrés » |
| « Préférences » | panneau préférences (§ 2.0) | — | PATCH préférences |

### 2.15 `/equipe` (`ecrans/Equipe.tsx`)
Garde : `RequiertRole(propriétaire, gérant)`. `[data-ecran="equipe"]`. Temps réel `['equipe']`. `GET /api/v1/equipe`. Squelette `[data-chargement="equipe"]`.
- h1 « Équipe » + button « Inviter » (en-tête).
- Vide (≤ 1 membre et 0 invitation) : h2 « Vous êtes seul pour l'instant » + « Invitez un caissier ou un gérant : il encaisse pour vous, sans accès à votre argent. » + button « Inviter » (⚠ 2 boutons « Inviter » à l'écran).
- region « Membres » (h2) : par membre nom, « (vous) », pastille « Propriétaire »/« Gérant »/« Caissier », « Désactivé », « <contact> · Connexion il y a … » / « Jamais connecté ».
- region « Invitations en attente » (h2) : contact, rôle, « Expire dans 3 j » ; button « Annuler l'invitation ».

| Action | Rôle / nom | Condition | Effet |
|---|---|---|---|
| button « Inviter » | Bouton | — | dialog « Inviter une personne » (« Elle recevra un lien valable 72 heures. ») : « Téléphone ou e-mail », combobox « Rôle » (« Propriétaire » propriétaire seulement, « Gérant », « Caissier » par défaut), descriptions des rôles ; « Annuler » / « Inviter » → `POST /api/v1/equipe/invitations {contact, role}` 201 → toast « Invitation envoyée » ; vide → « Ce champ est obligatoire. » ; 422 → message sous le champ. **Le lien (`invitation.lien`, invitation par téléphone) n'est affiché nulle part** (§ 5) |
| button « Changer le rôle » | BoutonIcone | pas sur soi ; gérant : jamais sur un propriétaire | dialog « Changer le rôle » (description = nom) : combobox « Rôle » ; « Annuler » / « Enregistrer » (désactivé si rôle inchangé) → `PATCH /api/v1/equipe/{ulid} {role}` 200 (pas de toast) |
| button « Désactiver » | BoutonIcone | idem, membre actif | dialog « Désactiver <Nom> ? » (« Son accès est coupé immédiatement, sur tous ses appareils. ») → « Annuler » / « Désactiver » → `PATCH {actif:false}` 200 (sessions révoquées) |
| button « Réactiver » | BoutonIcone | membre désactivé | `PATCH {actif:true}` direct |
| button « Retirer de l'équipe » | BoutonIcone danger | idem | dialog « Retirer <Nom> de l'équipe ? » (« Ses ventes passées sont conservées. ») → « Annuler » / « Retirer de l'équipe » → `DELETE /api/v1/equipe/{ulid}` 204 |
| button « Annuler l'invitation » | BoutonIcone | invitation listée | `DELETE /api/v1/equipe/invitations/{ulid}` 204 **sans confirmation ni toast** |

### 2.16 `/articles` (+ assistant d'import) (`ecrans/Articles.tsx`, `articles/ImportArticles.tsx`)
Garde : `RequiertBoutique` (tous rôles ; caissier en lecture). `[data-ecran="articles"]`. Temps réel `['articles']`. `GET /api/v1/articles`. Squelette `[data-chargement="articles"]`.
- h1 « Articles » ; caissier : « Lecture seule : seul le propriétaire ou le gérant modifie les articles. »
- Vide : h2 « Aucun article » + « Créez vos articles les plus vendus pour encaisser d'un seul geste. » + button « Ajouter un article » (gestion).
- Liste (`<ol>`) list « Articles » : img couleur (nom de couleur, ou « Couleur » si couleur hexadécimale), nom, pastille « Masqué », « catégorie · référence », prix.

| Action | Rôle / nom | Condition | Effet |
|---|---|---|---|
| button « Importer » | BoutonIcone | gestion | assistant (ci-dessous) ; `?importer=1` l'ouvre aussi |
| button « Exporter les articles » | Menu | gestion | menu « Exporter » : « CSV Lisible par Excel », « Excel Classeur .xlsx » → `GET /api/v1/exports/articles?format=csv|xlsx` (fichier `articles-AAAA-MM-JJ.<ext>`) → toast « Export téléchargé » / « L'export n'a pas pu être téléchargé. Réessayez. » |
| button « Ajouter » (en-tête) / « Ajouter un article » (état vide) | Bouton | gestion | dialog « Ajouter un article » |
| button « Monter » / « Descendre » | BoutonIcone | gestion, ≥ 640 px ; désactivés en tête/fin de liste ou pendant l'envoi | `POST /api/v1/articles/ordre {ulids}` 200 (optimiste) |
| button « Modifier l'article » | BoutonIcone | gestion | dialog « Modifier l'article » ; `?article=<ulid>` l'ouvre aussi |
| button « Supprimer » | BoutonIcone danger | gestion | dialog « Supprimer <nom> ? » (« L'article disparaît de la grille de la caisse. Les ventes passées sont conservées. ») → « Annuler » / « Supprimer » → `DELETE /api/v1/articles/{ulid}` 204 → toast « Article supprimé » |
Formulaire article : « Nom », « Prix » (suffixe FCFA), « Catégorie facultatif », « Référence facultatif », radiogroup « Couleur » → radios « Orange », « Rouge », « Jaune », « Vert », « Bleu », « Violet », « Brun », « Gris » ; switch « Visible dans la caisse » ; « Annuler » / « Enregistrer ». Validation : nom vide / prix ≤ 0 → « Ce champ est obligatoire. ». Envoi `POST /api/v1/articles` (201) / `PATCH /api/v1/articles/{ulid}` → toast « Article enregistré ». **Le serveur refuse toute couleur non `#RRGGBB` : 422 systématique** (§ 5).

**Assistant « Importer des articles »** (dialog, description = étapes avec `aria-label` « Étape n sur 4 » : « Fichier », « Colonnes », « Mode », « Import » ; `[data-import="depot|colonnes|mode|import"]`)
| Étape | Éléments | Validation / désactivation | Effet |
|---|---|---|---|
| Fichier | zone `[data-depot-import]` (label « Déposez votre fichier ici ou touchez pour le choisir CSV ou Excel (.xlsx) · 2 Mo maximum · 1re ligne = noms des colonnes »), `input[type=file]` (sr-only), button « Télécharger un modèle » | extension ∉ csv/txt/xlsx → « Format non pris en charge : CSV ou Excel (.xlsx). » ; > 2 Mo → « Fichier trop lourd : 2 Mo maximum. » ; pendant l'analyse « Lecture du fichier… » | modèle `modele-articles.csv` (`Nom;Prix;Catégorie;Référence;Actif`) ; `POST /api/v1/imports/analyser` (multipart) 201 |
| Colonnes | « <fichier> · N colonnes · M lignes » ; h3 « Correspondance des colonnes » ; par colonne combobox « Champ SatsPoint pour la colonne « <col> » » (« Ignorer », « Nom », « Prix (FCFA) », « Catégorie », « Référence », « Couleur », « En vente ») + marque « Suggestion automatique » ; h3 « Aperçu des 10 premières lignes » (« Aucune erreur sur l'aperçu » / « N lignes en erreur », table, « Ligne n : prix illisible · … ») ; footer « Retour », « Continuer » | « Continuer » désactivé tant que Nom et Prix ne sont pas associés : alerte « Associez une colonne à : Nom, Prix (FCFA). » | — |
| Mode | radiogroup « Mode » → « Créer seulement les nouveaux … », « Créer et mettre à jour … », « Ignorer les lignes en erreur … » ; footer « Retour », « Importer N lignes » | — | `POST /api/v1/imports/{ulid}/executer {correspondance, mode}` **202** |
| Import | status « En préparation… » / « Import en cours… » / « Import terminé » / « L'import a échoué », « t / n lignes traitées », « N % » ; « Créés », « Mis à jour », « En erreur » ; region « Rapport d'erreurs » + button « Télécharger le rapport » (`GET /api/v1/imports/{ulid}/rapport`) ; button « Terminer » (fin) | — | `GET /imports/{ulid}` toutes les 1,5 s + temps réel `['imports']` ; « Terminer » → toast « N articles importés » (si terminé) |

### 2.17 `/r/:jeton` — reçu public (`ecrans/Recu.tsx`)
Garde : aucune (pas de langue requise). `[data-ecran="recu"]`. `GET /r/{jeton}` (Accept JSON, jeton `[A-Za-z0-9]{40,64}`). Squelette `[data-chargement="recu"]`.
- En-tête : button « Imprimer » (si reçu chargé → `window.print()`), combobox « Thème », combobox « Langue de l'interface ».
- Reçu : nom de boutique, montant, « soit N sats », pastille « Payée » ; « N° de vente », « Date », « Boutique » (« Nom · Ville »), « Moyen de paiement » (img du moyen + libellé) ; message du reçu ; pied « Reçu généré par SatsPoint ».
- Introuvable (404, vente non payée ou jeton faux) : h2 « Ce reçu est introuvable » + « Le lien est peut-être incomplet ou trop ancien. ».

### 2.18 `/invitation/:jeton` (`ecrans/Invitation.tsx`)
Garde : aucune. `[data-ecran="invitation"]`. `GET /api/v1/invitations/{jeton}` (public). Squelette `[data-chargement="invitation"]`.
- 404 : h2 « Invitation introuvable » + « Le lien a expiré ou a déjà servi. Demandez une nouvelle invitation à la boutique. » ; 410 `INVITATION_EXPIREE` : h2 « Invitation expirée » + « Ce lien n'est plus valable. Demandez une nouvelle invitation à la boutique. » ; link « Retour à l'accueil » → `/accueil`.
- Valide : h1 « Vous êtes invité » ; « Rejoignez l'équipe de cette boutique sur SatsPoint. » ; `[data-invitation]` : nom de boutique, « Votre rôle » + rôle, « Invitation pour » + contact masqué, « Valable jusqu'au » + date ; texte de droits (ex. « Vous pourrez encaisser et voir vos ventes du jour. »).

| Élément | Condition | Effet |
|---|---|---|
| link « Créer mon compte » | anonyme | → `/inscription?suite=%2Finvitation%2F<jeton>` |
| link « J'ai déjà un compte » | anonyme | → `/connexion?suite=…` ; note « Utilisez le téléphone ou l'e-mail auquel l'invitation a été envoyée. » |
| « Connecté en tant que <Nom>. » + button « Rejoindre la boutique » | connecté | `POST /api/v1/invitations/{jeton}/accepter` 200 → toast « Bienvenue chez <Boutique> » → `cheminAccueil` ; 403 (autre contact) → « Cette page est réservée au propriétaire de la boutique. » ; 409 (déjà dans une boutique) → « Ces données ont changé entre-temps… » (§ 5) |

### 2.19 `/securite/2fa` (`ecrans/securite/DeuxFacteurs.tsx`)
Garde : session + coquille (tous les comptes, sans boutique requise). `[data-ecran="securite-2fa"][data-etape="activation|codes|active"]`. h1 « Double authentification » ; « Un code à 6 chiffres sur votre téléphone, en plus du mot de passe. »
| Étape | Éléments | Validation | Effet |
|---|---|---|---|
| activation | super-admin : status « La console plateforme exige la double authentification. Activez-la pour continuer. » ; 3 étapes (« Installez une application d'authentification », « Scannez ce code avec l'application », « Saisissez le code affiché ») ; img « Code QR à scanner avec votre application d'authentification » (squelette `[data-chargement="2fa"]`) ; « Clé secrète » `code[data-secret]` (groupes de 4) ; button « Copier la clé secrète » (→ « Copié » 1,5 s) ; « Réessayer » si l'initialisation échoue ; textbox « Code à 6 chiffres » (placeholder `000000`, envoi auto au 6e chiffre) ; button « Activer » (désactivé avant initialisation) | < 6 → « Saisissez les 6 chiffres. » ; faux → « Code incorrect. Vérifiez l'heure de votre téléphone et réessayez. » | au montage `POST /api/v1/auth/2fa/initialiser` 200 (2 appels en StrictMode dev) ; `POST /auth/2fa/activer {code}` 200 → toast « Double authentification activée » |
| codes | h2 « Vos codes de secours » ; list « Vos codes de secours » ; buttons « Copier les codes » (toast « Copié », coche la case), « Télécharger » (`satspoint-codes-de-secours.txt`, coche la case) ; checkbox « J'ai rangé ces codes en lieu sûr » ; button « Terminer » | « Terminer » désactivé tant que la case n'est pas cochée | → `suite` ou `cheminAccueil` |
| active | « Double authentification activée », « À chaque connexion, un code de votre application vous sera demandé. », « Obligatoire pour la console plateforme. » (super-admin) ; « Nouveau téléphone ? Désactivez puis réactivez. » + button « Désactiver » → formulaire : texte, « Mot de passe » (+ afficher), « Annuler », « Désactiver » | vide → « Ce champ est obligatoire. » ; faux → « Mot de passe incorrect. » | `DELETE /api/v1/auth/2fa {password}` 204 → toast info « Double authentification désactivée » |

### 2.20 `/verification-2fa` (`ecrans/securite/VerificationDeuxFacteurs.tsx`)
Garde : session, hors coquille. Redirige : sans utilisateur → `/connexion` ; 2FA requise non activée → `/securite/2fa` ; 2FA inactive ou déjà validée → `suite`/`cheminAccueil`. `[data-ecran="verification-2fa"]`.
- h1 « Code de vérification » ; « Ouvrez votre application d'authentification et saisissez le code à 6 chiffres. » (secours : « Saisissez l'un de vos codes de secours (il ne servira qu'une fois). »).
- textbox « Code à 6 chiffres » / « Code de secours » (`xxxx-xxxx`) ; button « Vérifier » → `POST /api/v1/auth/2fa/verifier {code}` 200 → `suite` ; button « Utiliser un code de secours » ↔ « Utiliser l'application » ; button « Me déconnecter » → `POST /auth/deconnexion` → `/connexion`.
- Erreurs : « Saisissez les 6 chiffres. », « Saisissez le code de secours complet (8 caractères). », « Code incorrect. Vérifiez l'heure de votre téléphone et réessayez. », « Trop d'essais. Patientez une minute puis réessayez. »

### 2.21 `/admin` — console plateforme (`ecrans/admin/Console.tsx`, `console/*`)
Garde : `RequiertSuperAdmin`. `[data-ecran="admin"][data-onglet="ensemble|boutiques|sante|journal"]`. Temps réel `['boutiques','audio','audios','journal']` (seules `audio`/`audios` sont émises, § 5).
- h1 « Console plateforme » ; « Adoption, boutiques, santé des services et journal. Aucun montant des boutiques n'apparaît ici. »
- tablist « Console plateforme » → tabs « Vue d'ensemble » (mobile : « Résumé » visible, nom accessible inchangé), « Boutiques », « Santé », « Journal » ; `?onglet=boutiques|sante|journal` (Vue d'ensemble = sans paramètre).

| Onglet | Contenu | Actions |
|---|---|---|
| Vue d'ensemble `[data-vue="ensemble"]` (squelette `statistiques`) | `GET /api/v1/admin/statistiques` ; « Commerçants actifs » (+ « Au moins un paiement reçu cette semaine »), « Paiements par commerçant », « Confirmation médiane » (« N s » ou « — »), « Bitcoin / mobile money » (img « X % des paiements en bitcoin, Y % en mobile money », « Bitcoin X % », « Mobile money Y % ») ; h2 « Couverture audio par langue » (Wolof, Sérère, Pulaar, Diola, Français : « N % ») ; « T boutiques · A actives · N nouvelles cette semaine · Chiffres agrégés… » | link « Ouvrir le studio » → `/admin/studio` |
| Boutiques `[data-vue="boutiques"]` (squelette `boutiques`) | `GET /admin/boutiques?q=&statut=&page=&par_page=20` ; list « Boutiques » : « Nom · Ville », « propriétaire · contact » / « Sans propriétaire », voyants img « Portefeuille connecté »/« Portefeuille non connecté », « Mobile money configuré »/« Mobile money non configuré », « Paiement test réussi »/« Paiement test non fait », « N ventes · 7 j » / « Aucune vente », pastille « Active »/« Suspendue » ; vide h2 « Aucune boutique ne correspond » | searchbox « Nom, ville ou propriétaire » (250 ms) ; radiogroup « Statut des boutiques » → « Toutes », « Actives », « Suspendues » ; button « Suspendre la boutique » / « Réactiver la boutique » → dialog « Suspendre « X » ? » (« L'équipe de la boutique ne pourra plus encaisser ni se connecter… ») / « Réactiver « X » ? » → « Annuler » / « Suspendre la boutique » / « Réactiver la boutique » → `PATCH /api/v1/admin/boutiques/{ulid} {statut}` 200 → toast « « X » est suspendue » / « « X » est réactivée » ; navigation « Boutiques » (pagination, `?onglet=boutiques&page=N`, 20 par page) |
| Santé `[data-vue="sante"]` (squelette `sante`) | `GET /admin/sante` toutes les 30 s ; statut global « Tous les services fonctionnent » / « Service dégradé » / « Plateforme indisponible », « Vérifié il y a … · version x » ; list « Santé » : « Base de données », « Cache et files (Redis) », « Temps réel », « Passerelle Lightning », « Cours du bitcoin » (« Mis à jour il y a N s · S sources »), « Files d'attente » (« N en attente · M en échec »), « Fichiers audio » ; niveau « OK » / « À surveiller » / « En panne » (`[data-niveau]`) | button « Actualiser » → relecture |
| Journal `[data-vue="journal"]` (squelette `journal`) | `GET /admin/journal?action=<famille>.&du=&au=&page=&par_page=30` ; list « Journal » : libellé d'action (sinon code brut), code, « utilisateur · boutique · IP », détails, date ; vide h2 « Aucune entrée pour ces filtres » | combobox « Type d'action » (« Toutes les actions », « Connexions et sécurité », « Studio audio », « Boutiques », « Équipe », « Portefeuilles », « Mobile money », « Ventes ») ; dates « Du », « Au » ; navigation « Journal » (pagination, `?onglet=journal&page=N`, 30 par page ; changer d'onglet remet la page à 1) |

### 2.22 `/admin/studio` — studio audio (`ecrans/admin/StudioAudio.tsx`, `studio/*`)
Garde : `RequiertSuperAdmin` ; `/admin/studio-audio` → redirection. `[data-ecran="studio"]`. `GET /api/v1/admin/audio/matrice` ; relecture toutes les 3 s tant qu'un audio est « En traitement » ; temps réel `['audio','audios']`. Squelette `[data-chargement="studio"]`.
- h1 « Studio audio » ; « Enregistrez chaque bouton dans chaque langue. Les essentielles (étoile) d'abord. »
- button nom (aria-label) « Publier N brouillon(s) en <Langue> » (texte visible « Publier les brouillons » + compteur) ; désactivé si 0 → dialog « Publier N brouillons en <Langue> ? » (« Ils seront lus chez tous les commerçants dès maintenant. ») → « Annuler » / « Publier les brouillons » → `POST /admin/audio/publier {ids}` 200 → toast « N audios publiés en <Langue> ».
- radiogroup « Langue de travail » → une radio par langue (nom = « <Langue> p/t … essentielle(s) manquante(s) / Essentielles prêtes p publiés et b brouillons sur t »), `[data-couverture]`.
- searchbox « Chercher une clé ou un texte » ; combobox « Écran » (« Tous les écrans » + écrans) ; boutons bascule (`aria-pressed`) « Manquants seulement », « Mode rafale ».
- Bureau : table « Matrice des clés vocales par langue » (`[data-matrice]`) : par clé un button texte FR + clé, puis une case par langue = button « <Langue> — « <texte> » : <Publié|Brouillon|En traitement|Erreur|Manquant> » (`aria-pressed`, `[data-statut]`). Mobile : une langue, buttons de même nom → dialog « Enregistrement » (titre masqué).
- Vide : h2 « Aucune clé pour ces filtres » (ou « Tout est enregistré en <Langue> ») + button « Effacer les filtres ».

**Panneau d'enregistrement** (region « Enregistrement », `[data-panneau="enregistrement"][data-phase]`)
| Élément | Condition | Effet |
|---|---|---|
| buttons « Clé précédente », « Case manquante suivante » | — | change de case (prise jetée) |
| ligne de version `[data-version]` : texte (« Brouillon à écouter puis publier », « Traitement en cours (silences, volume)… », « Version publiée », erreur) ; button « Écouter le brouillon » / « Écouter la version publiée » | statut ≠ manquant ; URL présente | lecture |
| button « Publier » | brouillon | `POST /admin/audio/publier {cle, langue}` 200 → toast « Audio publié : disponible chez tout le monde » **(irréversible : pas de suppression d'un publié)** |
| button « Supprimer le brouillon » | brouillon ou erreur | `DELETE /api/v1/admin/audio/{id}` 204 → toast info « Brouillon supprimé » |
| micro : button « Enregistrer » (`[data-action="enregistrer"]`) → « Autorisez le micro dans votre navigateur… » → décompte `[data-decompte]` 3-2-1 « Préparez-vous… » + « Annuler » → enregistrement (« Arrêter », `[data-action="arreter"]`, « m:ss / 0:15 ») → prête (« Prise de m:ss », buttons « Réécouter », « Refaire », « Valider » `[data-action="valider"]`) | micro refusé : « Le micro est bloqué… » ; absent : « Aucun micro n'est disponible sur cet appareil… » ; trop court : « Trop court : parlez après le 3-2-1. » | « Valider » → `POST /api/v1/admin/audio` (multipart cle, langue, fichier) 201 → toast « Enregistrement envoyé » (« Il sera prêt à écouter dans quelques secondes. », sauf mode rafale) |
| dépôt `[data-depot]` label « Déposer un fichier audio mp3, wav, m4a, ogg, webm · 2 Mo · 15 s maximum » + `input[type=file]` | refus client : « Format non pris en charge : mp3, wav, m4a, ogg ou webm. », « Fichier trop lourd : 2 Mo maximum. », « Audio trop long : 15 secondes maximum. » | `POST /admin/audio` |
| raccourcis (bureau) : Espace enregistrer/arrêter, Entrée valider, R refaire, → suivant, ← précédent, P publier | inactifs si une autre fenêtre est ouverte ou pendant une saisie | — |

### 2.23 Page introuvable (`*`, `ecrans/Introuvable.tsx`) et erreur de rendu
- `[data-ecran="introuvable"]` (mise en page invité) : h2 « Page introuvable », « Cette adresse ne mène nulle part. Revenez à l'accueil pour continuer. », link « Retour à l'accueil » → `/`.
- Erreur de rendu / morceau non chargé (`routes/Racine.tsx:43-55`) : `[data-ecran="erreur"]`, « Un problème est survenu. Réessayez dans un instant. » (ou « Page introuvable »), button « Retour à l'accueil » (rechargement complet).

---

## 3. Matrice rôle × écran

Légende : ✅ accessible · → redirection (toast ⚠ = « Cette page est réservée au propriétaire de la boutique. »). « Vis. » = visiteur avec langue choisie (sans langue : tout écran invité → `/langue`). Serveur entre crochets quand il diffère.

| Écran | Vis. | Sans boutique | Caissier | Gérant | Propriétaire | Super-admin (2FA validée) |
|---|---|---|---|---|---|---|
| `/` | → `/accueil` | → `/demarrage` | → `/caisse` | → `/caisse` | → `/caisse` | → `/admin` |
| `/langue` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/accueil`, `/connexion`, `/inscription`, `/mot-de-passe/*` | ✅ | → `/demarrage` | → `/caisse` | → `/caisse` | → `/caisse` | → `/admin` |
| `/demarrage` | → `/connexion?suite=` | ✅ | → `/caisse` ⚠ (garde ajoutée le 8/11) | → `/caisse` ⚠ (garde ajoutée le 8/11) | ✅ | → `/admin` |
| `/caisse` | → connexion | → `/demarrage` | ✅ | ✅ | ✅ | → `/admin` |
| `/caisse/paiement/:ulid` | → connexion | → `/demarrage` | ✅ ses ventes [autres : 403 → état « erreur »] | ✅ | ✅ | → `/admin` |
| `/ventes` | → connexion | → `/demarrage` | ✅ ses ventes du jour, sans export [export 403] | ✅ | ✅ | → `/admin` |
| `/tableau-de-bord` | → connexion | → `/demarrage` | ✅ ses chiffres du jour | ✅ | ✅ | → `/admin` |
| `/articles` | → connexion | → `/demarrage` | ✅ lecture [écriture/import/export 403] | ✅ | ✅ | → `/admin` |
| `/portefeuille` | → connexion | → `/demarrage` | → `/caisse` ⚠ [403] | ✅ sans « Envoyer » ni connexion [envoi/connexion 403] | ✅ | → `/admin` |
| `/equipe` | → connexion | → `/demarrage` | → `/caisse` ⚠ [403] | ✅ sauf propriétaires | ✅ | → `/admin` |
| `/reglages` | → connexion | → `/demarrage` | → `/caisse` ⚠ [403] | ✅ sans PayTech [403] | ✅ | → `/admin` |
| `/securite/2fa` | → connexion | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/verification-2fa` | → connexion | → accueil (sauf 2FA à valider) | idem | idem | idem | idem |
| `/admin`, `/admin/studio` | → connexion | → `/demarrage` ⚠ | → `/caisse` ⚠ | → `/caisse` ⚠ | → `/caisse` ⚠ | ✅ (2FA non activée → `/securite/2fa?suite=` ; non validée → `/verification-2fa?suite=`) |
| `/r/:jeton`, `/invitation/:jeton` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (accepter : 403) |
| `*` | introuvable | introuvable | introuvable | introuvable | introuvable | introuvable |

Compte avec 2FA active non validée (tout rôle) : toute route sous `RequiertSession` → `/verification-2fa?suite=…`.

---

## 4. Parcours métier de bout en bout

Conventions communes :
- **Boutique de test** (fixture de portée *worker*, une par exécution pour respecter 10 inscriptions/h) : identifiant `+22177<7 chiffres aléatoires>`, nom `TEST-E2E-<AAAA-MM-JJ>-<suffixe>`, ville « Dakar », portefeuille `mock://e2e-<suffixe>`. Création par l'API **depuis le contexte navigateur** (`page.request`, même origine 5190) : `GET /sanctum/csrf-cookie`, puis en-tête `X-XSRF-TOKEN` (cookie décodé) et `Referer: http://localhost:5190/` (Sanctum *stateful*) : `POST /api/v1/auth/inscription` 201 → `POST /api/v1/boutique` 201 → `PUT /api/v1/boutique/wallet {uri}` 200. Les membres (caissier, gérant) s'obtiennent par invitation (parcours 09) et sont mis en commun par la même fixture.
- Ventes de test : `note` = `TEST-E2E-<date>` (champ « Note »).
- **Nettoyage** : articles (`DELETE /articles/{ulid}`), invitations, membres, clés PayTech, révocation du portefeuille mock sont faisables par l'API ; **boutiques, comptes et ventes ne sont supprimables par aucune route** → purge SQL par préfixe `TEST-E2E-` hors application (à valider avec la propriétaire, § 5).
- Réponses 4xx attendues à déclarer via `surveillance.tolerer(...)` dans chaque test concerné (listées par parcours).

### 01-premier-lancement-langue
Rôle : visiteur, contexte neuf (aucun `localStorage`).
1. `goto('/')` → URL `/langue`, `[data-ecran="langue"]`, h1 « Choisissez votre langue », 6 buttons (« Wolof wo »… « English en »), aucun `aria-pressed=true`.
2. Si le manifeste FR/WO a des audios (`GET /api/v1/audio/manifeste/wo`) : clic `[data-haut-parleur="langue.wo"]` → l'URL reste `/langue`, `aria-pressed=true` sur le haut-parleur, texte sr-only « Lecture en cours ».
3. Clic « Français fr » → URL `/accueil` ; `localStorage` : `langue-choisie=fr`, `aide-vocale=0`, `langue-audio=fr`, `locale=fr` ; h1 « Bienvenue sur SatsPoint ».
4. Links « Créer ma boutique » → `/inscription` (retour), « Me connecter » → `/connexion` (retour), « Changer de langue » → `/langue`.
5. Clic « English en » → `/accueil`, `html[lang="en"]`, h1 « Welcome to SatsPoint », `langue-audio` absente, `aide-vocale=0`.
6. Combobox « Langue de l'interface » → « Français » : textes FR revenus, rechargement → préférence conservée.
7. Combobox « Thème » → « Sombre » : `html[data-theme="sombre"]`, `satspoint.theme=sombre` ; « Automatique » → attribut retiré.
Assertions réseau : aucun 4xx sauf `401 GET /api/v1/moi` (toléré). Nettoyage : rien.

### 02-inscription-demarrage-boutique
Rôle : nouveau compte (téléphone aléatoire). Seul parcours qui crée sa boutique par l'interface.
1. `/inscription` : submit vide → 2 × « Ce champ est obligatoire. » + « Le mot de passe doit contenir au moins 12 caractères. » ; confirmation différente → « Les deux mots de passe ne sont pas identiques. ».
2. Saisie valide → `POST /auth/inscription` 201, toast « Votre compte est créé. Bienvenue ! », URL `/demarrage`, « 0 / 4 étapes », progressbar `aria-valuenow=0`, étape 1 ouverte (`aria-expanded=true`) ; barre latérale : seul link « Démarrage guidé » ; mobile : pas de barre du bas.
3. Étape 1 : « Nom de la boutique » vide → « Ce champ est obligatoire. » ; saisie `TEST-E2E-…`, « Créer ma boutique » → `POST /api/v1/boutique` **201**. Attendu : « 1 / 4 étapes ». **Constaté par lecture du code : redirection `/connexion?suite=%2Fdemarrage` (défaut bloquant, § 5) → KO + capture.** Reprise : se reconnecter (même identifiant) → retour `/demarrage` « 1 / 4 étapes », étape 1 « 1. Ma boutique TEST-E2E-… · Dakar ».
4. Étape 2 : vide → « Ce champ est obligatoire. » ; `nostr+walletconnect://abc` → erreur serveur sous le champ (422 toléré) ; `mock://e2e-<suffixe>` → `PUT /boutique/wallet` 200, toast « Portefeuille connecté », « 2 / 4 étapes ».
5. Étape 3 : « Passer cette étape » → étape 4 ouverte (« 2 / 4 » inchangé).
6. Étape 4 : « Lancer le paiement test » → `POST /ventes` 201 → `/caisse/paiement/{ulid}?test=1`, `data-etat=en_attente`, montant « 100 FCFA », QR prêt, « Simuler le paiement » visible → clic → `[data-ecran="succes"]`, h1 « Votre caisse est prête ! », `PATCH /api/v1/boutique {paiement_test:true}` 200 ; button « Aller à la caisse » → `/caisse` ; bandeau `[data-bandeau="demarrage"]` absent ; lien « Démarrage guidé » absent du menu.
7. `/demarrage` : h2 « Votre caisse est prête », « 3 / 4 étapes » (mobile money passé) ; « Aller à la caisse » → `/caisse`.
4xx tolérés : `422 PUT /boutique/wallet`. Nettoyage : révoquer le portefeuille ; compte et boutique → purge SQL.

### 03-encaissement-lightning-simule
Rôle : propriétaire de la boutique de test (mock, Lightning seul actif).
1. `/caisse` : « 0 FCFA », « Encaisser » désactivé. « Touche 5 », « Touche 0 » → « 50 FCFA » + alerte « Le montant doit être d'au moins 100 FCFA. », bouton toujours désactivé. « Effacer — … » ×2, puis « Touche 1 », « Touche 5 », « Touche 0 », « Touche 0 » → « 1 500 FCFA », ligne « ≈ N sats » (si cours), cours « 1 BTC = … ».
2. « Note » → « Note facultatif » = `TEST-E2E-<date>`.
3. « Encaisser » (1 seul moyen → pas de fenêtre) → `POST /api/v1/ventes` 201 → URL `/caisse/paiement/<ulid>`, `data-etat=en_attente`, h1 « Demande de paiement », « Vente V-…», tab « Bitcoin » `aria-selected=true`, img « Code QR de la demande de paiement » `[data-qr="pret"]`, « En attente du paiement… », compte à rebours `Expire dans \d:\d\d`.
4. « Copier la demande » (permissions presse-papiers) → toast « Demande copiée », presse-papiers commence par `lnbcrt`.
5. « Vérifier le paiement » → `POST …/verifier` 200, toast « Vérifié : toujours en attente du paiement. ».
6. « Simuler le paiement » → `POST …/simuler` 200 → `[data-ecran="succes"]` (≤ 3 s), h1 « Paiement reçu », « 1 500 FCFA », « par Bitcoin », « Vente V-… ».
7. Attendre « Envoyer le reçu » activé → dialog « Envoyer le reçu » (description `…/r/<jeton>`), links « WhatsApp » (`href` commence par `https://wa.me/?text=`), « SMS » ; « Copier le lien » → toast « Lien du reçu copié ».
8. « Nouvelle vente » → `/caisse`, « 0 FCFA ». `/ventes` → ligne « V-… · 1 500 FCFA · Payée » ; rechargement → toujours là.
Variante articles (bureau) : créer 2 articles par l'API (couleur `#10B981`, § 5), cliquer les tuiles « TEST-E2E-A … » → panier, « Total », vente avec `lignes`. Nettoyage : supprimer les articles.

### 04-encaissement-expiration-renouvellement
Rôle : propriétaire boutique de test.
1. `/reglages` carte « Moyens de paiement » : slider « Durée d'une demande de paiement » à 2 (flèches) → « Enregistrer » → toast « Réglages enregistrés » (ou `PATCH /boutique` par l'API).
2. Créer une vente 1 000 FCFA (comme 03) → `en_attente`, compte à rebours ≤ « 2:00 ».
3. Attendre l'expiration **sans `waitForTimeout`** : soit `page.clock.install()` avant le chargement puis `clock.fastForward('02:05')` (panneau expiré local), soit `expect(getByRole('heading', { name: 'Le délai de paiement est dépassé.' })).toBeVisible({ timeout: 150_000 })` (le planificateur marque `expire`, `GET /paiements/{ulid}` → `paiement.statut='expire'`).
4. Panneau : « Aucun paiement n'a été reçu… », button « Nouvelle demande de paiement » ; « Changer de moyen de paiement » absent (un seul moyen).
5. « Nouvelle demande de paiement » → `POST /api/v1/ventes/{vente}/paiements` 201 → URL change d'ulid (même « Vente V-… »), `en_attente`, nouveau QR.
6. « Simuler le paiement » → succès. `/ventes` → détail « Détail de la vente · V-… » : 2 tentatives (« Expiré » puis « Réussi »).
7. Variante annulation depuis l'écran : nouvelle vente → « Annuler la vente » (icône) → dialog « Annuler cette vente ? » → « Garder la vente » (toujours en attente) → à nouveau → « Annuler la vente » → `POST …/annuler` 200, h2 « Paiement annulé », « Nouvelle vente » → `/caisse`.
Nettoyage : remettre l'expiration à 5 min.

### 05-encaissement-mobile-money-wave-direct
Rôles : propriétaire + caissier de la boutique de test.
1. `/reglages` « Moyens de paiement » : switch « Wave direct … » activé, « Enregistrer » sans lien → « Ce champ est obligatoire. » ; lien `https://example.com/x` → 422 « Le lien Wave doit commencer par https://pay.wave.com/. » (toléré) ; lien `https://pay.wave.com/m/TEST-E2E-<suffixe>` → toast « Réglages enregistrés ».
2. `/caisse` 2 000 FCFA → « Encaisser » → dialog « Comment le client paie-t-il ? » (description « 2 000 FCFA ») avec « Bitcoin ≈ … » et « Wave direct Confirmation manuelle par le propriétaire ou le gérant. » → clic Wave direct → `POST /ventes {methode:'wave_manuel'}` 201.
3. Paiement : tab « Mobile money » sélectionné, QR prêt, texte « Le client paie avec Wave via ce lien… », « En attente de confirmation », link « Ouvrir le lien Wave » (`href` = lien, `target=_blank`), **pas** de « Simuler le paiement », button « Confirmer la réception ».
4. « Confirmer la réception » → dialog « Confirmer la réception de 2 000 FCFA ? » → « Annuler » (fenêtre fermée, toujours en attente) → à nouveau → « Confirmer la réception » → `POST …/confirmer-manuellement` 200 → succès « par Wave direct ».
5. Bascule de méthode : nouvelle vente Wave direct → tab « Bitcoin » → `POST …/paiements {methode:'lightning'}` 201, URL nouvel ulid, QR Lightning ; tab « Mobile money » → retour Wave direct.
6. Caissier (2e contexte) : vente Wave direct → pas de « Confirmer la réception ». Propriétaire `/ventes` → ligne « … · En attente » → détail → « Confirmer la réception » → dialog → confirmer → toast « Réception confirmée ». Chez le caissier, l'écran de paiement passe au succès en ≤ 2 s (temps réel `paiements`).
7. PayTech : voir parcours 11.
Nettoyage : désactiver Wave direct.

### 06-ventes-filtres-detail-annulation-export
Rôles : propriétaire (+ caissier pour les interdits). Données : 3 ventes par l'API (`POST /ventes` lightning) : A payée (`POST /paiements/{ulid}/simuler`), B en attente, C en attente.
1. `/ventes` : squelette puis 3 lignes ; totaux « 3 ventes », « Total », « Encaissé » = montant de A.
2. searchbox « N° ou montant » = numéro de B → après 300 ms `GET /ventes?periode=aujourdhui&q=…` → 1 ligne ; vider.
3. « Filtrer » (`aria-pressed=true`) → combobox « Statut » « En attente » → 2 lignes ; « Moyen » « Wave direct » → état vide « Aucune vente ne correspond à ces filtres. » ; « Réinitialiser les filtres » → 3 lignes. radiogroup « Période » « 7 jours » → `periode=7j` ; « Personnalisée » → « Du »/« Au ».
4. Ligne B → dialog « Détail de la vente · V-… » : « Caissier », « Créée », « Note » `TEST-E2E…`, tentative « Bitcoin », « simulé », « En attente » ; « Annuler la vente » → dialog « Annuler cette vente ? » → « Garder la vente » → toujours « En attente » ; à nouveau → « Annuler la vente » → toast « Vente annulée », pastille « Annulée », boutons d'action disparus ; « Fermer ».
5. Ligne C → « Reprendre le paiement » → `/caisse/paiement/<ulid>` en attente → annuler (nettoyage).
6. Ligne A → link « Voir le reçu » `href` `/r/<jeton>`.
7. « Exporter » → menu « Exporter » → « CSV Lisible par Excel » → événement `download`, fichier `.csv` contenant « V- » ; avec filtre actif le menu s'intitule « Exporter (filtres en cours) » ; « Excel Classeur .xlsx », « PDF Rapport à imprimer » → téléchargements ; toasts « Export téléchargé » (≤ 6 exports/min).
8. `?vente=<ulid A>` → détail ouvert directement, l'adresse redevient `/ventes`.
9. Caissier : pas de button « Exporter », pas de « Période » ni « Caissier » ; ne voit pas A/B/C (créées par le propriétaire) ; `GET /api/v1/exports/ventes` → 403 (toléré).

### 07-tableau-de-bord
Rôles : propriétaire, caissier. Données : 1 vente Lightning payée 1 000 FCFA + 1 Wave direct confirmée 2 000 FCFA (boutique de test, du jour).
1. `/tableau-de-bord` : squelette `[data-chargement="tableau-de-bord"]` puis « Chiffre du jour » « 3 000 FCFA », « Ventes payées » « 2 », « Panier moyen » « 1 500 FCFA », img « Bitcoin 33 % · Mobile money 67 % ».
2. radiogroup « Période » « 7 jours » → `GET /tableau-de-bord?periode=7j`, libellé « Chiffre d'affaires », courbe img « Courbe du chiffre d'affaires par jour » ; « Hier » → courbe « Aucune vente payée sur cette période. ».
3. « Dernières ventes » : 2 lignes ; clic → dialog « Détail de la vente · V-… » ; link « Voir toutes les ventes » → `/ventes`.
4. Temps réel : 2e contexte (caissier) encaisse + simule → l'indicateur passe à « 3 » ventes en ≤ 2 s sans rechargement.
5. Caissier : sous-titre « Vos chiffres d'aujourd'hui », aucun radiogroup « Période », seulement ses ventes.

### 08-portefeuille-recevoir-envoyer-simule
Rôles : propriétaire (boutique de test **mock uniquement**), gérant (si disponible).
1. `/portefeuille` : pastille « Connecté », solde « N sats », « Portefeuille simulé SatsPoint », list « Autorisations ».
2. « Recevoir » → dialog « Recevoir des sats » → « Créer la demande » vide → « Ce champ est obligatoire. » ; « Montant en FCFA » 500 → `POST /wallet/recevoir` **201** → img « Code QR de la demande », « 500 FCFA », compte à rebours ; mémoriser `bolt11` de la réponse ; « Copier la demande » → toast « Demande copiée » ; « Fermer ». Radio « sats » → libellé « Montant en sats ».
3. « Envoyer » → dialog « Envoyer des sats » → « Aperçu » vide → « Ce champ est obligatoire. » ; `abc` → « Cette destination n'est pas reconnue. Vérifiez la facture ou l'adresse. » (422 toléré) ; la facture de l'étape 2 (auto-paiement mock accepté) → « Aperçu » → « Destinataire », « Montant », « Frais estimés » → « Continuer » → « Confirmer l'envoi » désactivé → mot de passe faux → résultat : alerte (aujourd'hui « Certaines informations sont invalides. », § 5) → « Fermer ».
4. Recommencer avec le bon mot de passe → « Envoi effectué », « N sats envoyés · frais F · empreinte H » ; « Fermer » ; « Historique » : lignes « Envoyé » et « Reçu ».
5. Solde insuffisant : facture `montant_sats` 200 000 (> 100 000 du mock) → `SOLDE_INSUFFISANT` → « Solde insuffisant pour cet envoi. » + « Modifier le montant » → retour étape 1.
6. « Scanner un code » → dialog « Scanner un code » → (headless) h2 « La caméra n'est pas disponible sur cet appareil : collez le code. ».
7. « Révoquer » → dialog « Révoquer la connexion ? » → « Annuler » (toujours « Connecté ») → « Révoquer » → `DELETE /boutique/wallet` 204, toast « Connexion révoquée », « Non connecté », boutons « Recevoir »/« Envoyer » désactivés, formulaire « Lien Nostr Wallet Connect » → reconnecter `mock://e2e-<suffixe>` → toast « Portefeuille connecté ».
8. Gérant : pas de « Envoyer », texte « Seul le propriétaire peut envoyer des sats. », pas de « Révoquer » ; `POST /api/v1/wallet/envoyer/apercu` → 403 (toléré).
⚠ Jamais sur la boutique démo.

### 09-equipe-invitation-roles
Rôles : propriétaire boutique de test ; deux nouveaux comptes (téléphones aléatoires) qui deviennent caissier puis gérant (réutilisés par 10 et 18).
1. `/equipe` : h2 « Vous êtes seul pour l'instant ». « Inviter » (en-tête) → dialog « Inviter une personne » → « Inviter » vide → « Ce champ est obligatoire. ».
2. Contact caissier, combobox « Rôle » « Caissier » → `POST /equipe/invitations` 201 ; **lire `invitation.lien` dans la réponse** (`waitForResponse`) car l'écran ne l'affiche pas (§ 5) ; toast « Invitation envoyée » ; region « Invitations en attente » : contact, « Caissier », « Expire dans 3 j ». Idem pour le futur gérant (rôle « Gérant »). 3e invitation → « Annuler l'invitation » → ligne disparue (`DELETE` 204).
3. Contexte invité : `goto(lien)` → h1 « Vous êtes invité », boutique `TEST-E2E…`, « Caissier », contact masqué → « Créer mon compte » → `/inscription?suite=%2Finvitation%2F…` → inscription avec **le même téléphone** → retour `/invitation/<jeton>` « Connecté en tant que … » → « Rejoindre la boutique » → `POST …/accepter` 200 → toast « Bienvenue chez TEST-E2E… » → `/caisse`.
4. Chez le propriétaire (sans recharger) : la ligne apparaît dans « Membres », l'invitation disparaît (temps réel `equipe`, ≤ 2 s).
5. Lien déjà utilisé → h2 « Invitation expirée » (410 toléré) ; jeton inventé (48 alnum) → « Invitation introuvable » (404 toléré).
6. « Changer le rôle » (caissier) → combobox « Rôle » « Gérant » → « Enregistrer » → pastille « Gérant » ; revenir à « Caissier ».
7. « Désactiver » → dialog « Désactiver <Nom> ? » → « Annuler » (pas de « Désactivé ») → « Désactiver » → pastille « Désactivé » ; l'autre contexte reçoit 401 au prochain appel → `/connexion?suite=…` ; « Réactiver » → actif.
8. Vue gérant : sur la ligne du propriétaire aucun bouton d'action ; combobox « Rôle » de « Inviter » sans « Propriétaire ».
9. « Retirer de l'équipe » sur un membre jetable → dialog → « Annuler » puis confirmer → `DELETE` 204, ligne disparue.
10. Erreurs : inviter un membre déjà actif → 409 (toléré) → toast/alerte « Ces données ont changé entre-temps. L'écran a été actualisé. » (§ 5).

### 10-caissier-droits-et-interdits
Rôle : caissier de la boutique de test (deux tailles).
1. Menu : bureau, navigation « Navigation principale » = exactement « Caisse », « Ventes », « Tableau de bord », « Articles » ; mobile : « Caisse », « Ventes », « Tableau » + « Plus » → dialog « Plus » avec seulement « Articles ».
2. Adresses tapées : `/portefeuille`, `/equipe`, `/reglages`, `/admin`, `/admin/studio` → toast « Cette page est réservée au propriétaire de la boutique. » et URL `/caisse` pour chacune.
3. `/demarrage` → **accessible** (pas de garde de rôle, § 5) : vérifier qu'aucune action n'aboutit (403 tolérés) et le signaler.
4. `/ventes` : « Vos ventes d'aujourd'hui », pas d'« Exporter », filtres Statut/Moyen seulement ; `/tableau-de-bord` sans « Période » ; `/articles` sous-titre lecture seule, aucun « Importer »/« Exporter les articles »/« Ajouter »/« Modifier l'article »/« Supprimer ».
5. Encaisser 100 FCFA Lightning + « Simuler le paiement » → succès ; Wave direct → pas de « Confirmer la réception » ; « Annuler la vente » sur sa vente en attente → OK.
6. API directes (4xx tolérées) : `GET /wallet` 403, `GET /equipe` 403, `PATCH /boutique` 403, `POST /articles` 403, `GET /exports/ventes` 403, `POST /imports/analyser` 403, `GET /admin/statistiques` 403, `GET /ventes/<ulid d'une vente du propriétaire>` 403/404.
7. Recherche globale « regl » / « porte » / « equipe » → aucune page « Réglages », « Portefeuille », « Équipe ».

### 11-reglages-paytech
Rôles : propriétaire, gérant (boutique de test).
1. `/reglages` : carte « Ma boutique » : « Nom de la boutique » vide → « Ce champ est obligatoire. » ; `TEST-E2E-…-modifie` → toast « Réglages enregistrés » ; le nom change dans « Mon compte » ; rétablir.
2. Carte « Moyens de paiement » : « Montant maximum par vente » = 50 → « Le montant doit être d'au moins 100 FCFA. » ; tous les switches off → « Enregistrer » → 422 (toléré), alerte « Certaines informations sont invalides. » ; « Message sur le reçu » `TEST-E2E merci` → compteur « 14/160 » → toast.
3. Carte « PayTech » : pastille « Non configuré », switch « Mobile money (PayTech) » désactivé ; « Enregistrer » vide → 2 × « Ce champ est obligatoire. » ; « Clé API »/« Secret API » factices (`TESTE2Ekey12345678`), « Test » → `PUT /boutique/paytech` 200 → toast, pastille « Configuré · Test », aide « Laissez vide pour conserver la valeur enregistrée. », boutons « Supprimer les clés » et « Tester la connexion » apparus.
4. « Tester la connexion » → `POST …/verifier` 200 → toast « Tester la connexion » (erreur attendue avec des clés factices) + description.
5. `/caisse` 1 000 → « Encaisser » → fenêtre avec « Wave Mobile money », « Orange Money Mobile money », « Free Money Mobile money » → « Orange Money … » → paiement : tab « Mobile money », radiogroup « Choisissez l'opérateur » (radio « Orange Money » cochée), link « Ouvrir la page de paiement » ; si `simule` : « Simuler le paiement » → succès « par Mobile money · Orange Money » ; sinon annuler la vente.
6. « Supprimer les clés » → dialog « Supprimer les clés PayTech ? » → « Annuler » (toujours configuré) → « Supprimer les clés » → `DELETE` 204 → toast « Supprimer les clés », pastille « Non configuré ».
7. Préférences de la page : radio « Sombre » → `html[data-theme="sombre"]` + `PATCH /moi/preferences` 200 ; remettre « Automatique ».
8. `/reglages#paytech` → la carte PayTech défile dans la vue.
9. Gérant : carte PayTech = « Cette page est réservée au propriétaire de la boutique. », aucun champ ; `PUT /boutique/paytech` → 403 (toléré).

### 12-articles-import-export
Rôles : propriétaire (+ caissier en lecture), boutique de test.
1. `/articles` vide : h2 « Aucun article ». « Ajouter un article » → dialog « Ajouter un article » → « Enregistrer » vide → 2 × « Ce champ est obligatoire. » ; « Nom » `TEST-E2E-Thé`, « Prix » 1200, radio « Vert » → « Enregistrer » → attendu 201 + toast « Article enregistré » ; **constaté par le code : 422 « La couleur doit être au format #RRGGBB. » → KO** (toléré pour poursuivre, § 5).
2. Contournement pour la suite : 3 articles par l'API (`couleur:'#10B981'`). Liste : 3 lignes, img « Couleur ».
3. « Descendre » sur la 1re → `POST /articles/ordre` 200, ordre changé ; « Monter » désactivé sur la 1re.
4. « Modifier l'article » → dialog prérempli (couleur réinitialisée à « Orange ») → « Enregistrer » → même 422 (KO).
5. « Supprimer » → dialog « Supprimer TEST-E2E-… ? » → « Annuler » (toujours là) → « Supprimer » → toast « Article supprimé ».
6. Import : « Importer » → dialog « Importer des articles », « Étape 1 sur 4 » ; « Télécharger un modèle » → téléchargement `modele-articles.csv` ; `setInputFiles` d'un `.pdf` → « Format non pris en charge : CSV ou Excel (.xlsx). » ; CSV `Nom;Prix;Catégorie;Référence;Actif` + 2 lignes valides `TEST-E2E-…` + 1 ligne prix `abc` (pas de colonne Couleur) → `POST /imports/analyser` 201 → « … · 5 colonnes · 3 lignes », combobox « Champ SatsPoint pour la colonne « Nom » » = « Nom » avec « Suggestion automatique », « 1 ligne en erreur », « Ligne 4 : prix illisible ».
7. Mettre « Prix » sur « Ignorer » → alerte « Associez une colonne à : Prix (FCFA). », « Continuer » désactivé → rétablir → « Continuer » → radiogroup « Mode » → « Ignorer les lignes en erreur … » → « Importer 3 lignes » → `POST …/executer` 202 → « Import terminé », « Créés » 2, « En erreur » 1, region « Rapport d'erreurs », « Télécharger le rapport » → téléchargement CSV → « Terminer » → toast « 2 articles importés » → 2 lignes ajoutées.
8. Mode « Créer seulement les nouveaux » avec la ligne en erreur → « L'import a échoué ».
9. « Exporter les articles » → menu « Exporter » → « CSV Lisible par Excel » → fichier `articles-*.csv` contenant `TEST-E2E` ; « Excel Classeur .xlsx ».
10. `/articles?importer=1` → assistant ouvert ; `/articles?article=<ulid>` → « Modifier l'article » ouvert.
11. Caissier : tuiles visibles dans `/caisse`, aucun bouton de gestion.
Nettoyage : `DELETE /articles/{ulid}` pour tous les `TEST-E2E`.

### 13-recherche-globale
Rôles : propriétaire et caissier, boutique de test avec article `TEST-E2E-Bissap` et une vente.
1. `/caisse`, **Ctrl+K** → dialog « Recherche », combobox « Recherche » focalisé, `GET /recherche/recentes` ; sans récente : « Tapez au moins 2 lettres… ». Ctrl+K à nouveau → fermé ; Échap → fermé.
2. Taper « b » : rien ; « bi » → `GET /recherche?q=bi` (150 ms), regions « Articles » (option avec `<mark>`) et/ou « Pages et réglages ».
3. ↓ puis Entrée → `POST /recherche/recentes {terme:'bi'}` + navigation `/articles?article=<ulid>` → dialog « Modifier l'article » ouvert.
4. Rouvrir : region « Dernières recherches » contient « bi » (≤ 4 entrées) ; clic → champ rempli « bi ». « Effacer les dernières recherches » → `DELETE` 204 → texte d'aide.
5. Tolérance : « bisap » trouve `TEST-E2E-Bissap` ; « reglages » trouve « Réglages » ; « zzzzqq » → « Aucun résultat pour « zzzzqq » ». « Effacer la recherche » vide le champ.
6. Résultats de redirection (défauts § 5) : option de la rubrique « Ventes » → URL `/ventes/<ulid>` → page introuvable ; page « Ventes › Exporter » → `/ventes?exporter=1` sans menu ouvert ; page serveur « Connexion du portefeuille (NWC) » → `/reglages#wallet` sans ancre.
7. Hors ligne (`context.setOffline(true)`) : « Hors connexion : seules les pages et réglages sont proposés. », pages locales seulement.
8. Mobile : button « Recherche globale » (loupe), plein écran, button « Fermer ».
9. Caissier : « regl », « porte », « equipe » → aucune page interdite.

### 14-aide-vocale-haut-parleurs-et-langue
Rôle : visiteur puis propriétaire boutique de test. Pré-requis : audios publiés (`GET /api/v1/audio/manifeste/wo` et `/fr` non vides) ; sinon le test se marque « non testable » avec la raison.
1. `/langue` (contexte neuf) : un `[data-haut-parleur]` par tuile ayant un audio ; clic → `<audio>` reçoit la source du manifeste (requête `GET /audio/wo/<clé>.<empreinte>.mp3` 200), l'URL ne change pas.
2. Tuile « Wolof wo » → `aide-vocale=1`, `langue-audio=wo`, interface en français ; `/accueil` : links « Créer ma boutique » / « Me connecter » contiennent `[data-haut-parleur="accueil.creerBoutique"]` (nom accessible « Créer ma boutique Écouter ») ; clic sur le haut-parleur → lecture **sans** navigation ; clic sur le texte → navigation.
3. Connecté : « Mon compte » → switch « Aide vocale … » décoché → `PATCH /moi/preferences {aide_vocale:false}`, les haut-parleurs des boutons disparaissent ; ceux du radiogroup « Langue de la voix » restent (langue imposée).
4. Radio « Pulaar » → `langue-audio=ff`, PATCH ; repli FR pour les clés sans audio pulaar.
5. Annonce : aide vocale active, encaissement simulé → au succès, lecture de `paiement.recu` (requête audio) ; toast avec haut-parleur.
6. `/langue` → « English en » : `html[lang="en"]`, aide vocale coupée, `PATCH` {locale:'en', langue_audio:null, aide_vocale:false} → libellés anglais (« Charge » sur la caisse) ; revenir à « Français fr ».
7. Persistance : rechargement → mêmes préférences ; nouvelle connexion → préférences du compte appliquées.

### 15-admin-2fa-console
Rôle : super-admin. **Bloquant** : il faut le secret TOTP du compte (2FA déjà active) ou un super-admin de test dont on peut activer la 2FA (activer sur le compte réel le modifie durablement) — § 5.
1. Connexion → si 2FA non active : `/admin` → `/securite/2fa?suite=%2Fadmin`, status « La console plateforme exige la double authentification… », QR prêt, `code[data-secret]` lu, « 000000 » → « Code incorrect… » (422 toléré) ; code TOTP (`otpauth`) → `POST /auth/2fa/activer` 200 → toast « Double authentification activée » → « Vos codes de secours » ; « Terminer » désactivé → « Télécharger » (fichier) → case cochée → « Terminer » → `/admin`.
2. Déconnexion / reconnexion → `/verification-2fa?suite=%2Fadmin` : « Vérifier » vide → « Saisissez les 6 chiffres. » ; « Utiliser un code de secours » → libellé « Code de secours » ; « Utiliser l'application » ; code TOTP → `/admin`.
3. `/admin` : h1 « Console plateforme », tab « Vue d'ensemble » sélectionné, indicateurs, link « Ouvrir le studio » → `/admin/studio` (retour).
4. Tab « Boutiques » → `?onglet=boutiques` ; searchbox « Nom, ville ou propriétaire » = `TEST-E2E` → la boutique de test ; radio « Suspendues » → vide « Aucune boutique ne correspond » ; « Toutes ».
5. « Suspendre la boutique » (boutique de test uniquement) → dialog « Suspendre « TEST-E2E… » ? » → « Annuler » (pastille « Active ») → confirmer → toast « « TEST-E2E… » est suspendue », pastille « Suspendue » ; contexte propriétaire de test : prochain appel → 403 `BOUTIQUE_SUSPENDUE` / sessions révoquées (redirection connexion ; message « Cette boutique est suspendue. Contactez l'équipe SatsPoint. ») ; « Réactiver la boutique » → toast « … est réactivée ».
6. Tab « Santé » : 7 lignes, « Actualiser » → `GET /admin/sante` 200 ; tab « Journal » : combobox « Type d'action » « Boutiques » → `action=boutique.` → entrées « Boutique suspendue » / « Boutique réactivée » ; dates « Du »/« Au ».
7. Navigation super-admin : menu « Console », « Studio audio » seulement ; `/caisse` → `/admin` ; « Mon compte » nom « … Administration ».
8. `/securite/2fa` : « Obligatoire pour la console plateforme. » (ne pas désactiver sur le compte réel).
4xx tolérés : 422 2FA.

### 16-studio-audio-enregistrement-publication
Rôle : super-admin (2FA validée). Chromium lancé avec `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, permission `microphone`. Fichier de test court (≤ 2 s) `fixtures/bip.webm|mp3`.
1. `/admin/studio-audio` → `/admin/studio` ; h1 « Studio audio », radiogroup « Langue de travail » ; radio « Wolof » (→ `satspoint.studio.langue=wo`).
2. searchbox « Chercher une clé ou un texte » = « Encaisser » → lignes filtrées ; combobox « Écran » « Caisse » ; « Manquants seulement » `aria-pressed=true` ; « Mode rafale » off (`satspoint.studio.rafale=0`) ; « Effacer les filtres » si vide.
3. Case « Wolof — « … » : Manquant » → panneau « Enregistrement », pastille « Manquant ».
4. Refus client : `setInputFiles` `.txt` → « Format non pris en charge : mp3, wav, m4a, ogg ou webm. ».
5. Dépôt du fichier court → `POST /api/v1/admin/audio` 201 → toast « Enregistrement envoyé » → case « En traitement » puis « Brouillon » (relecture 3 s, file `audio`) ; « Écouter le brouillon » → lecture.
6. Micro : « Enregistrer » → décompte `[data-decompte]` → « Arrêter » → « Réécouter », « Refaire », « Valider » ; « Refaire » revient à « Enregistrer ».
7. Nettoyage : « Supprimer le brouillon » → `DELETE /admin/audio/{id}` 204, toast « Brouillon supprimé », case « Manquant ».
8. Publication : seulement sur base de test, sur une clé/langue convenue (aucun retour arrière par l'interface) : « Publier » → toast « Audio publié : disponible chez tout le monde » → `GET /api/v1/audio/manifeste/wo` contient la clé ; dans un autre contexte le haut-parleur apparaît (signal `audios`). Bouton de lot « Publier N brouillons en Wolof » désactivé à 0.
9. Raccourcis (bureau) : Espace démarre le décompte, → change de case, P publie (sans effet hors brouillon).

### 17-recu-public
Rôles : propriétaire (prépare), visiteur (lit).
1. Boutique de test : « Message sur le reçu » = `TEST-E2E merci` ; vente 1 500 FCFA simulée ; `GET /ventes/{ulid}` → `recu_url`.
2. Contexte anonyme sans `localStorage` : `goto(recu_url)` → **pas** de redirection vers `/langue` ; `[data-ecran="recu"]`, nom de boutique, « 1 500 FCFA », « soit N sats », « Payée », « N° de vente » `V-…`, « Date » `JJ/MM/AAAA HH:MM`, « Boutique » `TEST-E2E… · Dakar`, « Moyen de paiement » « Bitcoin », « TEST-E2E merci », « Reçu généré par SatsPoint » ; aucune donnée personnelle (pas de nom de caissier ni téléphone).
3. « Imprimer » → `window.print` appelé (espion via `addInitScript`) ; combobox « Langue de l'interface » « English » → libellés anglais.
4. Jeton inconnu (48 alnum) → `GET /r/…` 404 (toléré) → h2 « Ce reçu est introuvable » + texte ; jeton court `abc` → même écran.
5. Vente non payée : pas de `recu_url` ; le bouton « Envoyer le reçu » n'existe qu'au succès.

### 18-temps-reel-deux-navigateurs (annexe A.2, 6 tests)
Deux contextes : **A** = propriétaire, **B** = caissier (ou gérant) **de la même boutique de test** (un même utilisateur dans deux navigateurs ne reçoit pas ses propres signaux : `useDonneesEnDirect.ts:76-78`). Attendre l'abonnement Reverb de B (`page.on('websocket')`, trame `pusher_internal:subscription_succeeded` sur `private-boutique.<ulid>`). Compter les requêtes de B par motif.
1. **A modifie, B voit, un seul rechargement** : B sur `/articles` ; A crée un article par l'API (`couleur` hex) → la ligne apparaît chez B en ≤ 2 s ; exactement **1** `GET /api/v1/articles` chez B après le signal (regroupement 800 ms) ; même chose avec 3 créations rapprochées → 1 seul GET.
2. **A ne se recharge pas lui-même** : A sur `/articles` crée l'article par `page.request` (même utilisateur) → 0 `GET /articles` déclenché par le signal chez A (seule l'invalidation locale de l'interface compte si création par l'UI).
3. **Pas de boucle** : B sur `/equipe` (aucune minuterie sur cet écran) : 12 s sans modification → 0 requête `/api/v1/*` ; A fait des lectures (`GET /ventes`) → toujours 0 chez B. (Éviter `/caisse` : cours toutes les 60 s ; paiement : 3 s ; santé admin : 30 s.)
4. **Fenêtre ouverte conservée** : B sur `/ventes`, détail d'une vente en attente ouvert ; A l'annule par l'API → chez B, la fenêtre « Détail de la vente · V-… » reste ouverte et la pastille passe à « Annulée » en ≤ 2 s (filtres et recherche conservés).
5. **Onglet caché** : B sur `/articles` ; forcer `document.visibilityState='hidden'` (`Object.defineProperty` + `dispatchEvent(new Event('visibilitychange'))`) ; A crée un article → 0 GET chez B ; repasser `visible` → 1 GET, ligne affichée.
6. **Tour des écrans** : B parcourt `/caisse`, `/ventes`, `/tableau-de-bord`, `/articles`, `/securite/2fa` pendant que A écrit (article, vente, annulation) à intervalles → 0 `pageerror`, 0 `console.error`.
Rubriques par écran : caisse `parametres,articles,wallet` · paiement `paiements,ventes` · ventes/tableau `ventes,paiements` · portefeuille `wallet,parametres` · réglages `parametres` · démarrage `parametres,wallet` · équipe `equipe` · articles `articles` (import : `imports`) · console `boutiques,audio,audios,journal` · studio `audio,audios`.
Écart connu à faire apparaître : `/reglages` et `/demarrage` ne se rechargent jamais (§ 5) — test 1 rejoué sur `/reglages` (A renomme la boutique) → attendu KO.

### 19-tous-les-boutons
Pour chaque écran du § 2, inventaire `getByRole('button'|'link'|'tab'|'menuitem'|'radio'|'switch'|'combobox')` (exclure `[data-haut-parleur]`, testés en 14) et un effet constaté par élément selon les tableaux « Actions » : navigation (`toHaveURL`), fenêtre (`getByRole('dialog', { name })`), toast (texte exact), appel réseau (`waitForResponse` méthode + chemin + statut), téléchargement (`waitForEvent('download')`), état (`aria-pressed`, `aria-checked`, `aria-selected`, `aria-expanded`).
- Destructeurs (« Annuler la vente », « Supprimer », « Retirer de l'équipe », « Désactiver », « Révoquer », « Supprimer les clés », « Suspendre la boutique », « Supprimer le brouillon ») : uniquement sur données `TEST-E2E`, confirmation testée dans les deux sens (« Annuler »/« Garder la vente » ne change rien, confirmer change).
- Désactivés attendus (avec raison) : « Encaisser » (montant 0 / hors bornes) ; tab « Bitcoin » (sans portefeuille) ; option « Bitcoin … » (raison affichée) ; « Changer le mot de passe » (lien invalide) ; « Lancer le paiement test » (aucun moyen) ; « Recevoir »/« Envoyer » (non connecté) ; « Confirmer l'envoi » (mot de passe vide) ; « Continuer » de l'import (colonnes obligatoires) ; « Enregistrer » de « Changer le rôle » (rôle inchangé) ; « Terminer » des codes de secours (case non cochée) ; « Activer » 2FA (avant initialisation) ; « Envoyer le reçu » (reçu en préparation) ; « Monter » (1re ligne), « Descendre » (dernière) ; switch « Mobile money (PayTech) » (non configuré) ; « Publier les brouillons » (0 brouillon). Tout autre bouton désactivé = défaut.
- Boutons sans effet visible à signaler s'ils le restent : « Annuler l'invitation » (aucune confirmation ni toast), « Changer le rôle »/« Réactiver » (aucun toast), « Partager » (absent sans Web Share).
- Tableau de résultats (bouton, effet attendu, effet constaté, OK/KO) dans `RAPPORT.md`.

### 20-securite-acces-directs
1. Anonyme : chaque route privée (`/caisse`, `/caisse/paiement/<ulid>`, `/ventes?vente=x`, `/tableau-de-bord`, `/articles`, `/demarrage`, `/portefeuille`, `/equipe`, `/reglages`, `/securite/2fa`, `/verification-2fa`, `/admin`, `/admin/studio`) → `/connexion?suite=<chemin encodé>` ; après connexion propriétaire, retour exact sur `suite` (ou toast + `/caisse` pour `/admin`).
2. Redirection ouverte : `/connexion?suite=//evil.example` et `?suite=https://evil.example` et `?suite=/\evil` → après connexion `cheminAccueil`, jamais un autre hôte.
3. Rôles : matrice § 3 (caissier → parcours 10 ; propriétaire `/admin` → toast + `/caisse` ; super-admin `/caisse`, `/ventes` → `/admin`).
4. Inter-boutiques : propriétaire de test → `GET /api/v1/ventes/<ulid d'une vente démo>` 404 ; `/caisse/paiement/<ulid démo>` → « Cette demande de paiement est introuvable. » ; `PATCH /api/v1/admin/boutiques/<ulid>` → 403 ; `GET /api/v1/admin/journal` → 403.
5. API anonyme : `GET /api/v1/moi` 401 (toléré), `GET /api/v1/ventes` 401, `GET /api/v1/cours` 401 ; mutation sans `X-XSRF-TOKEN` → 419.
6. Session révoquée (membre désactivé, parcours 09) → 401 → `/connexion?suite=…`.
7. Reçu/invitation : jetons inventés → écrans « introuvable », aucune fuite (pas de message technique).
8. En-têtes : réponses `/api/v1/config` et page HTML portent les en-têtes de sécurité (`EnTetesSecurite`) — vérifier `X-Content-Type-Options`, `X-Frame-Options`/CSP.

### 21-lightning-reel-non-destructif
Rôle : propriétaire **démo** (`demo@satspoint.local`, vrai portefeuille). Interdits : « Simuler », « Envoyer », « Révoquer », PayTech, Wave confirmé, tout paiement réel.
1. `/caisse` : « Note » = `TEST-E2E-<date>-lightning-reel` ; « Touche 1 », « Touche 0 », « Touche 0 » → « 100 FCFA » ; « Encaisser » (si fenêtre : option « Bitcoin ≈ N sats »).
2. `/caisse/paiement/<ulid>` : `GET /api/v1/paiements/<ulid>` → `paiement.methode='lightning'`, `simule=false`, `bolt11` commence par `lnbc` **et pas** `lnbcrt` ; img QR `[data-qr="pret"]` ; **aucun** bouton « Simuler le paiement » ; bandeau démo absent.
3. « Vérifier le paiement » → toast « Vérifié : toujours en attente du paiement. ».
4. « Annuler la vente » (icône) → « Annuler la vente » → `POST /ventes/<ulid>/annuler` 200 → « Paiement annulé ». `GET /ventes/<ulid>` → `statut='annulee'`.
5. Capture du QR (preuve) puis fin. La vente annulée reste dans l'historique démo (identifiable par la note).

### 23-pays-langues-moyens (CONTRAT_API § 14)
Rôles : super-admin **de test** (2FA validée par l'API) + propriétaire d'une boutique de test (portefeuille simulé).
1. `/admin?onglet=langues` : « Ajouter une langue » → code `zq…`, noms `TEST-E2E Langue`, pays Togo → `POST /admin/langues` 201, toast « Langue ajoutée », ligne visible ; la matrice du studio contient la colonne et la clé `langue.{code}` ; « Supprimer la langue » → `DELETE` 204 (aucun audio).
2. Onglet « Moyens de paiement » : pays Togo (Mixx by Yas, Flooz visibles) → « Ajouter un moyen » `TEST-E2E-<date> Moyen` (numéro marchand, vert) → `POST /admin/moyens-paiement` 201.
3. `/reglages` (propriétaire) : « Pays de la boutique » = Togo (aide « Changer de pays désactive… ») → `PATCH /boutique` 200 `pays='TG'` ; carte « Moyens de paiement du pays » : interrupteur du moyen → champ « Numéro marchand » `+228 90 11 22 33` → `PUT /boutique/moyens-pays/{ulid}` 200 (`valeur` normalisée `+22890112233`).
4. Anti-IDOR : `PUT /boutique/moyens-pays/{ulid d'un moyen ivoirien}` → 404.
5. `/caisse` : 1 500 FCFA → « Encaisser » → option du moyen → `POST /ventes` 201 (`methode='moyen_pays'`, photographie `moyen`, `expire_le=null`) ; écran de paiement : numéro en grand `+228 90 11 22 33`, « En attente de confirmation » ; « Confirmer la réception » (texte du moyen) → 200 → « par TEST-E2E-… Moyen ».
6. `DELETE /admin/moyens-paiement/{ulid}` → 409 `MOYEN_UTILISE`. Nettoyage : `e2e:nettoyer` (moyen et boutique `TEST-E2E-`).
7. `/langue` (visiteur) : « Votre pays » = SN, 6 tuiles ; Niger → 2 tuiles (Français, English) ; retour SN → 6 ; `GET /config` expose les 8 pays et les 5 langues de départ.
Non couvert par 19-tous-les-boutons : les interrupteurs des catalogues réels (désactiver le wolof sur la base de test) — seules des données `TEST-E2E` sont modifiées ici.

---

## 5. Écarts et points d'attention relevés à la lecture du code

> **État après l'étape d'intégration (8 novembre)** — corrigés et vérifiés par les tests : 1 (`POST /boutique` → `{ boutique, utilisateur }`), 2 (couleurs `#RRGGBB`), 3 et 14 (URL de recherche), 4 (formulaires : saisie en cours seulement s'ils sont modifiés), 5 (message « Téléphone ou mot de passe incorrect. »), 6 (lien d'invitation affiché, copiable, WhatsApp), 7 (fixtures réécrites), 8 à 11 (codes `DERNIER_PROPRIETAIRE`, `DEJA_DANS_EQUIPE`, `DEJA_MEMBRE`, `INVITATION_EXPIREE`, `MOT_DE_PASSE_INCORRECT`), 12 (« Au moins un moyen de paiement doit rester actif. »), 13 (erreur de création visible sur le chemin direct), 16 (garde de rôle sur `/demarrage`), 19 et 20 (libellés du journal, noms de langues traduits), 26 (proxy `^/r/`). Les autres points restent décrits dans `RAPPORT.md`. Le texte ci-dessous est la lecture du code **avant** corrections.

### Bloquants / graves
1. **Création de boutique depuis le démarrage guidé → session effacée côté client.** `web/src/ecrans/Demarrage.tsx:173` fait `appliquerUtilisateur(utilisateur)` avec `utilisateur` lu dans la réponse de `POST /boutique`, mais `api/app/Http/Controllers/Api/V1/BoutiqueController.php:55` renvoie `BoutiqueResource` seule (`{ boutique }`, `$wrap='boutique'`), contrairement au contrat (`docs/CONTRAT_API.md:145` : `201 { boutique, utilisateur }`). `useAuth.definir(undefined)` → statut « anonyme » → `RequiertSession` renvoie vers `/connexion?suite=%2Fdemarrage`.
2. **Articles : couleur refusée à chaque enregistrement.** Le front envoie des noms (`orange`, `vert`…, `web/src/lib/couleursArticles.ts:2`, `ecrans/Articles.tsx:255`) ; le serveur exige `#RRGGBB` (`api/app/Http/Requests/Articles/ArticleRequest.php:30`, contrat `CONTRAT_API.md:154`). Création et modification → 422. Les couleurs seedées (`DemoSeeder.php:172-176`, hexadécimales) s'affichent en gris et l'img de couleur s'appelle « Couleur ». L'import est incohérent aussi : l'aperçu n'accepte que les noms (`ecrans/articles/correspondance.ts:150-156`), le serveur que l'hexadécimal (`api/app/Services/Import/ImportArticles.php:280-286`).
3. **Recherche globale : les ventes mènent à une page introuvable.** `api/app/Services/RechercheGlobale.php:103` produit `/ventes/<ulid>` ; aucune route front `/ventes/:ulid` (`web/src/routes/index.tsx`) ; l'écran attend `/ventes?vente=<ulid>` (`ecrans/Ventes.tsx:43-53`).
4. **Temps réel bloqué en permanence sur `/reglages`, `/demarrage` et `/portefeuille` (propriétaire non connecté).** `useSaisieEnCours()` est appelé sans condition par des formulaires toujours montés : `ecrans/reglages/FormulaireBoutique.tsx:21`, `FormulairePaiements.tsx:26`, `FormulairePaytech.tsx:25`, `ecrans/portefeuille/ConnexionWallet.tsx:37`, `ecrans/Demarrage.tsx:164,211`. Le compteur global > 0 fait que `useDonneesEnDirect` reporte indéfiniment (`temps-reel/useDonneesEnDirect.ts:47-50`) : la rubrique `parametres` n'est jamais rechargée sur ces écrans (exigence A.2 « sur tous les écrans »).
5. **Message de connexion erroné.** Mauvais identifiants → `401 IDENTIFIANTS_INCORRECTS` (`AuthController.php:90`) ; `useMessageErreur` ne traite `identifiants:true` que pour les 422 et rend « Votre session a expiré. Reconnectez-vous. » sur 401 (`ecrans/auth/useMessageErreur.ts:30,33`). Attendu : « Téléphone ou mot de passe incorrect. »
6. **Invitation par téléphone : le lien n'est jamais montré.** Le serveur renvoie `invitation.lien` (pas d'envoi SMS, `InvitationController.php:69-76`, `InvitationResource.php`) ; l'interface n'affiche qu'un toast (`ecrans/Equipe.tsx:259-264`). Le responsable ne peut pas transmettre l'invitation.
7. **Fixtures Playwright inutilisables en l'état** (`tests/e2e/fixtures.ts`) : `:76` va sur `/connexion` sans `satspoint.langue-choisie` → redirection `/langue` ; `:78` `getByLabel(/mot de passe/i)` attrape aussi le bouton « Afficher le mot de passe » (violation du mode strict) ; `:79` `/se connecter/i` ne correspond pas au bouton « Me connecter » ; `:19` adresse personnelle en dur ; pas de `storageState` (limite 5 connexions/min/identifiant) ; super-admin : arrivée sur `/verification-2fa` sans secret TOTP disponible.

### Codes d'erreur front ↔ back
8. Dernier propriétaire : `ConflictHttpException` 409 (`EquipeController.php:71,106`) au lieu de `422 DERNIER_PROPRIETAIRE` (`CONTRAT_API.md:184`) → message « Ces données ont changé entre-temps. L'écran a été actualisé. » au lieu de « La boutique doit garder au moins un propriétaire. ».
9. Invitation d'un membre déjà actif : 409 générique (`InvitationController.php:50`) → même message « conflit » trompeur.
10. Acceptation par un compte déjà membre ailleurs : 409 (`InvitationController.php:165`) alors que le front attend `DEJA_MEMBRE` (`ecrans/Invitation.tsx:41`, contrat `CONTRAT_API.md:261` « 422 DEJA_MEMBRE ») → « Votre compte fait déjà partie d'une boutique… » jamais affiché. Invitation périmée à l'acceptation : `GoneHttpException` 410 sans code (`InvitationController.php:149`) → « Un problème est survenu… ». Mauvais contact → 403 → « Cette page est réservée au propriétaire de la boutique. » (inadapté).
11. Envoi de sats, mauvais mot de passe : 422 `VALIDATION` + `errors.password` (`WalletController.php:82`) ; `Envoyer.tsx:234` attend `MOT_DE_PASSE_INCORRECT` (listé au contrat `CONTRAT_API.md:183`) → affiche « Certaines informations sont invalides. » sans bouton « Réessayer » ; la clé `portefeuille.motDePasseIncorrect` n'est jamais utilisée.
12. Réglages, tous les moyens désactivés : l'erreur `reglages.moyens` (`BoutiqueController.php:93`) n'est mappée à aucun champ (`FormulairePaiements.tsx:50-56`) → message générique au lieu de « Au moins un moyen de paiement doit rester actif. ».

### Écrans / navigation
13. Caisse, chemin direct (un seul moyen) : l'erreur de création (`COURS_INDISPONIBLE`, `WALLET_INJOIGNABLE`…) est stockée (`ecrans/Caisse.tsx:97`) mais affichée seulement dans la fenêtre de choix (`:279`), qui n'est pas ouverte dans ce cas (`:132`) → clic « Encaisser » sans retour visible.
14. Pages de recherche sans destination : `/ventes?exporter=1` (`coquille/recherche/resultats.ts:24`) non géré par `Ventes.tsx` ; `/reglages#wallet` et `/reglages#theme` (`api/config/satspoint.php:181-182`) : ancres inexistantes (ids réels `boutique`, `paytech`, `paiements`, `preferences`, `Reglages.tsx:44-55`) ; `/equipe?membre=` (`RechercheGlobale.php:162`) ignoré par `Equipe.tsx`.
15. Page « Encaisser un client » : parent `recherche.aide` = la phrase d'aide entière (`resultats.ts:37`) au lieu de `recherche.aideRubrique` (« Aide »), titre affiché « Tapez au moins 2 lettres… › Encaisser un client ».
16. `/demarrage` sans garde de rôle (`routes/index.tsx:67`) : gérant et caissier y voient des formulaires portefeuille/PayTech que le serveur refuse (403), et l'étape 2 réaffiche le formulaire même quand le portefeuille est déjà connecté (`Demarrage.tsx:109`).
17. Toast de refus unique « Cette page est réservée au propriétaire de la boutique. » (`routes/gardes.tsx:53`) aussi pour `/admin` (refusé au propriétaire lui-même) et pour des pages ouvertes au gérant.
18. Console : rubriques `boutiques` et `journal` écoutées (`ecrans/admin/Console.tsx:25`) mais jamais émises (`api/config/satspoint.php:113-128` : `boutiques` → `parametres` sur le canal boutique) → la console ne se met pas à jour seule.
19. Journal : libellés i18n qui ne correspondent pas aux actions serveur — `auth_echec_connexion` vs `auth.echec`, `equipe_invitation` vs `equipe.invitation_creee`, `vente_confirmee_manuellement` vs `paiement.confirme_manuellement` (`web/src/i18n/admin.fr.json:109,122,123`) → code brut affiché ; la famille « Ventes » (`vente.`) n'inclut pas `paiement.*` (`console/Journal.tsx` `FAMILLES`).
20. Noms de langues en dur « Sérère », « Diola » (`ecrans/admin/console/VueEnsemble.tsx:12`) alors que l'interface dit « Seereer », « Joola » (texte non traduit, contraire à DIRECTIVES § 1.3).
21. Détail de vente ouvert depuis le tableau de bord : seul `CLE_TABLEAU` est invalidé (`TableauDeBord.tsx:52`) → la fenêtre ne se met pas à jour en direct (contrairement à `/ventes`).
22. PayTech supprimé : toast « Supprimer les clés » (libellé d'action, pas une confirmation) (`FormulairePaytech.tsx:57`). Équipe : aucune confirmation ni toast pour « Annuler l'invitation », « Changer le rôle », « Réactiver ».

### Accessibilité (impacte les sélecteurs)
23. Haut-parleur `span role="button"` **imbriqué** dans des `<button>`/`<a>`/tabs/radios (`composants/Bouton.tsx:131,152`, `BoutonIcone.tsx:72`, `Onglets.tsx:244`, `Segment.tsx:762`, `studio/PanneauEnregistrement`, `StudioAudio.tsx` `Puce`) : contenu interactif imbriqué (axe `nested-interactive`) et nom accessible suffixé « Écouter » quand l'aide vocale est active. Tous les haut-parleurs portent le même nom « Écouter ».
24. Barre latérale repliée : liens sans nom accessible (texte retiré, icône `aria-hidden`, infobulle seulement au survol) (`coquille/BarreLaterale.tsx:58`).
25. `aria-label` sur des éléments génériques : montant de la caisse `<p aria-label="Montant en FCFA">` (`Caisse.tsx:207`), quantité du panier `<span aria-label="Quantité">` (`caisse/Articles.tsx:52`), étapes d'import `<span aria-label>` (`ImportArticles.tsx` `Etapes`). Listbox de recherche contenant des sections et un bouton (`PanneauRecherche.tsx`). Fenêtre de recherche sans bouton de fermeture visible sur bureau.

### Environnement de test
26. Proxy Vite `'/r'` (`web/vite.config.ts:95`) : préfixe sans barre → capte aussi `/reglages`, `/robots.txt`… pour toute requête non HTML (envoyée à l'API).
27. Aucune route de suppression de boutique ni de compte, ventes non supprimables : le nettoyage `TEST-E2E-` exige une purge SQL hors application (décision à prendre). Studio : un audio publié ne peut pas être supprimé par l'interface (`PanneauEnregistrement` : suppression limitée à brouillon/erreur).
28. Limites : 10 inscriptions/h/IP, 5 connexions/min/identifiant, 5 appels 2FA/min (l'initialisation 2FA part deux fois en StrictMode dev, `DeuxFacteurs.tsx:57-60`), 6 exports/min — à prendre en compte dans l'ordonnancement (une seule exécution `workers: 1` déjà configurée).
29. Mode démo : le bandeau dépend de l'ensemble des portefeuilles (`ConfigController.php:39-60`) ; brancher un `mock://` pour les tests ne le fait pas réapparaître si la démo est réelle — ne pas l'asserter.
30. Mots de passe soumis à HIBP (`AppServiceProvider.php:71`) ; e-mails réels possibles pour « mot de passe oublié » et invitations par e-mail → n'utiliser que des téléphones `+22177…` dans les tests.
