# Passage du 13 au 18 novembre 2026 (nouvelle interface « Lumière », voix partout, articles sans écrire)

Front Vite **sans mock** (port 5190) branché sur la vraie pile Docker. Suite complète : **mobile 30 réussis / 5 échecs, bureau 27 réussis / 9 échecs** au premier passage ; chaque échec a été analysé, les défauts de l'application corrigés, les tests périmés alignés sur la nouvelle interface.

## Défauts de l'application trouvés par les tests (corrigés)

| # | Défaut | Correction |
|---|---|---|
| 1 | Haut-parleur placé dans un bouton annoncé comme « bouton dans un bouton » aux lecteurs d'écran (axe `nested-interactive`) | Dans un bouton, le haut-parleur est un repère visuel `aria-hidden` (le bouton est déjà lu) |
| 2 | Noms accessibles différents du texte visible (FR/EN, « 🔊 WO », « Mon compte », logo, lignes de vente, cases du studio — WCAG 2.5.3) | Le nom commence par le texte visible, ou le contenu sert de nom |
| 3 | Barre de progression du démarrage sans nom | `aria-label` « 2 / 4 étapes » |
| 4 | Montant de la caisse lu « 1 500FCFA » (pas d'espace réel) | Espace dans le texte |
| 5 | Élément atteint au clavier caché sous l'en-tête collant ou la barre du bas (WCAG 2.4.11) | `scroll-padding` sur la coquille |
| 6 | Tuile « Wolof » : pendant le chargement, le haut-parleur jouait la version française | Repli français seulement une fois la langue demandée chargée |
| 7 | Studio : un fichier déjà coupé net (sans aucun blanc) refusé « aucune voix entendue » | Signal fort sans creux = voix entière, rien n'est coupé |
| 8 | Réglages et démarrage : débordement horizontal à 390 px | Grille bornée, sélecteur de thème empilé sur mobile |

## Tests mis à jour (comportement voulu, test périmé)
Première visite (panneau de langue sur « / »), champ « Nom écrit » des articles, étape « Valider » du studio après la coupe des blancs, bande d'articles sur la caisse mobile, nom des lignes de vente (contenu), champs `lignes` et `moyen` du reçu public (sans donnée personnelle), navigation du super-admin qui peut créer sa boutique, haut-parleur toujours présent (repli français ou voix du navigateur).

## Reste connu
- **19 · Tous les boutons** : l'inventaire générique clique tout dans l'ordre du document ; quelques éléments signalés « sans effet » fonctionnent quand on les teste seuls (vérifié un par un : feuille vocale, « Continuer le démarrage », copie de la clé, ligne de vente, dépôt au studio sur bureau → `202`). Écart dû à l'état laissé par le clic précédent ; pavé exclu (testé dans 03).
- **11 · PayTech** et **21 · Lightning réel** dépendent de services extérieurs (bac à sable PayTech, portefeuille Coinos) : échecs de délai, sans défaut de l'application identifié.
- **22 (b) performance** : mesurée sur le build de production uniquement (sautée sur le serveur de développement).

---

# RAPPORT — tests de bout en bout SatsPoint (8 novembre 2026)

> Méthode : DIRECTIVES § 4 et annexe A.3. Carte : [`PARCOURS.md`](PARCOURS.md). Front Vite **sans mock** branché sur le vrai back (API :8120, Reverb :8125, file, planificateur, passerelle Lightning). Chromium sans fenêtre, `retries: 1`, traces conservées en cas d'échec, deux tailles : bureau 1366×768 et téléphone 390×844.
>
> **Environnement** : le port 5190 était déjà occupé par un Vite en mode **mock** lancé à 12:13 par un autre processus (non arrêté, règle « jamais un processus qu'on n'a pas lancé »). Les tests ont tourné sur un Vite identique au port **5191** (configuration temporaire `web/vite.e2e.tmp.config.ts` qui ne change que le port et réécrit `Origin`/`Referer` du proxy vers `http://localhost:5190`, l'origine déclarée à Sanctum ; supprimée à la fin). La performance a été mesurée sur le **build de production** (`vite preview`, port 5192).

<!-- RESUME -->

## 1. Corrections d'intégration front ↔ back (étape 1)

| # | Écart constaté | Gravité | Correction | Côté |
|---|---|---|---|---|
| 1 | Manifeste audio appelé sur `/audio/manifeste/{langue}` (404) : aucun haut-parleur ne pouvait jamais apparaître | Bloquant (aide vocale) | `GET /api/v1/audio/manifeste/{langue}` ; règle de cache du service worker déplacée avant la règle `/api/` | web (`api/audio.ts`, `mock.ts`, `vite.config.ts`) |
| 2 | `POST /boutique` renvoyait `{ boutique }` seul ; le front attend `{ boutique, utilisateur }` → **session effacée côté client après la création de la boutique**, renvoi vers la connexion | Bloquant (démarrage) | Réponse conforme au contrat `{ boutique, utilisateur }` + test Pest | api (`BoutiqueController`) |
| 3 | Couleurs d'articles envoyées par nom (`vert`) alors que le serveur exige `#RRGGBB` → **toute création / modification d'article refusée (422)** ; couleurs du serveur affichées en gris | Bloquant (articles) | Palette ↔ `#RRGGBB` (valeur de référence par teinte, rattachement à la teinte la plus proche) ; aperçu d'import aligné sur la règle serveur | web (`lib/couleursArticles.ts`, `Articles.tsx`, `correspondance.ts`) |
| 4 | Formulaires toujours montés (réglages, démarrage, connexion du portefeuille, 2FA) déclarant une « saisie en cours » permanente → **le temps réel ne rechargeait jamais ces écrans** | Grave (exigence A.2) | Saisie en cours seulement si le formulaire est modifié | web (7 formulaires) |
| 5 | Changer d'onglet Bitcoin ↔ Mobile money créait **deux tentatives** (deux factures) : l'onglet Radix signale au `mousedown` puis au `focus` | Grave (paiement) | Verrou synchrone sur la création de tentative | web (`paiement/Paiement.tsx`) |
| 6 | « Encaisser » cliquable avant le chargement de la boutique et du cours → un clic rapide partait sur le seul moyen connu (Wave au lieu du choix) ou annonçait « aucun moyen actif » | Grave (caisse) | Bouton en chargement tant que boutique et cours ne sont pas connus | web (`Caisse.tsx`) |
| 7 | Garde « invité » : après connexion / inscription, la garde redirigeait avant l'écran → `?suite=` ignoré (lien d'invitation perdu), message de bienvenue jamais affiché | Grave (invitation) | La garde honore `?suite=` (chemin interne) et la 2FA ; message d'inscription émis avant l'application de la session | web (`routes/gardes.tsx`, `auth/useMoi.ts`) |
| 8 | Déconnexion → `/connexion?suite=<page quittée>` au lieu de l'accueil (session effacée avant la navigation, 401 des requêtes en vol) | Moyen | Destination de déconnexion lue par la garde de session ; 401 ignorés pendant la déconnexion volontaire | web (`auth/store.ts`, `auth/useMoi.ts`, `gardes.tsx`) |
| 9 | 2FA : deux initialisations concurrentes (double montage) → le secret affiché n'était plus celui du serveur → **tous les codes refusés** | Grave (console) | Une seule initialisation par écran | web (`securite/DeuxFacteurs.tsx`) |
| 10 | Choix de la langue sur `/langue` avant l'arrivée de `/moi` : non enregistré puis écrasé ; « English » refusé par le serveur (`langue_audio: null` → 422) | Moyen | `/langue` attend la session ; `langue_audio` nullable côté serveur + test Pest | web (`Langue.tsx`) + api (`PreferencesRequest`) |
| 11 | Mauvais identifiants (401) → « Votre session a expiré » | Moyen | « Téléphone ou mot de passe incorrect. » | web (`useMessageErreur.ts`) |
| 12 | Codes d'erreur absents : dernier propriétaire (409 générique), membre déjà présent, compte déjà membre ailleurs, invitation périmée à l'acceptation, mot de passe incorrect à l'envoi de sats | Moyen | `DERNIER_PROPRIETAIRE` 422, `DEJA_DANS_EQUIPE` 409, `DEJA_MEMBRE` 422, `INVITATION_EXPIREE` 410, `MOT_DE_PASSE_INCORRECT` 422 + messages front + tests Pest | api + web |
| 13 | Invitation par téléphone : le lien (aucun SMS envoyé) n'était affiché nulle part → impossible d'inviter par téléphone | Grave (équipe) | Fenêtre « Invitation créée » : lien, « Copier le lien », « Envoyer par WhatsApp » (clés i18n FR/EN + clés vocales) | web (`Equipe.tsx`) |
| 14 | Recherche : ventes → `/ventes/<ulid>` (page introuvable), « Thème » → `#theme`, « Connexion du portefeuille » → `/reglages#wallet` (ancres inexistantes), démarrage proposé au gérant | Moyen | `/ventes?vente=`, `/reglages#preferences`, `/portefeuille`, `/equipe` ; démarrage réservé au propriétaire + tests Pest | api (`RechercheGlobale`, `config/satspoint.php`) |
| 15 | `/demarrage` sans garde de rôle (caissier et gérant y voyaient les formulaires portefeuille / PayTech refusés par le serveur) | Moyen | Garde : sans boutique ou propriétaire | web (`gardes.tsx`, `routes/index.tsx`) |
| 16 | Révocation du portefeuille → 2 × `409 GET /wallet/transactions` (historique relu sans portefeuille) | Faible | Historique retiré du cache, relu seulement si connecté | web (`ConnexionWallet.tsx`, `Portefeuille.tsx`) |
| 17 | Caissier : `POST /wallet/envoyer/apercu` avec un corps invalide → 422 (validation avant le contrôle du rôle) | Faible (règle 1) | Droit vérifié dans `authorize()` des requêtes portefeuille (403 d'abord) + test Pest | api (`EnvoyerRequest`, `RecevoirRequest`) |
| 18 | Réglages : couper tous les moyens → message générique ; chemin d'encaissement direct : erreur invisible | Faible | « Au moins un moyen de paiement doit rester actif. » (client + serveur) ; toast d'erreur sur le chemin direct | web |
| 19 | Journal : libellés ne correspondant pas aux actions serveur (`auth.echec`, `equipe.invitation_creee`, `paiement.confirme_manuellement`, `plateforme.boutique_*`) ; noms de langues en dur dans la console | Faible | Libellés alignés, familles « Paiements » et « Plateforme » ajoutées, noms traduits | web (`admin.*.json`, `Journal.tsx`, `VueEnsemble.tsx`) |
| 20 | Accessibilité : liens de la barre latérale repliée sans nom ; logo « Aller à l'accueil » dont le nom ne contient pas le texte visible (WCAG 2.5.3) | Moyen | `aria-label` quand repliée ; texte visible + destination en `sr-only` | web (`BarreLaterale.tsx`, `EnTete.tsx`, `MiseEnPageInvite.tsx`) |
| 21 | Proxy Vite `/r` captait aussi `/reglages`, `/robots.txt`… | Faible | Clé `^/r/` | web (`vite.config.ts`) |

Ajouts pour les tests (local uniquement) : `php artisan e2e:compte` et `php artisan e2e:nettoyer` (refusées hors `APP_ENV=local|testing`, tests Pest), documentées dans `api/README.md` et `CONTRAT_API.md` § V3.11.

Vérifications après corrections : **Pest** <!-- PEST --> ; **Vitest** 131 / 131 ; `tsc -b`, `oxlint`, registre des clés vocales à jour ; budget JavaScript du premier écran 169,1 Ko gzip (≤ 170 Ko).

<!-- SUITE -->
