# Directives permanentes — SatsPoint

> Ce fichier rassemble **toutes les consignes de la propriétaire du projet**.
> Il s'applique à **chaque ligne de code, chaque écran, chaque commit**.
> Toute personne (ou IA) qui travaille sur SatsPoint doit le lire avant de commencer,
> et le relire avant de livrer. En cas de doute entre aller vite et respecter ce fichier,
> **ce fichier gagne**.
>
> Les sections 1 à 7 sont la version **opérationnelle** (adaptée à SatsPoint).
> L'annexe A conserve les **textes d'origine, mot pour mot**, pour que rien ne se perde.

---

## 0. Esprit général

- L'objectif est une application **parfaite, professionnelle, orientée métier**, une « masterclass ».
- **Être intelligent à la place de la propriétaire** : quand une consigne est incomplète ou qu'un cas
  a été oublié, on s'inspire des meilleures applications du marché (Square, SumUp, Stripe Dashboard,
  Wave, Linear, Notion, Shopify POS…) et on applique la logique métier du commerçant.
  On ne demande pas la permission pour bien faire ; on signale ce qu'on a ajouté et pourquoi.
- **Clair, net et précis** dans chaque catégorie et chaque fonctionnalité.
- Les utilisateurs cibles incluent des commerçants **qui ne savent ni lire ni écrire** :
  chaque écran doit être compréhensible sans lire (icônes, couleurs, sons, aide vocale).

## 1. Exigences produit, UX et design

### 1.1 Ergonomie et rapidité
- Intuitive, facile, **très ergonomique, hyper fluide**. **Rapidité et performance d'abord.**
- Moderne dans l'écriture, le design, l'affichage et les icônes. Professionnel et orienté métier.
- Plateforme **interactive et très optimisée** : requêtes SQL optimisées (index, pas de N+1,
  pagination, sélection des seules colonnes utiles, cache là où c'est pertinent).

### 1.2 Mise en page
- Pages **pas surchargées**, bien rangées, bien placées.
- **Ne pas perdre d'espace** : pas d'énormes espaces entre les lignes ; densité confortable mais compacte.
- Les libellés longs d'actions (Supprimer, Modifier, Dupliquer…) deviennent des **icônes modernes**
  avec infobulle (et libellé accessible pour lecteurs d'écran + aide vocale).

### 1.3 Thèmes et langues
- **Thème clair et thème sombre** (et « automatique » selon le système).
- Interface **multilingue français / anglais** (aucun texte en dur dans le code).

### 1.4 Recherche globale intelligente
- Une **barre de recherche globale** qui cherche dans toutes les rubriques à la fois.
- Résultats **groupés par rubrique**, les plus pertinents en premier
  (exemple : je tape « chien » → `Animaux › chien`, `Zoo › chien` ; je choisis la rubrique).
- **Avant de taper** : affichage des **4 dernières recherches**.
- **Pendant la frappe** : résultats en direct (tolérance aux fautes et aux accents).
- Navigation au clavier, raccourci `Ctrl/⌘ + K`.

### 1.5 Import / export intelligents
- Imports CSV/Excel avec **écran de correspondance des colonnes** (colonnes du fichier ↔ champs
  de l'application), suggestions automatiques, aperçu, validation ligne par ligne, rapport d'erreurs.
- Exports CSV / Excel / PDF qui respectent les filtres en cours.

### 1.6 Aide vocale multilingue (exigence majeure)
- **Chaque bouton et chaque fonctionnalité** possède une petite **icône haut-parleur** dans un coin.
  Un clic → on **entend ce que fait le bouton** dans la langue choisie par la personne.
  Exemple : bouton « Encaisser » + haut-parleur → « Encaisser » dit en wolof.
- Langues audio : **wolof, sérère, pulaar, diola** (et français en option).
- **Le sélecteur de langue lui-même** a un haut-parleur à côté de chaque langue,
  pour qu'une personne qui ne lit pas puisse reconnaître sa langue.
- Les audios sont **enregistrés par la propriétaire** dans une **interface d'administration
  réservée à elle seule**, pour **tous les boutons et fonctionnalités existants**, dans toutes les langues.
  Une fois publiés, ils sont **disponibles chez tout le monde**.
- Détail technique : voir le cahier des charges, module « Aide vocale ».

### 1.7 Tests et audits permanents
- **Tout le temps** tester que l'application répond à la logique demandée :
  vérifier les affichages par rapport à ce qui est demandé, que tout marche, **tous les appels d'API**.
- **Audits réguliers**, surtout de **sécurité**. Application pensée pour être **mondiale** :
  niveau de sécurité maximal, **rien laissé au hasard**.

## 2. Sécurité (priorité absolue)

Raisonner **comme un attaquant**, pas seulement comme un développeur. Les 12 règles (texte complet en annexe A.1) :

| # | Règle | Application concrète dans SatsPoint |
|---|---|---|
| 1 | Authentification **et** autorisation | Policies Laravel sur chaque ressource ; rôle **et** appartenance à la boutique vérifiés à chaque action. |
| 2 | Ne jamais faire confiance à l'entrée | Form Requests pour toute entrée ; types, formats, longueurs, bornes ; rejet par défaut. |
| 3 | Bloquer les IDOR | Identifiants publics opaques (ULID) + vérification de propriété systématique ; test automatique d'IDOR sur chaque route. |
| 4 | Cloisonner les données | Scope global « boutique » sur tous les modèles métier ; requête impossible sans boutique courante. |
| 5 | Moindre privilège | Tout est refusé par défaut ; permissions NWC limitées ; budget de dépense. |
| 6 | Injections | Eloquent / requêtes paramétrées uniquement ; échappement HTML (React) ; aucun chemin de fichier fourni par l'utilisateur. |
| 7 | Ne rien divulguer | Erreurs génériques côté client ; détails dans les logs ; API Resources qui n'exposent que les champs utiles. |
| 8 | Secrets | `.env` jamais commité ; secrets NWC et clés PayTech **chiffrés en base** ; `.env.example` sans valeur réelle. |
| 9 | Limiter les abus | Rate limiting : connexion, mot de passe oublié, création de facture, IPN, recherche, upload audio. |
| 10 | Transport et en-têtes | HTTPS partout (HSTS), CORS sur liste explicite testée, CSP stricte, X-Frame-Options, nosniff, Referrer-Policy. |
| 11 | Traçabilité | Journal d'audit (qui, quoi, quand, IP) des actions sensibles ; jamais de secret en clair dans les logs. |
| 12 | Cohérence | Une protection existante sur une route similaire s'applique à l'identique à la nouvelle. |

**Avant chaque livraison** : relire le code et confirmer **point par point** que les 12 règles sont respectées,
signaler toute zone de doute, et prévenir si une faille est repérée dans du code existant.

## 3. Synchronisation temps réel (exigence de base)

Plusieurs personnes utilisent la même boutique en même temps (propriétaire, caissiers).
Quand l'une modifie quelque chose, **les autres le voient en 1 à 2 secondes, sans recharger**,
sur **tous les écrans**. Texte complet en annexe A.2. Adaptation SatsPoint :

- WebSocket via **Laravel Reverb** ; canaux privés **par boutique** (`boutique.{id}`), autorisés après vérification du jeton.
- Le signal **ne contient aucune donnée** : rubrique (`ventes`, `paiements`, `articles`, `equipe`, `parametres`, `wallet`), auteur, heure.
  Les écrans rechargent via l'API, avec ses contrôles d'accès.
- Envoi **uniquement si la requête a réellement écrit en base** (pas d'après la méthode HTTP), depuis **un seul middleware**.
  Écritures techniques (journaux, sessions, notifications) exclues. Upload réussi = écriture. Échec du signal ≠ échec de la requête.
- Côté écrans : **un seul hook** `useDonneesEnDirect(['rubrique'], recharger)` ; rechargement silencieux
  (filtres, page, recherche, fenêtres conservés) ; on ignore ses propres modifications ; regroupement ~800 ms ;
  onglet caché → attend la visibilité ; jamais pendant une saisie ; **une seule connexion** pour toute l'appli,
  jeton relu à chaque reconnexion, reconnexion automatique.
- Les événements dédiés (confirmation d'un paiement sur l'écran d'encaissement) suivent les mêmes règles :
  pas de donnée dans le signal, l'écran relit le statut via l'API.
- **6 tests Playwright obligatoires** à deux navigateurs (liste en annexe A.2).

## 4. Tests de bout en bout (Playwright)

Méthode complète en annexe A.3 : cartographie (`tests/e2e/PARCOURS.md`) **avant** d'écrire un test,
un fichier par parcours métier, données préfixées `TEST-E2E-<date>` et nettoyées, fixtures par rôle,
vraies assertions, zéro 4xx/5xx inattendu, zéro erreur console, test de **tous les boutons**,
captures 1366×768 **et 390×844** (SatsPoint est d'abord mobile), rapport `tests/e2e/RAPPORT.md`,
jamais de `waitForTimeout`, jamais la production.

## 5. Voix off des vidéos

Voix Azure masculine **`fr-FR-RemyMultilingualNeural`** (secours : `fr-FR-HenriNeural`), vitesse 1,0 (ou 0,95),
pas de voix clonée ni « émotionnelle », musique très basse ou absente. Texte écrit pour être dit :
une idée par phrase (15–25 mots), pas de sigles, mots anglais toujours au milieu d'une phrase française,
une phrase par bloc audio. Après génération : couper les silences, égaliser, réécouter (texte complet en annexe A.4).

## 6. Organisation du travail

- **Dépôt** : `C:\SatsPoint` ↔ `https://github.com/makaGit10/SatsPoint.git`.
- **Commit et push à chaque étape terminée** (messages clairs, en français, format `type(portée): description`).
- Base de données de développement : **PostgreSQL**, identifiants fournis par la propriétaire,
  **uniquement dans le `.env` local** (jamais dans le dépôt).
- Travail en parallèle autorisé (plusieurs agents) quand les tâches sont indépendantes.
- Comptes : la propriétaire autorise la création des comptes de l'application (super-admin, démo).
  Les mots de passe ne sont jamais écrits dans le dépôt : ils viennent du `.env` ou sont communiqués à part.
- Chaque fonctionnalité livrée = code + tests + vérification visuelle + audit sécurité + commit/push.

## 7. Check-list avant chaque livraison

- [ ] La fonctionnalité respecte la logique métier du cahier des charges.
- [ ] Interface FR/EN, thème clair/sombre, mobile 390 px et bureau 1366 px vérifiés.
- [ ] Icônes à la place des libellés d'action longs ; haut-parleur d'aide vocale présent.
- [ ] Temps réel branché (`useDonneesEnDirect`) sur chaque écran qui affiche des données.
- [ ] Requêtes optimisées (pas de N+1, index, pagination).
- [ ] 12 règles de sécurité confirmées point par point.
- [ ] Tests unitaires / API / Playwright verts ; aucune erreur console ; aucun 4xx/5xx inattendu.
- [ ] Commit + push.

---

## Annexe A — Textes d'origine (mot pour mot)

### A.1 Sécurité application — sécurité backend

> **DIRECTIVE DE SÉCURITÉ — priorité absolue, à appliquer à tout code que tu écris ou modifies.**
>
> Mon application manipule des données sensibles et/ou personnelles. La sécurité prime sur la rapidité et sur les fonctionnalités. Tu dois raisonner en permanence comme un attaquant qui cherche la faille, pas seulement comme un développeur qui fait marcher la fonctionnalité.
>
> 1. **Authentification ET autorisation — les deux, toujours.** « Être connecté » ne donne pas le droit de tout faire. Pour chaque action, vérifie séparément : qui es-tu ? (authentifié) et as-tu le droit de faire CETTE action sur CETTE donnée précise ? (autorisé selon rôle et propriété). Une simple vérification de connexion ne suffit jamais pour une donnée sensible.
> 2. **Ne jamais faire confiance à l'entrée (client, URL, formulaire, en-tête, fichier).** Tout ce qui vient de l'extérieur est potentiellement hostile. Valide le type, le format, la longueur et les bornes de chaque entrée côté serveur (la validation côté client est cosmétique, jamais une protection). Rejette par défaut ce qui n'est pas explicitement conforme.
> 3. **Bloque les accès par référence directe (IDOR).** Dès qu'un identifiant est manipulable par l'utilisateur (dans l'URL, le corps, un cookie), vérifie qu'il a le droit d'accéder à CET objet précis. Ne suppose jamais que « personne n'ira deviner l'id ». C'est la faille la plus courante.
> 4. **Cloisonne les données entre utilisateurs / clients / organisations.** Si plusieurs entités partagent la même infrastructure, chaque requête de données doit être filtrée par le propriétaire/l'organisation. Une entité ne doit jamais pouvoir lire ou modifier les données d'une autre, même par accident.
> 5. **Principe du moindre privilège.** Par défaut, tout est interdit ; on autorise explicitement, au cas par cas. N'accorde jamais plus de droits que strictement nécessaire. L'approche inverse (« tout permis sauf… ») laisse toujours des trous.
> 6. **Protège contre les injections.** Requêtes de base de données paramétrées uniquement (jamais de concaténation de chaînes). Échappe/assainis toute donnée réinjectée dans du HTML, une commande système, un chemin de fichier ou une réponse. Empêche la traversée de répertoire (../).
> 7. **Ne divulgue rien d'inutile.** Les messages d'erreur renvoyés à l'utilisateur doivent être génériques ; les détails techniques (structure de base, chemins, traces) restent dans les logs serveur. Ne renvoie jamais un objet complet quand seuls quelques champs sont nécessaires (pas de fuite de champs sensibles).
> 8. **Secrets et configuration.** Aucun secret (mot de passe, clé API, token, secret de signature) dans le code source ni dans le dépôt versionné. Utilise des variables d'environnement ou un gestionnaire de secrets. Suppose que le code peut fuiter.
> 9. **Limite les abus.** Applique une limitation de débit (rate limiting) sur les points sensibles : authentification, réinitialisation de mot de passe, envoi d'e-mails, opérations coûteuses. Empêche le brute-force et le déni de service applicatif.
> 10. **Transport et en-têtes.** HTTPS partout. Restreins les origines autorisées (CORS) à une liste explicite — et teste-la avant de déployer. Ajoute les en-têtes de sécurité (anti-clickjacking, anti-sniffing, politique de contenu).
> 11. **Traçabilité.** Journalise les actions sensibles (création/modification/suppression de données critiques, changements de droits, connexions) avec qui, quoi, quand — pour détecter et prouver après coup. Ne journalise jamais de secret en clair.
> 12. **Cohérence.** Si une route/fonction similaire a déjà une protection, applique exactement la même à la nouvelle. Un seul oubli au milieu de dix routes protégées est une faille béante.
>
> Avant de me livrer, relis ton code et confirme explicitement, point par point, que ces règles sont respectées. Signale toute zone où tu as un doute plutôt que de la passer sous silence. Si tu vois une faille dans du code existant que je ne t'ai pas demandé de toucher, préviens-moi.

### A.2 Synchronisation de l'application

> **Exigence : application synchronisée en temps réel**
>
> Plusieurs personnes utilisent l'application en même temps (par exemple la direction et la RH). Quand l'une modifie quelque chose, les autres doivent le voir s'afficher tout seul, en une à deux secondes, sans recharger la page. C'est une exigence de base, à prévoir dès le départ et sur tous les écrans, pas une option à ajouter plus tard.
>
> **Principe**
> - Après chaque modification réussie, le serveur envoie un signal aux autres personnes connectées (WebSocket, par exemple Socket.io). L'écran concerné recharge alors ses données depuis l'API habituelle.
> - Le signal ne contient AUCUNE donnée : seulement la rubrique concernée (« employes », « contrats »…), l'identifiant de l'auteur et l'heure. Les données repassent par l'API, avec ses contrôles d'accès.
> - Le signal n'est envoyé qu'aux personnes de la même entreprise (un groupe par entreprise), et seulement après vérification du jeton de connexion.
>
> **Côté serveur**
> - Le signal part seulement si la requête a vraiment écrit en base (INSERT, UPDATE, DELETE), pas d'après la méthode HTTP. Certaines lectures passent en POST : on aurait alors deux écrans qui se renvoient des rechargements sans fin.
> - Un seul point d'envoi commun (middleware), pas un envoi recopié dans chaque route.
> - Les écritures techniques (journaux, sessions, notifications) ne déclenchent pas de signal.
> - Un envoi de fichier réussi compte comme une écriture.
> - Si l'envoi du signal échoue, la requête de l'utilisateur ne doit jamais échouer pour autant.
>
> **Côté écrans**
> - Un seul hook commun, par exemple useDonneesEnDirect(['rubrique'], recharger), à brancher sur chaque écran qui affiche des données.
> - Le rechargement est silencieux : pas d'écran de chargement, la liste n'est pas vidée, les filtres, la page affichée, la recherche et les fenêtres ouvertes sont conservés. En cas d'erreur, on garde ce qui est déjà affiché.
> - On ignore ses propres modifications : l'écran de l'auteur est déjà à jour.
> - Plusieurs signaux rapprochés ne donnent qu'un seul rechargement (regroupement sur environ 800 ms).
> - Onglet en arrière-plan : le rechargement attend que l'onglet redevienne visible.
> - Jamais de rechargement d'un formulaire en cours de saisie : on n'efface pas ce que la personne est en train de taper.
> - Une seule connexion temps réel pour toute l'application. Elle relit le jeton à jour à chaque reconnexion, et on ne la recrée pas quand le jeton est renouvelé : sinon les écrans ouverts n'écoutent plus rien. Elle réessaie de se connecter si le serveur la refuse.
> - Les rubriques qui ont déjà leur propre temps réel (messagerie, notifications) ne passent pas par ce mécanisme.
>
> **Tests obligatoires (Playwright, deux navigateurs ouverts en même temps)**
> 1. A modifie, B voit le changement sans recharger, avec un seul rechargement.
> 2. L'écran de A ne se recharge pas lui-même.
> 3. Aucun rechargement pendant 12 secondes sans modification, et une simple lecture ne déclenche rien (pas de boucle).
> 4. Une fenêtre ouverte chez B reste ouverte et se met à jour.
> 5. Un onglet caché se met à jour quand il redevient visible.
> 6. Un tour de tous les écrans pendant qu'une modification arrive, sans aucune erreur JavaScript.

### A.3 Tester l'application de A à Z avec Playwright

> **Contexte (à remplir avant d'envoyer)**
> - Application : [nom], code dans [dossier], démarrée en test sur [URL, ex. http://127.0.0.1:3100] (port fixe et strict, jamais l'environnement de production).
> - Comptes de test, un par rôle : [rôle 1 : identifiant / mot de passe], [rôle 2 : …]. Ces comptes n'existent que sur la base de test.
> - Modules à couvrir, dans l'ordre métier : [ex. connexion, tableau de bord, employés, demandes, validation, pointage, documents, paramètres].
> - Ce qui ne doit jamais être fait : écrire sur la base de production, envoyer de vrais e-mails ou notifications, supprimer des données qui ne viennent pas du test.
>
> **Ta mission** — Tu es chargé de tester cette application de bout en bout avec Playwright, en suivant la logique métier, pas la structure technique. Tu dois prouver que chaque écran affiche ce qu'il doit afficher, que chaque bouton fait ce qu'il promet, et laisser derrière toi des tests rejouables, un rapport lisible et seulement les captures utiles. Travaille dans cet ordre. Ne saute pas d'étape, et n'écris pas un seul test avant d'avoir fini l'étape 1.
>
> **Étape 1 : cartographier avant de tester**
> 1. Lis le code pour établir la carte réelle de l'application : routes, menu, pages, rôles et droits, formulaires, actions. Ne devine rien : si un écran n'existe pas dans le code, il n'existe pas.
> 2. Écris cette carte dans `tests/e2e/PARCOURS.md`. Pour chaque écran : son chemin, qui y a accès, ce qui doit apparaître (titre, indicateurs, tableau, colonnes, boutons, messages d'état vide), et chaque action possible avec son effet attendu (navigation, fenêtre, message de confirmation, ligne ajoutée, appel réseau).
> 3. Déduis-en les parcours métier de bout en bout, dans l'ordre où un utilisateur les vit : par exemple « un employé fait une demande de congé → son responsable la voit → il la valide → l'employé voit le nouveau statut → le solde a baissé ». Un parcours traverse plusieurs écrans et plusieurs rôles ; c'est lui qui prouve que l'application fonctionne, pas un écran isolé.
> 4. Montre-moi la carte et la liste des parcours avant de continuer, pour que je corrige ce qui manque.
>
> **Étape 2 : écrire les tests, parcours par parcours**
> - Un fichier par parcours métier (`tests/e2e/01-connexion.spec.ts`, `02-demande-conge.spec.ts`…), numéroté dans l'ordre métier.
> - Chaque test crée lui-même les données dont il a besoin, avec un préfixe reconnaissable (ex. `TEST-E2E-<date>`), et les supprime à la fin, même en cas d'échec. Il ne dépend jamais d'un test précédent ni de données existantes.
> - Une connexion par rôle, factorisée dans une fixture (`tests/e2e/fixtures.ts`) : on ne recopie pas la connexion dans chaque test.
> - Vérifie avec de vraies assertions, pas seulement par des captures : `expect(...).toBeVisible()`, `toHaveText()`, `toHaveCount()`, valeurs exactes des compteurs, présence des colonnes, messages de validation des formulaires, état vide quand il n'y a rien.
> - Vérifie aussi ce qui ne se voit pas : aucune réponse réseau 4xx ou 5xx pendant le parcours (sauf celles attendues, à lister), aucune erreur dans la console du navigateur, et la donnée réellement enregistrée : recharge la page et retrouve-la.
> - Pour chaque rôle, vérifie ce qu'il ne doit pas voir : un employé ne doit pas atteindre les écrans d'administration, ni par le menu, ni en tapant l'adresse.
> - Jamais d'attente fixe (`waitForTimeout`) : attends un élément, une réponse réseau ou un état. Pas de test qui passe « parfois ».
>
> **Étape 3 : tester tous les boutons** — Sur chaque écran de la carte, en plus des parcours :
> 1. Inventorie tout ce qui est cliquable : boutons, liens, onglets, entrées de menu, icônes d'action dans les tableaux, cases, interrupteurs (`getByRole('button')`, `getByRole('link')`, `getByRole('tab')`, `getByRole('menuitem')`…).
> 2. Clique sur chacun et constate un effet précis : navigation vers le bon chemin, ouverture d'une fenêtre avec le bon titre, message de confirmation, ligne ajoutée ou modifiée, appel réseau parti et réussi, fichier téléchargé. Un clic sans aucun effet est un défaut à signaler, pas à ignorer.
> 3. Les boutons destructeurs (supprimer, annuler, désactiver) ne sont cliqués que sur des données créées par le test, et la confirmation est vérifiée dans les deux sens : annuler ne supprime pas, confirmer supprime.
> 4. Les boutons désactivés sont notés avec la raison attendue (droit insuffisant, formulaire incomplet). S'ils sont désactivés sans raison, c'est un défaut.
> 5. Consigne le résultat dans un tableau par écran : bouton, effet attendu, effet constaté, OK ou KO.
>
> **Étape 4 : captures d'écran**
> - Une capture par écran et par état significatif : avant l'action, après l'action, état vide, message d'erreur. Format PNG, page entière, taille de fenêtre fixe (1366×768 ; ajoute 390×844 si l'application est aussi utilisée sur téléphone).
> - Nommage : `captures/<date>/<NN>-<ecran>-<etat>.png`, par exemple `03-demandes-apres-validation.png`. Le numéro suit l'ordre du parcours.
> - Pas de capture d'un écran à moitié chargé : attends que les données attendues soient visibles avant de capturer.
> - Les captures servent de preuve pour le rapport ; elles ne remplacent pas les assertions.
>
> **Étape 5 : exécution**
> - Tout tourne sans fenêtre (`headless`), sur l'environnement de test uniquement, avec `trace: 'retain-on-failure'` pour pouvoir rejouer un échec, et une seule relance automatique (`retries: 1`) pour repérer les tests instables sans les masquer.
> - Lance l'ensemble, puis relance les tests en échec une fois à part. Un test qui réussit à la relance est instable : corrige le test, pas l'application.
> - Ne modifie pas le code de l'application pour faire passer un test. Si tu trouves un vrai défaut, décris-le dans le rapport avec les étapes exactes pour le reproduire et la capture, et demande-moi avant de corriger.
>
> **Étape 6 : rapport et nettoyage**
> 1. Écris `tests/e2e/RAPPORT.md` : un tableau écran par écran (ce qui doit apparaître, apparu ou non), un tableau des boutons (OK/KO), la liste des parcours avec leur résultat, et la liste des défauts classés par gravité, chacun avec ses étapes de reproduction et le nom de sa capture.
> 2. Liste ce qui n'a pas pu être testé et pourquoi (droit manquant, données impossibles à créer, service externe). Ne présente jamais comme testé ce qui ne l'a pas été.
> 3. Fais le ménage des captures : garde une capture de référence par écran et toutes celles qui prouvent un défaut ; supprime les doublons, les écrans intermédiaires, les captures d'essais et les traces des tests réussis. Écris dans le rapport combien de fichiers ont été gardés et combien supprimés, et vérifie que chaque capture citée dans le rapport existe encore.
> 4. Supprime toutes les données de test restées dans la base (recherche par le préfixe `TEST-E2E-`) et vérifie qu'il n'en reste aucune.
>
> **Règles permanentes**
> - Ne jamais toucher à la production, ni à un port qui appartient à une autre application : vérifie que le port de test est libre avant de démarrer, et n'arrête jamais un processus que tu n'as pas lancé.
> - Vérifie avant d'affirmer : chaque « OK » du rapport correspond à une assertion qui a réellement passé, chaque « KO » à une capture et des étapes de reproduction.
> - Si une information te manque (une adresse, un compte, un droit), fais d'abord tout ce qui ne dépend pas d'elle, puis pose une seule question précise.
> - Livre à la fin : les tests dans `tests/e2e/`, la configuration Playwright, `PARCOURS.md`, `RAPPORT.md`, le dossier `captures/<date>/` nettoyé, et un résumé de dix lignes : combien d'écrans, de boutons et de parcours testés, combien de défauts trouvés, et les trois plus graves.

### A.4 Voix off

> Pour la voix off de cette vidéo, utilise la voix Microsoft Azure « fr-FR-RemyMultilingualNeural » (affichée souvent comme « Rémy (Multilingual) – Français (France) », voix masculine). Si elle n'est pas disponible, prends « fr-FR-HenriNeural » (« Henri – Français (France) », voix masculine). N'utilise pas de voix clonée ni de voix « expressive » ou « émotionnelle » : ce sont elles qui sonnent artificiel.
>
> Réglages : vitesse normale (1,0, ou 0,95 si le débit paraît pressé), hauteur normale, aucune émotion forcée, aucune musique par-dessus la voix sauf à très bas volume.
>
> Le texte doit être écrit pour être dit, pas lu :
> - une idée par phrase, 15 à 25 mots maximum ;
> - la ponctuation donne la respiration : virgule = courte pause, deux-points = annonce, points de suspension = suspens ;
> - pas de listes à puces, pas d'abréviations, pas de sigles que l'oreille ne comprend pas ;
> - les noms de marque ou mots anglais toujours à l'intérieur d'une phrase française, jamais seuls en début de phrase (sinon la voix multilingue les lit en anglais) ;
> - une phrase par bloc audio, pour pouvoir la caler sur l'image.
>
> Après génération : couper les silences en début et fin de chaque phrase, égaliser le volume entre les phrases, puis réécouter chaque phrase avant de monter, en particulier celles qui contiennent un nom propre.

### A.5 Exigences produit (message de la propriétaire, reformulé fidèlement)

> J'aimerais que l'appli soit intuitive, facile à utiliser, très ergonomique, hyper fluide. Je priorise la rapidité et la performance, moderne. Pour certaines parties, en tenant compte de la logique métier, réagis et code de façon intelligente. Si je te demande de faire certains trucs, fais-le intelligemment, car parfois je peux oublier ou omettre certains trucs, mais c'est à toi d'être intelligent, de te baser sur les plus grandes applications pour savoir comment et ce qu'il faut faire, en tenant ainsi compte de la logique métier. Une plateforme interactive qui sera très optimisée, donc optimise tes requêtes. PostgreSQL (identifiants fournis à part, dans le `.env` local).
>
> Je ne veux pas que les pages soient surchargées mais bien rangées, bien placées ; ne perds pas trop d'espace non plus, c'est-à-dire pas énormément d'espace entre les lignes. Si un onglet dans une page risque d'avoir un libellé long comme Supprimer, Modifier, mets des icônes modernes à la place, etc. Que tout soit moderne : de l'écriture, du design, de l'affichage aux icônes, professionnel et orienté métier.
>
> J'aimerais que les exportations et importations soient intelligentes, avec des cases de correspondance pour les colonnes ; que les barres de recherche le soient aussi, très très intelligentes : une barre de recherche globale. Je cherche « chien » mais « chien » se trouve dans 2 onglets différents, donc dans les résultats les plus pertinents : animal → chien, zoo → chien, pour que je choisisse dans quel onglet. Pour une prochaine recherche, avant d'écrire, nos 4 anciennes recherches s'affichent, et en écrivant, les résultats se voient. Ce ne sont que quelques exemples de l'intelligence que doit avoir l'appli.
>
> Prends en compte aussi le thème clair, le thème sombre et le multilinguisme français/anglais. Mais aussi, tout le temps, faire des tests pour voir si l'appli répond bien à la logique de ce qui est demandé : bien vérifier les affichages par rapport à ce qui est demandé, si tout marche, tous les appels d'API et autres. Fais tout le temps des audits, et surtout la sécurité : pour une application qui pourra être mondiale, pense à maximiser le niveau de sécurité tout le temps, que rien ne soit laissé au hasard, et tout ce qui pourrait faire de cette appli une masterclass.
>
> Tous les boutons de l'appli doivent avoir un bouton pour l'écouter en wolof, en sérère, en pulaar, en diola, pour ceux qui ne savent ni lire ni écrire. Par exemple, un bouton « Encaisser » : un haut-parleur dans le coin du bouton ; quand on clique dessus, on entend ce que dit le bouton dans la langue sélectionnée par la personne. Ces audios seront préparés par moi dans une interface admin que j'aurai moi seule, et ils seront disponibles chez tout le monde. Dans cette interface, je préparerai des vocaux pour tous les boutons et fonctionnalités existants dans l'appli, dans toutes les langues. Même pour la sélection de langue, j'aimerais un vocal à côté, qui permettra d'écouter et de comprendre.
>
> Commit et push à chaque fois. Tu peux mettre en parallèle beaucoup d'agents à ta disposition. Je te fais confiance à 100 % dans chaque catégorie et fonctionnalité : sois clair, net et précis ; je veux que tout soit facile d'utilisation, des interfaces simples à utiliser et à comprendre, pas encombrantes du tout ; quand tu intègres des fonctionnalités, sois surtout intelligent.
