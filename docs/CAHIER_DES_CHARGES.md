# Cahier des charges — SatsPoint

| | |
|---|---|
| **Produit** | SatsPoint — point de vente Lightning pour les commerçants africains |
| **Accroche** | *Price in FCFA, get paid in sats in seconds, or with any mobile money. Non-custodial by design.* |
| **Version du document** | 1.0 — 8 novembre 2026 |
| **Propriétaire** | makaGit10 |
| **Dépôt** | https://github.com/makaGit10/SatsPoint |
| **Échéance** | Dakar Bitcoin Hack by BTrust — soumission avant le **20 novembre 2026, 20 h 00 UTC** (20 h 00 à Dakar) |
| **Documents liés** | [DIRECTIVES.md](DIRECTIVES.md) (consignes permanentes : sécurité, temps réel, tests, design, voix) |

---

## Sommaire

1. [Contexte et problème](#1-contexte-et-problème)
2. [Objectifs](#2-objectifs)
3. [Utilisateurs, rôles et droits](#3-utilisateurs-rôles-et-droits)
4. [Périmètre et priorités](#4-périmètre-et-priorités)
5. [Parcours principaux](#5-parcours-principaux)
6. [Spécifications fonctionnelles par module](#6-spécifications-fonctionnelles-par-module)
7. [Règles métier](#7-règles-métier)
8. [Design, ergonomie et accessibilité](#8-design-ergonomie-et-accessibilité)
9. [Architecture technique](#9-architecture-technique)
10. [Modèle de données](#10-modèle-de-données)
11. [API](#11-api)
12. [Temps réel](#12-temps-réel)
13. [Sécurité](#13-sécurité)
14. [Performance](#14-performance)
15. [Tests, qualité et audits](#15-tests-qualité-et-audits)
16. [Déploiement et exploitation](#16-déploiement-et-exploitation)
17. [Livrables du hackathon](#17-livrables-du-hackathon)
18. [Planning](#18-planning)
19. [Risques et parades](#19-risques-et-parades)
20. [Critères d'acceptation](#20-critères-dacceptation)
21. [Évolutions après le hackathon](#21-évolutions-après-le-hackathon)
22. [Glossaire](#22-glossaire)
23. [Décisions prises et points ouverts](#23-décisions-prises-et-points-ouverts)

---

## 1. Contexte et problème

Au Sénégal, et plus largement en Afrique de l'Ouest, les commerçants encaissent surtout en espèces
et en mobile money (Wave, Orange Money, Free Money). Une clientèle qui paie en Bitcoin existe :
diaspora, touristes, communauté Bitcoin locale en croissance. Mais le commerçant n'a **aucun outil
simple et fiable** pour l'accepter :

- les outils existants supposent un ordinateur, une connexion stable, un vocabulaire technique
  (« invoice », « node », « channel ») et des prix en dollars ;
- le commerçant pense en **FCFA** et attend une seule réponse : **« Est-ce que j'ai été payé, oui ou non, tout de suite ? »** ;
- une partie des commerçants **ne sait ni lire ni écrire** : un écran rempli de texte les exclut ;
- confier son argent à un intermédiaire inconnu est un frein (risque de perte, de blocage, de fraude).

**SatsPoint** transforme n'importe quel téléphone de milieu de gamme en caisse qui encaisse
**en sats via Lightning** ou **en mobile money via PayTech**, avec une confirmation instantanée,
une interface sans jargon et une **aide vocale en wolof, sérère, pulaar et diola**.
SatsPoint **ne détient jamais l'argent** du commerçant.

## 2. Objectifs

### 2.1 Objectifs produit
| Objectif | Mesure de réussite |
|---|---|
| Encaisser un paiement Lightning en quelques secondes | Montant tapé → écran vert en **moins de 10 s** au total, confirmation affichée **moins de 2 s** après le règlement |
| Ne jamais perdre une vente | Bascule Lightning → mobile money en **1 geste** sur le même écran |
| Être utilisable sans savoir lire | 100 % des boutons du parcours d'encaissement ont un audio dans les 4 langues locales |
| Fonctionner en conditions réelles | Chargement initial **< 3 s en 3G** sur un Android de milieu de gamme |
| Ne pas détenir les fonds | Aucune clé privée ni graine stockée par SatsPoint |

### 2.2 Objectifs hackathon : grille officielle du jury, exigence par exigence
Chaque phrase de la grille est une exigence. Cette table est la **check-list de soumission** : rien n'est soumis tant qu'une ligne n'est pas cochée.

| Critère | Exigence exacte du jury | Où c'est traité | Preuve montrée au jury |
|---|---|---|---|
| **Usefulness & Local Impact** | *Solve a real, well-scoped local problem* | §1 | Problème formulé en une phrase dans le README et la vidéo |
| | *Identify your primary user* | §3.1 (Awa, petite commerçante) | Persona en tête du README |
| | *Show how it changes their daily workflow* | §2.3 (avant / après) | Tableau avant / après dans le README + séquence de la vidéo |
| | *Estimate reach (e.g., merchants served per week)* | §2.4 (portée estimée), §6.16 (indicateurs) | Estimation chiffrée **sourcée** + indicateurs mesurés dans la console |
| **Security by Design** | *Minimal attack surface* | §9.3, §13 | Passerelle sur réseau interne uniquement, aucun port superflu |
| | *Threat model* | §13.3, `docs/THREAT_MODEL.md` | Fichier lié depuis le README |
| | *Least-privilege access* | §3.3, §13.1 | Matrice des droits + permissions NWC minimales + budget |
| | *Safe secret handling* | §13.1 | Secrets chiffrés, `.env` hors dépôt, jamais renvoyés au navigateur |
| | *Validated inputs* | §13.2 | Form Requests + tests de validation |
| | *No PII in logs* | §7.4, §13.2 | Client anonyme, logs filtrés, test automatique sur les logs |
| | *Prefer proven Bitcoin/Lightning libraries* | §9.2 | `@getalby/sdk` (NWC), bibliothèque éprouvée de décodage BOLT11 |
| | *Secure defaults* | §3.3, §13 | Tout refusé par défaut, HTTPS, CSP, envoi de sats désactivé par défaut |
| **UX/UI Quality** | *Fast, frictionless flows on low bandwidth and mid-range phones* | §14, §6.3 | Mesures Lighthouse « Slow 4G » publiées dans le README |
| | *Clear labels* | §8.1 | Vocabulaire sans jargon + aide vocale |
| | *Helpful errors* | §6.18 | Catalogue des messages : ce qui s'est passé + quoi faire |
| | *Accessible contrast/size* | §8.2, §8.3 | Contraste WCAG AA, cibles ≥ 44 px, audit axe-core |
| | *Simple copy free of jargon* | §8.1 | Relecture de chaque texte d'interface |
| **Working MVP** | *End-to-end demo that actually runs* | §5.3, §16 | URL publique, vrai réseau Lightning |
| | *One-command setup (Docker or script)* | §16.1 | `docker compose up` fonctionne **sans aucune configuration** (mode démo locale) |
| | *Seed data* | §16 | Boutique, ventes et articles de démonstration |
| | *A testable happy path* | §17 | Pas-à-pas « testez en 2 minutes » dans le README + comptes de démo |
| | *Avoid mockups when a minimal integration is possible* | §16.1 | Intégrations réelles (Lightning mainnet, PayTech) ; le simulateur local sert uniquement à l'installation sans clés et il est **clairement signalé** |
| **Clear Pitch & Docs** | *3-minute demo: problem → solution → impact → next steps* | §17 | Vidéo dans **cet ordre exact** |
| | *README with setup* | §17 | Section « Installation » |
| | *Architecture diagram* | §9.1 | Schéma dans le README |
| | *Constraints* | §17 | Section « Contraintes et limites connues » |
| | *Metrics to track* | §2.4, §6.16 | Section « Indicateurs suivis » |
| | *What you'll ship in the next iteration* | §21 | Section « Prochaine itération » |
| **Soumission** | *A presentation (text or video)* · *a public GitHub repo* · *an MVP accessible through internet (or a demo video)* · *at least, a bitcoin/lightning wallet implementation* | §17, §6.9 | Page Devpost, dépôt public, URL + vidéo, module **Portefeuille** |

### 2.3 Avant / après : le quotidien du commerçant
| Moment | Aujourd'hui (sans SatsPoint) | Avec SatsPoint |
|---|---|---|
| Un client veut payer en bitcoin | Vente refusée, ou adresse recopiée à la main, sans savoir combien de sats demander | Montant tapé en FCFA → QR → payé en quelques secondes |
| Savoir si on a été payé | Attendre, vérifier son téléphone, faire confiance à une capture d'écran du client | Écran vert + son + annonce vocale, décidés par le serveur |
| Le client n'a pas de bitcoin | Changer d'outil (appli Wave à part) | Onglet « Mobile money » sur le même écran |
| Le commerçant ne lit pas | Dépend d'un proche pour utiliser les applis | Aide vocale dans sa langue sur chaque bouton |
| Le patron n'est pas sur place | Appelle le caissier, compte le soir | Ventes en direct sur son téléphone |
| Fin de journée | Additionner à la main | Total du jour, répartition sats / mobile money, export |

### 2.4 Portée estimée et indicateurs
- **Méthode d'estimation**, à présenter avec des **chiffres sourcés** (aucun chiffre inventé) : nombre de commerçants et de points de vente au Sénégal (sources publiques : ANSD, rapports sur le commerce et le mobile money), taux d'équipement en smartphone, puis hypothèse prudente d'adoption pour un pilote.
- **Indicateurs mesurés dans l'application** (console super-admin, §6.16) : commerçants actifs par semaine, paiements par commerçant et par semaine, délai médian entre règlement et écran vert, part des ventes en sats et en mobile money, couverture audio par langue.
- **Objectif du pilote** (§21) : 10 commerçants dans un quartier de Dakar, chiffres rapportés chaque semaine.

## 3. Utilisateurs, rôles et droits

### 3.1 Personas
- **Awa, commerçante au marché HLM** — vend des tissus, smartphone Android d'entrée de gamme, lit peu,
  parle wolof, utilise Wave tous les jours. Veut : encaisser vite, savoir qu'elle est payée, voir son total du jour.
- **Moussa, caissier dans un restaurant** — encaisse pour le compte du patron, ne doit pas pouvoir sortir d'argent.
- **Le patron du restaurant (propriétaire)** — veut suivre les ventes en direct, depuis chez lui, et gérer ses caissiers.
- **Le client** — paie avec son propre portefeuille Lightning (Phoenix, Wallet of Satoshi, Blink, Breez…) ou avec Wave / Orange Money / Free Money. **Il n'installe rien et ne crée pas de compte.**
- **La propriétaire de la plateforme (super-administratrice)** — gère les boutiques, enregistre les audios dans toutes les langues, surveille la santé de la plateforme.

### 3.2 Rôles
| Rôle | Portée | Description |
|---|---|---|
| `super_admin` | Plateforme | Propriétaire de SatsPoint. Console d'administration, studio audio, journal d'audit global. **Double authentification obligatoire.** |
| `proprietaire` | Une boutique | Crée la boutique, connecte le portefeuille et PayTech, gère l'équipe, voit tout, peut envoyer des sats. |
| `gerant` | Une boutique | Comme le propriétaire, **sauf** : connecter/déconnecter le portefeuille, configurer PayTech, envoyer des sats, supprimer la boutique. |
| `caissier` | Une boutique | Encaisse, voit **ses** ventes du jour, envoie des reçus. Ne voit ni le solde, ni les réglages, ni l'équipe. |
| Client payeur | — | Non connecté. Accès uniquement à la page de paiement et au reçu public (lien non devinable). |

### 3.3 Matrice des droits (refus par défaut)
| Action | super_admin | proprietaire | gerant | caissier |
|---|:-:|:-:|:-:|:-:|
| Encaisser une vente | — | ✅ | ✅ | ✅ |
| Annuler une vente **en attente** | — | ✅ | ✅ | ✅ (les siennes) |
| Voir toutes les ventes de la boutique | — | ✅ | ✅ | ❌ (les siennes, jour en cours) |
| Confirmer manuellement un paiement Wave direct | — | ✅ | ✅ | ❌ |
| Voir le solde du portefeuille | — | ✅ | ✅ | ❌ |
| **Envoyer des sats** | — | ✅ (+ confirmation) | ❌ | ❌ |
| Connecter / révoquer le portefeuille, configurer PayTech | — | ✅ | ❌ | ❌ |
| Gérer les articles, importer / exporter | — | ✅ | ✅ | ❌ (lecture) |
| Gérer l'équipe | — | ✅ | ✅ (sauf propriétaires) | ❌ |
| Tableau de bord | — | ✅ | ✅ | ❌ (ses chiffres du jour) |
| Console plateforme, studio audio | ✅ | ❌ | ❌ | ❌ |

> Le `super_admin` **n'a pas accès** aux ventes ni aux portefeuilles des boutiques : il administre la plateforme, pas l'argent des commerçants (moindre privilège).

## 4. Périmètre et priorités

- **P0** : indispensable pour le 20 novembre (démo du jury).
- **P1** : prévu pour le 20 novembre si le planning le permet, sinon juste après.
- **P2** : après le hackathon.

| Module | P0 | P1 | P2 |
|---|---|---|---|
| Comptes et connexion | Inscription, connexion, déconnexion, mot de passe oublié | 2FA pour propriétaires, PIN caissier | Connexion par lien magique / OTP SMS |
| Démarrage guidé | Boutique → portefeuille → PayTech → paiement test | Vidéo d'aide par étape | — |
| Caisse | Pavé numérique, conversion FCFA ↔ sats, note | Articles rapides, panier | Remises, TVA, pourboires |
| Paiement Lightning | Facture, QR, expiration, renouvellement, confirmation temps réel | Lien de paiement partageable | Paiement hors ligne |
| Paiement mobile money | PayTech (Wave, Orange Money, Free Money) avec confirmation automatique | Lien Wave direct (confirmation manuelle) | Autres agrégateurs |
| Reçus | Lien public + partage WhatsApp/SMS | PDF | Impression Bluetooth |
| Ventes | Historique, filtres, détail, annulation | Export | Remboursements |
| Tableau de bord | Chiffres du jour, répartition sats / mobile money, dernières ventes en direct | Graphiques 7/30 jours, meilleurs articles | Prévisions |
| Portefeuille | Solde, recevoir, envoyer (propriétaire), historique | Budget de dépense visible | Conversion vers FCFA (partenaire) |
| Équipe | Inviter, rôle, désactiver | Journal par caissier | — |
| **Aide vocale** | Lecteur, haut-parleur sur les boutons, sélecteur de langue parlé, annonce « paiement reçu » | Appui long = écoute | Montants dits à voix haute |
| **Studio audio (super-admin)** | Matrice clés × langues, enregistrement dans le navigateur, import de fichier, publication | Traitement automatique (silences, volume), mode rafale | Versions et retour arrière |
| Recherche globale | — | Résultats groupés par rubrique, 4 dernières recherches, tolérance aux fautes | Recherche vocale |
| Import / export | Export CSV des ventes | Import d'articles avec correspondance des colonnes, export Excel/PDF | Import de clients |
| Console plateforme | Liste des boutiques, suspendre/réactiver, santé | Journal d'audit global, statistiques | Facturation |
| Thèmes et langues | Clair / sombre / auto, FR / EN | — | Autres langues écrites |

## 5. Parcours principaux

### 5.1 Premier lancement (personne qui ne lit pas)
1. Écran plein : **choix de la langue**. Six grandes tuiles : *Wolof, Seereer, Pulaar, Joola, Français, English*,
   chacune avec un **haut-parleur** qui dit le nom de la langue **dans cette langue**.
2. La langue audio choisie est mémorisée (appareil + compte). L'interface écrite passe en français
   pour les langues locales (en anglais si *English*).
3. Écran d'accueil : « Créer ma boutique » / « Me connecter », chacun avec son haut-parleur.

### 5.2 Démarrage guidé du propriétaire (≈ 3 min)
1. **Ma boutique** : nom, téléphone, ville (Dakar par défaut), type de commerce.
2. **Mon portefeuille Lightning** : coller ou scanner un lien *Nostr Wallet Connect* (`nostr+walletconnect://…`).
   Aide intégrée : quels portefeuilles sont compatibles (Alby Hub, Coinos, Primal, Zeus…) et comment obtenir le lien.
   SatsPoint vérifie la connexion (`get_info`, permissions disponibles) et affiche ce qu'il a le droit de faire.
3. **Mobile money (facultatif)** : clés API PayTech de la boutique (chaque commerçant encaisse sur **son propre** compte PayTech) — ou lien Wave direct.
4. **Paiement test** : facture de 100 FCFA à payer soi-même → écran vert → « Votre caisse est prête ».

### 5.3 Encaisser (cœur du produit)
```
 CAISSE                  PAIEMENT                         SUCCÈS
 ┌───────────────┐      ┌─────────────────────────┐      ┌──────────────────┐
 │   15 000 FCFA │      │ 15 000 FCFA · 23 450 sats│      │        ✅        │
 │ ≈ 23 450 sats │  →   │ [ Lightning | Mobile money ]  → │  Paiement reçu   │
 │ [1] [2] [3]   │      │      ▓▓▓ QR ▓▓▓          │      │   15 000 FCFA    │
 │ [4] [5] [6]   │      │   ⏱ 4:59  ⧉ copier  ↗    │      │ [Reçu] [Nouvelle]│
 │ [7] [8] [9]   │      │         ✕ annuler         │      └──────────────────┘
 │ [000][0] [⌫]  │      └─────────────────────────┘
 │ [  Encaisser ]│
 └───────────────┘
```
1. Le caissier tape le montant en FCFA (ou touche des articles rapides) ; l'équivalent en sats s'affiche en direct.
2. **Encaisser** → la vente est créée, le cours est figé, la facture Lightning est générée, le QR s'affiche.
3. Le client scanne et paie. Le serveur constate le règlement → signal temps réel → l'écran relit le statut → **écran vert, son, vibration, et annonce vocale « Paiement reçu » dans la langue choisie**.
4. Onglet **Mobile money** : QR / lien PayTech (Wave, Orange Money, Free Money) ; confirmation automatique par notification PayTech (IPN).
5. Facture expirée → régénération en un geste, au nouveau cours.
6. Après succès : **Reçu** (partage WhatsApp / SMS / copie du lien) ou **Nouvelle vente**.

### 5.4 Suivi par le propriétaire
Le tableau de bord se met à jour **tout seul** à chaque vente d'un caissier (temps réel) : chiffre du jour,
nombre de ventes, répartition sats / mobile money, dernières ventes.

### 5.5 Envoyer des sats (propriétaire)
Coller ou scanner une facture / adresse Lightning → aperçu (montant en sats et en FCFA, frais estimés)
→ **confirmation explicite** (mot de passe ou PIN) → envoi → historique. Plafonné par le budget NWC.

### 5.6 Studio audio (super-admin)
Matrice « clés × langues » → choisir une case manquante → **enregistrer au micro** (ou déposer un fichier)
→ réécouter → valider → passage automatique à la case manquante suivante → **publier** → disponible chez tout le monde.

## 6. Spécifications fonctionnelles par module

### 6.1 Comptes, connexion et sessions (P0)
- Inscription : nom, téléphone **ou** e-mail, mot de passe (12 caractères minimum, vérification contre les mots de passe compromis — règle `Password::uncompromised()`).
- Connexion par téléphone ou e-mail + mot de passe. Messages d'erreur génériques (« Identifiants incorrects »), jamais « ce compte n'existe pas ».
- Mot de passe oublié : lien à usage unique, 30 min, par e-mail (SMS en P2).
- Sessions SPA par **cookie sécurisé** (Laravel Sanctum, `HttpOnly`, `Secure`, `SameSite=Lax`) + jeton CSRF. **Aucun jeton dans le `localStorage`.**
- Déconnexion de tous les appareils (propriétaire).
- P1 : 2FA TOTP pour propriétaires (obligatoire pour `super_admin` dès P0) ; **PIN caissier** à 6 chiffres sur un appareil enregistré par le propriétaire, pour passer d'un caissier à l'autre en 2 s.
- Préférences par utilisateur : langue d'interface (FR/EN), langue audio, thème, aide vocale activée.

### 6.2 Boutique et démarrage guidé (P0)
- Une boutique = un espace cloisonné (nom, téléphone, ville, fuseau `Africa/Dakar`, devise XOF, logo P1).
- Réglages : durée de validité des factures (2 à 15 min, défaut 5), montant maximum par vente (défaut 2 000 000 FCFA),
  moyens de paiement activés, message de reçu.
- Indicateur d'état de configuration visible sur l'accueil tant que le démarrage n'est pas fini.

### 6.3 Caisse (P0)
- Pavé numérique **plein écran sur mobile**, touches ≥ 64 px, touche `000`, effacement, appui long sur ⌫ = tout effacer.
- Montant formaté en direct (`15 000 FCFA`), conversion en sats sous le montant (`≈ 23 450 sats`), cours affiché discrètement avec son heure.
- Note facultative (« Table 4 », « 2 m de bazin »).
- P1 : **articles rapides** (grille de tuiles avec prix) + panier simple (quantités, total).
- Bouton **Encaisser** désactivé tant que le montant est hors bornes (min 100 FCFA, max réglage boutique), avec la raison affichée.
- Retour haptique (`navigator.vibrate`) sur chaque touche, si disponible.

### 6.4 Paiement Lightning (P0)
- Création de facture via le portefeuille du commerçant (`make_invoice` NWC), montant en millisats, description « SatsPoint · <boutique> · <n° vente> », expiration = réglage boutique.
- QR code généré **côté client** au format `LIGHTNING:<BOLT11 EN MAJUSCULES>` (QR plus compact et plus lisible).
- Compte à rebours, **copier**, **partager** (Web Share API), **annuler**.
- Détection du paiement : notifications NWC `payment_received` **et** vérification périodique `lookup_invoice` en secours (toutes les 2–3 s tant que la facture est valide). Le statut « payé » n'est accepté **que** si le portefeuille confirme (facture réglée, même `payment_hash`).
- Facture expirée → écran « Facture expirée » + bouton **Nouvelle facture** (nouveau cours).
- Écran de succès plein écran vert, son court, vibration, annonce vocale `paiement.recu` dans la langue audio choisie.

### 6.5 Paiement mobile money via PayTech (P0)
- Chaque boutique enregistre **ses propres** clés API PayTech (chiffrées en base). L'argent va directement sur le compte PayTech du commerçant : SatsPoint n'est pas intermédiaire financier.
- Demande de paiement : `POST https://paytech.sn/api/payment/request-payment` (montant XOF, `ref_command` = identifiant unique du paiement, `ipn_url`, `success_url`, `cancel_url`, `env`, `target_payment` pour présélectionner Wave / Orange Money / Free Money quand c'est utile). *Les paramètres exacts sont vérifiés contre la documentation PayTech à l'implémentation.*
- Affichage : QR du lien de paiement (le client le scanne avec son téléphone) **ou** bouton « Ouvrir » si le client paie sur l'appareil du commerçant.
- Confirmation : **IPN PayTech** reçue sur `/webhooks/paytech/{boutique}` ; vérification de l'authenticité (empreintes SHA-256 de la clé et du secret, ou HMAC selon la version de l'API), du montant, de la devise et de la référence ; traitement **idempotent** ; journalisation de l'événement sans données sensibles.
- Bouton **« Vérifier le paiement »** en secours (consultation du statut auprès de PayTech si l'API le permet).
- P1 : **lien Wave direct** de la boutique (`https://pay.wave.com/m/<id-marchand>/c/sn/?amount=<montant>`) ; pas de confirmation automatique → statut « en attente de confirmation » → **confirmation manuelle** par propriétaire/gérant, tracée dans le journal d'audit et signalée comme telle dans les rapports.

### 6.6 Reçus (P0)
- Chaque vente payée a un **lien public non devinable** (`/r/<jeton de 32 caractères>`) : boutique, date, montant FCFA, moyen de paiement, montant en sats le cas échéant, n° de vente. **Aucune donnée personnelle du client.**
- Partage : WhatsApp (`wa.me`), SMS (`sms:`), copie, Web Share. P1 : PDF.

### 6.7 Ventes (P0)
- Liste compacte : n°, heure, montant, moyen (icône ⚡ / icône mobile money), statut (pastille), caissier.
- Filtres : période (aujourd'hui, hier, 7 j, 30 j, personnalisée), statut, moyen de paiement, caissier ; recherche par n° ou montant.
- Pagination par numéro de page avec total (« 21–40 sur 248 », page dans l'adresse), filtres et page conservés lors des mises à jour en direct (CONTRAT_API § 13).
- Détail : lignes, tentatives de paiement, horodatages, cours appliqué, reçu.
- Actions en icônes : 🧾 reçu, ✕ annuler (en attente seulement), ✔ confirmer manuellement (Wave direct).
- Export CSV (P0), Excel / PDF (P1), respectant les filtres.

### 6.8 Tableau de bord (P0)
- Cartes compactes : chiffre d'affaires du jour (FCFA), nombre de ventes, panier moyen, part sats / mobile money.
- Dernières ventes en direct. P1 : courbe 7 / 30 jours, meilleurs articles, comparaison avec la veille.
- Caissier : ses propres chiffres du jour uniquement.

### 6.9 Portefeuille (P0 — exigence de soumission)
- Solde en sats et en FCFA (`get_balance`), rafraîchi en direct.
- **Recevoir** : facture libre (montant FCFA ou sats) + QR.
- **Envoyer** (propriétaire seulement) : facture BOLT11 ou adresse Lightning (`nom@domaine`, résolution LNURL-pay), aperçu, confirmation par mot de passe/PIN, plafonné par le budget NWC ; erreurs claires (« solde insuffisant », « budget atteint »).
- Historique (`list_transactions`) : entrées / sorties, montant, date, description.
- État de la connexion (connecté / injoignable / révoqué) + bouton **Révoquer** (supprime le secret côté SatsPoint et explique comment révoquer côté portefeuille).

### 6.10 Articles (P1)
- Nom, prix FCFA, catégorie, couleur ou image légère, actif/inactif, référence (SKU) facultative.
- Tri par glisser-déposer pour la grille de la caisse.
- Import / export (voir 6.15).

### 6.11 Équipe (P0)
- Inviter par téléphone/e-mail avec un rôle ; lien d'invitation à usage unique (72 h).
- Changer le rôle, désactiver (l'accès est coupé immédiatement, sessions révoquées).
- Un propriétaire ne peut pas se retirer s'il est le seul.

### 6.12 Aide vocale multilingue (P0 — exigence majeure)
**Principe** : chaque élément d'action (bouton, onglet, entrée de menu, champ, tuile de langue, message important)
porte une **clé vocale**. Si un audio existe pour cette clé dans la langue de la personne, un **petit haut-parleur**
apparaît dans le coin de l'élément. Un toucher sur le haut-parleur **lit l'audio sans déclencher le bouton**.

- **Langues audio** : `wo` (wolof), `srr` (sérère / seereer), `ff` (pulaar), `dyo` (diola / joola) ; `fr` (français) en complément. Liste **dynamique** depuis le 10 novembre : la super-admin ajoute les langues des autres pays (§ 6.19).
- **Source unique des clés** : la clé vocale **est** la clé de traduction (ex. `caisse.encaisser`). Un script de construction extrait toutes les clés vocales du code et les synchronise en base : **toute nouvelle fonctionnalité apparaît automatiquement dans le studio** comme « audio manquant ». Rien ne peut être oublié.
- **Composants** : `<Bouton voix="caisse.encaisser">`, `<HautParleur cle="…"/>` ; un seul lecteur audio global (un nouveau son coupe le précédent).
- **Repli** : langue choisie → français → haut-parleur masqué (jamais de haut-parleur muet).
- **Affichage** : icône 14–16 px dans le coin supérieur droit, zone tactile ≥ 32 px, animation d'ondes pendant la lecture ; activable/désactivable dans les préférences (activée par défaut si une langue locale est choisie).
- **Annonces automatiques** : « Paiement reçu », « Facture expirée », « Paiement annulé » sont **lues automatiquement** sur l'écran d'encaissement si l'aide vocale est activée.
- **Sélecteur de langue** : chaque langue a son haut-parleur, qui dit le nom de la langue dans cette langue.
- **Chargement** : un manifeste léger par langue (`clé → URL versionnée`) ; fichiers récupérés à la demande (5–20 Ko chacun), mis en cache par le service worker (cache-first, URL immuables). P1 : « télécharger la langue pour l'utiliser hors ligne ».
- **Mises à jour** : quand la super-admin publie des audios, un signal temps réel (rubrique `audios`, canal public plateforme) fait relire le manifeste par toutes les applications ouvertes.
- P1 : appui long (500 ms) sur un bouton = écoute de son audio. P2 : lecture des montants (« quinze mille francs ») assemblée à partir de nombres enregistrés.

### 6.13 Studio audio — console super-admin (P0)
Réservé au rôle `super_admin` (2FA obligatoire). Objectif : enregistrer **vite** des centaines d'audios.

- **Matrice** clés × langues : ✔ publié, ● brouillon, ○ manquant ; taux de couverture par langue et par écran ;
  filtres (écran, langue, manquants seulement) ; recherche ; ordre = ordre d'apparition dans l'application.
- Chaque clé affiche son texte FR et EN, l'écran où elle apparaît et une description du contexte.
- **Enregistrement dans le navigateur** (MediaRecorder) : compte à rebours 3-2-1, vumètre, arrêt automatique après 15 s,
  réécoute, refaire, valider. **Ou** dépôt de fichier (mp3, wav, m4a, ogg, webm ; ≤ 2 Mo ; ≤ 15 s).
- **Traitement serveur automatique** (file d'attente, ffmpeg) : suppression des silences début/fin, normalisation du volume
  (EBU R128 / `loudnorm`), mono, **MP3 48 kb/s** (lecture garantie sur Android et iPhone), empreinte SHA-256 dans le nom de fichier.
- **Mode rafale** : après validation, passage automatique à la prochaine case manquante, raccourcis clavier
  (`Espace` enregistrer/arrêter, `Entrée` valider, `R` refaire, `→` suivant).
- Brouillon → **Publier** (une clé, une langue, ou en lot) → disponible chez tout le monde. P2 : historique des versions et retour arrière.
- **Priorité de couverture** : les ~30 clés du parcours d'encaissement sont marquées « essentielles » et listées en premier
  (charge réaliste avant le 20 novembre : ~30 clés × 4 langues ≈ 120 enregistrements ≈ 1 h 30 en mode rafale).

### 6.14 Recherche globale (P1)
- Barre en haut de l'application + raccourci `Ctrl/⌘ + K` ; plein écran sur mobile.
- **Avant de taper** : les **4 dernières recherches** (enregistrées par utilisateur, effaçables).
- **Pendant la frappe** (après 150 ms, requête précédente annulée) : résultats **groupés par rubrique**, les plus pertinents en tête,
  5 par rubrique maximum, terme surligné. Exemple : « bazin » → `Articles › Bazin riche`, `Ventes › V-000142 (note : 2 m de bazin)`.
- Rubriques : Ventes (n°, montant, note), Articles, Équipe, Pages et réglages (« portefeuille », « PayTech », « thème »), Aide.
- Tolérance aux fautes et aux accents : PostgreSQL `pg_trgm` + `unaccent`, index GIN ; réponse < 150 ms côté serveur.
- Navigation au clavier (↑ ↓ Entrée Échap) ; chaque résultat respecte les droits du rôle (un caissier ne trouve pas l'équipe).

### 6.15 Import / export intelligents (P0 export ventes ; P1 le reste)
- **Import d'articles** (CSV, XLSX) :
  1. dépôt du fichier → détection automatique de l'encodage, du séparateur et de la ligne d'en-tête ;
  2. **écran de correspondance** : chaque colonne du fichier ↔ un champ SatsPoint (liste déroulante), **suggestions automatiques**
     (dictionnaire de synonymes FR/EN + similarité : « Désignation », « Libellé », « Name » → *Nom* ; « Tarif », « Price », « PU » → *Prix*),
     colonnes ignorables, correspondance mémorisée pour la prochaine fois ;
  3. **aperçu** des 10 premières lignes transformées, erreurs ligne par ligne ;
  4. choix : créer seulement / créer et mettre à jour (même référence ou même nom) / ignorer les lignes en erreur ;
  5. import en arrière-plan avec progression en direct, rapport téléchargeable.
- **Exports** : ventes, paiements, articles en CSV (UTF-8 avec BOM, lisible par Excel), XLSX, PDF (rapport journalier) ; respectent les filtres en cours ; gros volumes en arrière-plan.

### 6.16 Console plateforme — super-admin (P0)
- Boutiques : liste, recherche, état de configuration, activité (ventes des 7 derniers jours, en nombre uniquement), suspendre / réactiver.
- Santé : base, Redis, Reverb, passerelle Lightning, relais Nostr, dernière mise à jour du cours, files d'attente.
- P1 : journal d'audit global (filtrable), statistiques d'adoption (commerçants actifs par semaine, paiements par commerçant, délai médian de confirmation) — **les indicateurs du pitch**.

### 6.17 Thèmes, langues, préférences (P0)
- Thème clair / sombre / automatique, appliqué sans flash au chargement.
- Interface FR / EN (i18next), formats de nombres et dates localisés (`15 000 FCFA`, `08/11/2026 14:32`).
- Toutes les chaînes dans les fichiers de traduction ; un test échoue si une clé manque dans une langue.

### 6.18 Messages d'erreur utiles (P0)
Chaque message dit **ce qui s'est passé** et **quoi faire**, sans jargon, avec une icône, une couleur et une clé vocale. Jamais de code technique à l'écran.

| Situation | Message affiché | Action proposée |
|---|---|---|
| Portefeuille injoignable | « Votre portefeuille ne répond pas. » | **Réessayer** · **Encaisser par mobile money** |
| Cours du bitcoin indisponible | « Le prix du bitcoin n'est pas disponible pour le moment. » | **Encaisser par mobile money** |
| Facture expirée | « Le délai de paiement est dépassé. » | **Nouvelle demande de paiement** |
| Montant trop petit / trop grand | « Le montant doit être entre 100 et 2 000 000 FCFA. » | Correction sur le pavé |
| Paiement mobile money refusé | « Le paiement n'a pas abouti. Le client n'a pas été débité. » | **Réessayer** · **Payer en bitcoin** |
| Connexion Internet perdue | « Pas de connexion. Votre vente est conservée. » | Reprise automatique au retour du réseau |
| Solde insuffisant (envoi) | « Il vous manque 1 200 sats pour cet envoi. » | **Modifier le montant** |
| Budget d'envoi atteint | « Limite d'envoi atteinte pour aujourd'hui. » | Explication du budget |
| Identifiants incorrects | « Téléphone ou mot de passe incorrect. » | **Mot de passe oublié ?** |
| Accès refusé | « Cette page est réservée au propriétaire de la boutique. » | **Retour à la caisse** |
| Erreur inattendue | « Un problème est survenu. Réessayez dans un instant. » (référence courte pour le support) | **Réessayer** |

### 6.19 Pays, langues et moyens de paiement par pays (P1 — 10 novembre)
Demande de la propriétaire : d'autres pays que le Sénégal se connectent ; leur administratrice ajoute leurs langues, enregistre les vocaux et met leurs moyens de paiement. Contrat : [CONTRAT_API § 14](CONTRAT_API.md).
- **Périmètre** : zone franc CFA **XOF** (UEMOA : SN, CI, ML, BF, NE, TG, BJ, GW) — une seule devise, la conversion BTC/XOF reste la même. Les autres devises (GNF, XAF…) sont **hors périmètre** (il faudrait des cours et des bornes par devise).
- **Boutique** : un pays (Sénégal par défaut, boutiques existantes en SN), choisi au démarrage guidé, modifiable par le **propriétaire** dans les réglages.
- **Langues** : catalogue géré dans la console (onglet « Langues ») — code, nom dans la langue, noms FR / EN, pays, actif. Une langue active apparaît sur l'écran de choix de la langue de ses pays (après un **sélecteur de pays compact**, déduit du navigateur), dans le bandeau « Écouter en », les préférences et comme **colonne du studio** (filtrable par pays) ; son nom (`langue.{code}`) s'enregistre au studio. Jamais supprimée si elle a des audios : on la désactive.
- **Moyens de paiement** : catalogue par pays (onglet « Moyens de paiement ») — nom, type **lien** (QR du lien marchand) ou **numéro** (numéro marchand en grand), couleur, instructions courtes FR / EN en texte brut. Le commerçant active ceux de **son** pays avec **son** numéro / lien ; la caisse les propose ; le paiement est **confirmé à la main** par le propriétaire ou le gérant (comme le Wave direct, journalisé). Ils comptent dans « mobile money ».
- **Sénégal inchangé** : PayTech (Wave, Orange Money, Free Money) et le lien Wave direct restent tels quels ; aucun moyen supplémentaire au catalogue SN.

## 7. Règles métier

### 7.1 Montants et conversion
- Tous les montants sont des **entiers** : FCFA (pas de centimes), sats, millisats pour NWC. Aucun flottant pour l'argent.
- Cours : **BTC/EUR** (médiane de 3 sources : Kraken, Bitstamp, CoinGecko), converti en XOF par la **parité fixe 1 EUR = 655,957 XOF**.
  Rafraîchi toutes les 60 s. Une source qui s'écarte de plus de 2 % de la médiane est écartée.
- Si aucun cours de moins de 10 minutes n'est disponible : l'encaissement Lightning est **bloqué** avec un message clair (le mobile money reste possible).
- Conversion : `sats = ⌈ montant_xof × 100 000 000 / cours_xof_par_btc ⌉` — **arrondi au sat supérieur** : le commerçant reçoit toujours au moins le prix affiché.
- Le cours est **figé** à la création de la facture et enregistré avec le paiement.
- Bornes : 100 FCFA ≤ montant ≤ maximum de la boutique (défaut 2 000 000 FCFA).

### 7.2 Cycle de vie
```
Vente :     en_attente ──► payee
                │    └──► annulee (action utilisateur)
                └──────► expiree (toutes les tentatives expirées, sans nouvelle tentative pendant 30 min)

Paiement :  en_attente ──► reussi
  (tentative)   ├────────► expire   (facture Lightning arrivée à échéance)
                ├────────► echoue   (refus PayTech)
                └────────► annule   (vente annulée ou autre tentative réussie)
```
- Une vente peut avoir **plusieurs tentatives** (Lightning, puis mobile money, puis nouvelle facture…). **Une seule** peut la solder.
- Quand une tentative réussit : la vente passe à `payee`, les autres tentatives en attente passent à `annule` (factures Lightning abandonnées, demandes PayTech ignorées).
- **Double paiement** (deux tentatives réglées presque en même temps) : la vente reste `payee`, la seconde tentative est marquée `reussi` + **alerte « trop-perçu »** au propriétaire (à rembourser hors application). Jamais de perte silencieuse.
- **Paiement PayTech confirmé après annulation ou expiration** : l'argent a été reçu → la vente repasse à `payee` avec une mention et une alerte. On ne refuse jamais un paiement réellement reçu.
- Transitions faites en **transaction SQL avec verrou** (`SELECT … FOR UPDATE`) ; confirmation **idempotente** (même événement reçu deux fois = un seul effet).
- Numérotation par boutique, continue et lisible : `V-000001`, `V-000002`… (séquence par boutique, sans trou visible pour l'utilisateur).

### 7.3 Temps et fuseau
- Stockage en UTC ; affichage en `Africa/Dakar` (UTC+0) ou fuseau de la boutique ; « aujourd'hui » = journée locale de la boutique.

### 7.4 Données personnelles
- Le client payeur est **anonyme** : aucun nom, téléphone ou e-mail client collecté par défaut.
- Données des commerçants minimales ; conformité à la loi sénégalaise n° 2008-12 sur les données personnelles (CDP) à faire valider avant tout lancement commercial.

## 8. Design, ergonomie et accessibilité

### 8.1 Principes (inspirés de Square, SumUp, Stripe, Wave, Linear)
- **Une action principale par écran**, visible immédiatement ; les actions secondaires en icônes.
- **Aéré et rangé** (direction « Lumière », validée le 10/11) : grille de 4 px, texte de base 15 px, interlignes généreux, grands titres très gras ; aucune page surchargée.
- **Zéro jargon** dans l'interface commerçant : « Paiement reçu », « Facture » → « Demande de paiement », « Solde » ; le vocabulaire technique reste dans l'aide.
- **Comprendre sans lire** : couleur + icône + son pour chaque statut (vert ✔ payé, ambre doré ⏱ en attente, gris ✕ annulé, rouge ⚠ problème).
- **Rapide** : réponses optimistes là où c'est sûr (jamais pour un paiement), squelettes de chargement uniquement au premier affichage, transitions ≤ 150 ms.

### 8.2 Système visuel
- Police **Plus Jakarta Sans** (auto-hébergée, latin + latin étendu), chiffres tabulaires pour les montants.
- Direction **« Lumière »** : blanc chaud (`#fffdf8`) avec halos dorés, cartes en **verre dépoli**, boutons et touches en pilule,
  accent **or** en dégradé (`#f6c34a` → `#e0a21f`, texte `#2a1c00`) ; **pas d'orange** (trop proche de Banxaas). Vert succès, bleu mobile money.
  Jetons de couleur en variables CSS (`web/src/styles/jetons.css`), **clair par défaut, sombre en option**, contraste **WCAG AA** minimum.
- Logo : fichier unique `web/public/logo.svg` (provisoire, à remplacer par la propriétaire), icônes PWA régénérées par `node scripts/generer-icones.mjs`.
- Icônes **Lucide** (traits fins, cohérentes) ; libellés d'actions longs remplacés par des icônes + infobulle + `aria-label` + clé vocale.
- Composants : primitives accessibles (Radix UI) stylées avec Tailwind CSS.
- Mobile d'abord (390 px), puis tablette, puis bureau (1366 px) avec barre latérale repliable.

### 8.3 Accessibilité
- Navigation clavier complète, focus visible, cibles tactiles ≥ 44 px (≥ 64 px sur le pavé de caisse).
- `aria-label` sur toutes les icônes ; annonces `aria-live` pour les changements de statut de paiement.
- Respect de `prefers-reduced-motion`.

## 9. Architecture technique

### 9.1 Vue d'ensemble
```
                      Internet (HTTPS uniquement)
                               │
                        ┌──────▼──────┐
                        │    Caddy    │  TLS automatique, en-têtes, compression, fichiers statiques
                        └──┬───────┬──┘
              /api, /r, /webhooks   │ /app (WebSocket)
                  ┌────────▼───┐ ┌──▼─────────┐
   PWA React ◄───►│ API Laravel│ │  Reverb    │◄──── signaux temps réel (sans données)
   (navigateur)   │ (PHP-FPM)  │ │ (WebSocket)│
                  └─┬──┬───┬───┘ └────────────┘
                    │  │   │ réseau interne Docker, requêtes signées HMAC
        ┌───────────┘  │   └──────────────┐
  ┌─────▼─────┐  ┌─────▼────┐   ┌─────────▼──────────┐        ┌───────────────┐
  │PostgreSQL │  │  Redis   │   │ Passerelle Lightning│◄─────►│ Relais Nostr  │◄──► Portefeuille
  │           │  │cache,file│   │ (Node, @getalby/sdk)│  NWC  │ (NIP-47)      │     du commerçant
  └───────────┘  └──────────┘   └────────────────────┘        └───────────────┘
        ▲
        │ worker de files (traitement audio ffmpeg, imports, exports, vérifications de paiement)
        │ planificateur (cours de change, expiration des factures, nettoyage)
                                         PayTech ──IPN──► /webhooks/paytech/{boutique}
```

### 9.2 Choix technologiques
| Couche | Choix | Raison |
|---|---|---|
| API | **Laravel 12** (PHP 8.3), Sanctum (cookies SPA), Form Requests, Policies, API Resources | Maîtrisé par l'équipe, sécurité éprouvée, productivité. |
| Temps réel | **Laravel Reverb** + Laravel Echo | WebSocket natif Laravel, canaux privés autorisés par la session. |
| Base de données | **PostgreSQL 16** (`pg_trgm`, `unaccent`) | Transactions solides, recherche floue, verrous de ligne. |
| Cache / files | **Redis 7** | Cache du cours, limitation de débit, files d'attente. |
| Lightning | **Passerelle Node.js 22 + `@getalby/sdk` (NWC, NIP-47)** | Bibliothèque NWC de référence, maintenue, non-custodial ; isolée du reste (moindre privilège). |
| Front | **React 19 + TypeScript + Vite**, TanStack Query, React Router, i18next, Tailwind CSS, Radix UI, Lucide, `vite-plugin-pwa` (Workbox) | Rapide, léger, PWA installable, rechargement silencieux natif (TanStack Query). |
| QR | Génération côté client (`qrcode`) | Pas d'aller-retour serveur, fonctionne même si le réseau ralentit. |
| Audio | ffmpeg (worker), MP3 48 kb/s mono | Lecture universelle, fichiers minuscules. |
| Tests | Pest (PHP), Vitest (front), Playwright (E2E, temps réel, captures) | Voir section 15. |
| Infra | Docker Compose, Caddy, GitHub Actions | Une commande pour tout lancer ; HTTPS automatique. |

### 9.3 Passerelle Lightning (service interne)
- Accessible **uniquement** sur le réseau interne Docker ; chaque requête de l'API est signée (HMAC-SHA256 + horodatage, fenêtre de 30 s, anti-rejeu).
- Ne possède **aucune base de données** : l'API lui transmet les connexions NWC (déchiffrées en mémoire uniquement) ; au redémarrage, elle les redemande à l'API.
- Fonctions : `make_invoice`, `lookup_invoice`, `get_balance`, `list_transactions`, `pay_invoice` (avec contrôle du budget), `get_info` ;
  abonnement aux **notifications** `payment_received` → appel signé vers l'API, qui **revérifie** par `lookup_invoice` avant de valider.
- Délais d'attente et reprises bornés ; un portefeuille injoignable ne bloque jamais les autres boutiques.

### 9.4 Organisation du dépôt
```
SatsPoint/
├── api/                 Laravel (API, Reverb, files, planificateur)
├── web/                 PWA React + TypeScript
├── lightning-gateway/   Passerelle NWC (Node + TypeScript)
├── infra/               Caddyfile, Dockerfiles, scripts
├── tests/e2e/           Playwright (parcours, temps réel, captures, PARCOURS.md, RAPPORT.md)
├── docs/                Cahier des charges, directives, THREAT_MODEL.md, architecture
├── tools/video/         Script et génération de la voix off
├── docker-compose.yml
├── .env.example         (aucune valeur secrète)
└── README.md
```

## 10. Modèle de données

Identifiant interne `bigint` + **identifiant public `ulid`** (seul exposé dans l'API et les URL). Toutes les tables métier ont `boutique_id`
(clé étrangère, indexée) et un **scope global** qui impose le filtrage par boutique.

| Table | Colonnes principales | Index / contraintes |
|---|---|---|
| `users` | ulid, nom, email, telephone, password, role_plateforme (`super_admin`/null), langue_ui, langue_audio, theme, aide_vocale, two_factor_secret (chiffré), derniere_connexion_at | email unique, téléphone unique |
| `boutiques` | ulid, nom, telephone, ville, fuseau, devise, statut (`active`/`suspendue`), reglages (jsonb : expiration_facture, montant_max, moyens actifs, message_recu), sequence_vente | ulid unique |
| `membres` | boutique_id, user_id, role (`proprietaire`/`gerant`/`caissier`), actif, pin_hash, invite_par | unique (boutique_id, user_id) |
| `invitations` | boutique_id, contact, role, jeton_hash, expire_at, acceptee_at | jeton_hash unique |
| `connexions_wallet` | boutique_id, uri_chiffree, pubkey_wallet, relais, permissions (jsonb), budget_sats, statut, verifiee_at | unique (boutique_id) |
| `comptes_paytech` | boutique_id, api_key_chiffree, api_secret_chiffree, environnement, statut, verifie_at | unique (boutique_id) |
| `articles` (P1) | boutique_id, ulid, nom, prix_xof, categorie, couleur, sku, actif, position | (boutique_id, actif, position), trigramme sur nom |
| `ventes` | ulid, boutique_id, numero, caissier_id, montant_xof, note, statut, payee_at, paiement_reussi_id, recu_jeton, alerte (`trop_percu`/`payee_apres_annulation`/null) | unique (boutique_id, numero), (boutique_id, created_at), (boutique_id, statut), recu_jeton unique |
| `lignes_vente` | vente_id, article_id (null), libelle, quantite, prix_unitaire_xof | vente_id |
| `paiements` | ulid, boutique_id, vente_id, methode (`lightning`/`paytech`/`wave_manuel`), statut, montant_xof, montant_sats, cours_xof_par_btc, bolt11, payment_hash, expire_at, paytech_token, paytech_ref, operateur (`wave`/`orange_money`/`free_money`), confirme_par, confirme_at | payment_hash unique, paytech_ref unique, (vente_id, statut), (statut, expire_at) |
| `evenements_paiement` | paiement_id, source (`nwc`/`paytech_ipn`/`verification`/`manuel`), type, empreinte_payload, recu_at | unique (source, empreinte_payload) → idempotence |
| `cours_change` | source, btc_eur, btc_xof, recupere_at | recupere_at |
| `cles_audio` | cle, ecran, contexte, texte_fr, texte_en, essentielle, ordre, presente_dans_code | cle unique |
| `audios` | cle_audio_id, langue, chemin, empreinte, duree_ms, taille, statut (`brouillon`/`publie`), enregistre_par, publie_at | unique (cle_audio_id, langue, statut='publie') |
| `recherches_recentes` | user_id, terme, created_at | (user_id, created_at) — 10 conservées, 4 affichées |
| `imports` | boutique_id, user_id, type, fichier, correspondance (jsonb), statut, rapport (jsonb) | boutique_id |
| `journal_audit` | user_id, boutique_id, action, cible_type, cible_id, ip, details (jsonb, **sans secret**), created_at | (boutique_id, created_at), (action, created_at) |
| `pays` (§ 6.19) | code (ISO2, clé), nom_fr, nom_en, indicatif, devise `XOF`, actif, ordre | code primaire ; `boutiques.pays` → `pays.code` |
| `langues` | code (`[a-z]{2,8}(-[a-z]{2,3})?`), nom_local, nom_fr, nom_en, pays (jsonb, `[]` = tous), actif, ordre | code unique ; `audios.langue` → `langues.code` |
| `moyens_paiement` | ulid, pays, nom, type (`lien`/`numero`), couleur (liste fermée), instructions_fr/en, actif, ordre | unique (pays, nom) |
| `moyens_paiement_boutique` | boutique_id, moyen_paiement_id, valeur (numéro ou lien marchand, en clair : donnée publique), active | unique (boutique_id, moyen_paiement_id), scope boutique |

## 11. API

Préfixe `/api/v1`, JSON, authentification par session (cookie) + CSRF, réponses via API Resources (champs strictement nécessaires),
erreurs au format `{ "message": "...", "code": "..." }` sans détail technique. Chaque route est protégée par une **Policy**.

| Domaine | Routes principales |
|---|---|
| Auth | `POST /auth/inscription`, `POST /auth/connexion`, `POST /auth/deconnexion`, `POST /auth/mot-de-passe/oubli`, `POST /auth/mot-de-passe/reinitialisation`, `GET /moi`, `PATCH /moi/preferences`, `POST /auth/2fa/*` |
| Boutique | `GET/PATCH /boutique`, `PUT /boutique/wallet`, `POST /boutique/wallet/verifier`, `DELETE /boutique/wallet`, `PUT /boutique/paytech`, `POST /boutique/paytech/verifier`, `DELETE /boutique/paytech` |
| Caisse / ventes | `GET /ventes`, `POST /ventes` (crée la vente + 1re tentative), `GET /ventes/{ulid}`, `POST /ventes/{ulid}/annuler`, `POST /ventes/{ulid}/paiements` (nouvelle tentative : méthode), `GET /paiements/{ulid}` (statut), `POST /paiements/{ulid}/verifier`, `POST /paiements/{ulid}/confirmer-manuellement` |
| Cours | `GET /cours` (dernier cours + âge) |
| Portefeuille | `GET /wallet/solde`, `GET /wallet/transactions`, `POST /wallet/recevoir`, `POST /wallet/envoyer/apercu`, `POST /wallet/envoyer` |
| Tableau de bord | `GET /tableau-de-bord?periode=` |
| Articles (P1) | CRUD `/articles`, `POST /articles/ordre` |
| Équipe | `GET/POST /equipe`, `PATCH/DELETE /equipe/{ulid}`, `POST /invitations/{jeton}/accepter` |
| Recherche (P1) | `GET /recherche?q=`, `GET /recherche/recentes`, `DELETE /recherche/recentes` |
| Import / export | `POST /imports/analyser`, `POST /imports/{ulid}/executer`, `GET /imports/{ulid}`, `GET /exports/ventes?format=&filtres…` |
| Audio (public) | `GET /audio/manifeste/{langue}` (cache court + ETag), fichiers `GET /audio/{langue}/{cle}.{empreinte}.mp3` (cache immuable 1 an) |
| Reçu (public) | `GET /r/{jeton}` |
| Webhooks | `POST /webhooks/paytech/{boutique_ulid}` |
| Admin plateforme | `GET /admin/boutiques`, `PATCH /admin/boutiques/{ulid}`, `GET /admin/sante`, `GET /admin/journal`, `GET /admin/audio/matrice`, `POST /admin/audio` (upload), `POST /admin/audio/publier`, `DELETE /admin/audio/{id}` |
| Interne (passerelle) | `POST /internal/lightning/evenement` (signé HMAC, réseau interne uniquement), `GET /internal/lightning/connexions` |

## 12. Temps réel

Application stricte de [DIRECTIVES.md § 3](DIRECTIVES.md#3-synchronisation-temps-réel-exigence-de-base).

| Canal | Qui peut écouter | Rubriques |
|---|---|---|
| `private-boutique.{ulid}` | Membres actifs de la boutique (vérifié à l'autorisation) | `ventes`, `paiements`, `articles`, `equipe`, `parametres`, `wallet`, `imports` |
| `private-user.{ulid}` | L'utilisateur lui-même | `preferences`, `sessions` |
| `plateforme` (public) | Tout le monde | `audios` (nouveau manifeste publié), `catalogues` (pays, langues, moyens de paiement par pays) |
| `private-admin` | `super_admin` | `boutiques`, `sante`, `audio` |

- Signal = `{ rubrique, auteur, horodatage }`, **jamais de donnée métier**.
- Émis par **un seul middleware** après la réponse, seulement si la requête a réellement écrit en base (compteur d'écritures sur les modèles métier ; écritures techniques exclues) ;
  les confirmations de paiement venant de la passerelle ou de PayTech émettent par le **même service** d'émission.
- L'écran d'encaissement écoute `paiements` et relit `GET /paiements/{ulid}` → écran vert. Objectif : **< 2 s** entre le règlement et l'écran vert.
- Échec d'émission journalisé, jamais propagé à l'utilisateur.

## 13. Sécurité

Application stricte des **12 règles** de [DIRECTIVES.md § 2](DIRECTIVES.md#2-sécurité-priorité-absolue). Mesures spécifiques :

### 13.1 Argent et Bitcoin
- **Non-custodial** : aucune clé privée, graine ou fonds détenus par SatsPoint.
- Secret NWC et clés PayTech **chiffrés en base** (AES-256-GCM, clé dédiée `DATA_ENCRYPTION_KEY` distincte de `APP_KEY`), déchiffrés en mémoire au moment de l'usage, jamais renvoyés au navigateur (le front ne voit que « connecté / non connecté » et les permissions).
- Permissions NWC recommandées à la connexion : `make_invoice`, `lookup_invoice`, `get_balance`, `list_transactions` ; `pay_invoice` seulement si le propriétaire veut envoyer depuis SatsPoint, **avec budget**.
- Statut « payé » décidé **uniquement côté serveur**, après vérification auprès du portefeuille (Lightning) ou validation de l'IPN (PayTech) ; jamais sur la parole du navigateur.
- Envoi de sats : propriétaire uniquement, confirmation par mot de passe/PIN, aperçu obligatoire, plafond, journal d'audit.
- IPN PayTech : vérification de l'authenticité, du montant, de la devise et de la référence ; rejet silencieux (200 sans effet, journalisé) des notifications invalides ; idempotence.

### 13.2 Application
- Autorisation : Policies Laravel sur **chaque** route ; test automatique qui parcourt toutes les routes et vérifie le refus pour un utilisateur d'une autre boutique (**test anti-IDOR**) et pour chaque rôle non autorisé.
- Cloisonnement : scope global `boutique` obligatoire ; une requête sans boutique courante lève une exception.
- Entrées : Form Requests (types, longueurs, bornes, listes autorisées) ; montants entiers bornés ; BOLT11 décodé et vérifié avant envoi.
- Fichiers audio et imports : taille max, vérification du **type réel** (signature du fichier, pas l'extension), nom de fichier généré par le serveur, stockage hors racine web, traitement ffmpeg avec paramètres figés et délai maximal.
- Limitation de débit (Redis) :

| Point | Limite |
|---|---|
| Connexion | 5 / min par identifiant + 20 / min par IP, puis blocage progressif |
| Mot de passe oublié | 3 / heure par identifiant |
| Création de vente / facture | 30 / min par utilisateur |
| Vérification de paiement | 20 / min par paiement |
| Webhook PayTech | 60 / min par boutique |
| Recherche | 60 / min par utilisateur |
| Upload audio | 120 / heure (super-admin) |
| Reçu public | 60 / min par IP |

- En-têtes : HSTS (1 an, preload), CSP stricte (`default-src 'self'`, pas d'`unsafe-inline` pour les scripts, `connect-src` limité à l'API et au WebSocket), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (micro autorisé seulement sur le studio audio, caméra seulement pour le scan de QR).
- CORS : liste explicite des origines, **testée** avant chaque déploiement.
- Journal d'audit : connexions (réussies/échouées), changements de rôle, connexion/révocation du portefeuille, configuration PayTech, envois de sats, confirmations manuelles, annulations, publications audio, suspensions de boutique.
- Logs : aucune donnée personnelle, aucun secret, aucune facture complète (seulement les 8 premiers caractères du `payment_hash`).
- Dépendances : `composer audit` et `npm audit` en CI, versions figées (lockfiles), mises à jour de sécurité hebdomadaires.
- Sauvegardes PostgreSQL chiffrées quotidiennes, restauration testée.

### 13.3 Modèle de menaces
Rédigé dans `docs/THREAT_MODEL.md` (méthode STRIDE). Menaces prioritaires et parades :

| Menace | Parade |
|---|---|
| Faux écran « payé » (client malveillant qui montre une capture) | Seul l'écran SatsPoint du commerçant fait foi, statut décidé côté serveur |
| Fausse IPN PayTech | Vérification d'authenticité + montant + référence + idempotence |
| Vol du secret NWC (fuite de base) | Chiffrement avec clé séparée, permissions minimales, budget, révocation en un clic |
| Caissier qui vide le portefeuille | `pay_invoice` réservé au propriétaire + confirmation + budget |
| Accès aux ventes d'une autre boutique (IDOR) | ULID + Policies + scope global + test automatique |
| Rejeu de requêtes vers la passerelle | HMAC + horodatage + nonce, réseau interne uniquement |
| Brute-force des comptes | Limitation de débit, mots de passe forts, 2FA |
| Audio malveillant déposé | Vérification de type, ré-encodage ffmpeg systématique, réservé au super-admin avec 2FA |
| Manipulation du cours | Médiane de 3 sources, écart max 2 %, cours figé par facture |
| Double paiement / course | Transactions + verrous + gestion explicite du trop-perçu |

## 14. Performance

| Indicateur | Objectif |
|---|---|
| JavaScript initial (compressé) | ≤ 170 Ko ; écrans secondaires chargés à la demande |
| LCP sur « Slow 4G », Android de milieu de gamme | ≤ 2,5 s ; ≤ 3 s en 3G |
| Interaction (INP) | ≤ 200 ms |
| API, 95e centile | ≤ 200 ms (hors appels au portefeuille) |
| Création de facture Lightning | ≤ 2 s (dépend du relais Nostr) |
| Règlement → écran vert | ≤ 2 s |
| Recherche globale | ≤ 150 ms serveur |

Moyens : index sur toutes les colonnes filtrées, pas de N+1 (chargements groupés, test qui échoue en cas de requête paresseuse), pagination par numéro de page bornée (10 à 100 lignes, 10 000 pages au plus),
cache Redis du cours et du manifeste audio, compression Brotli, polices sous-ensemble, images légères, service worker (coquille de l'application en cache),
préchargement de l'écran de paiement pendant la saisie du montant.

## 15. Tests, qualité et audits

Application de [DIRECTIVES.md § 4](DIRECTIVES.md#4-tests-de-bout-en-bout-playwright).

| Niveau | Outil | Couverture minimale |
|---|---|---|
| Unitaires | Pest / Vitest | Conversion et arrondis, transitions d'état, vérification IPN, décodage BOLT11, correspondance des colonnes d'import |
| API | Pest (feature) | Chaque route : succès, validation, 401, 403 par rôle, **anti-IDOR inter-boutiques**, limitation de débit |
| Passerelle | Vitest + portefeuille NWC simulé | Création, vérification, notifications, erreurs, signature HMAC |
| E2E | Playwright | Parcours métier (inscription → démarrage → encaissement Lightning → encaissement mobile money → reçu → tableau de bord → portefeuille → équipe → studio audio), **tous les boutons**, rôles interdits, zéro erreur console, zéro 4xx/5xx inattendu |
| Temps réel | Playwright à 2 navigateurs | Les **6 tests obligatoires** des directives |
| Accessibilité | axe-core dans Playwright | Zéro violation sérieuse |
| Performance | Lighthouse CI | Budgets de la section 14 |
| Sécurité | `composer audit`, `npm audit`, en-têtes testés, scan OWASP ZAP (base) avant mise en ligne | Zéro vulnérabilité haute ou critique |

- **Paiements réels** : un test manuel scripté (checklist) sur le vrai réseau Lightning avec 100 FCFA et sur PayTech avec un petit montant, avant chaque mise en production.
- Rapport : `tests/e2e/RAPPORT.md` + captures `captures/<date>/` (1366×768 et 390×844).
- CI GitHub Actions : lint, typage, tests unitaires/API, audit des dépendances à chaque push ; E2E avant chaque déploiement.

## 16. Déploiement et exploitation

- **Environnements** : local (Docker Compose), test (base dédiée, données `TEST-E2E-`), production.

### 16.1 Installation en une commande, sans aucune configuration
Exigence du jury : *one-command setup, seed data, testable happy path*. Un juge qui clone le dépôt n'a ni portefeuille NWC ni clés PayTech.
- `docker compose up` démarre **tout**, crée la base, charge les données de démonstration et affiche l'adresse et les comptes de démo dans la console.
- **Sans `DEMO_NWC_URI`** : la boutique de démo utilise un **portefeuille simulé** intégré à la passerelle Lightning (connexion `mock://demo`, voir [CONTRAT_PASSERELLE.md](CONTRAT_PASSERELLE.md) § 4) : mêmes routes, mêmes événements qu'un vrai portefeuille. Le parcours complet fonctionne : facture, QR, bouton « Simuler le paiement », écran vert.
- **Sans clés PayTech** : le mobile money passe en mode simulé de la même façon (page de paiement factice + notification signée).
- Le mode simulé est **affiché en permanence** par un bandeau « Mode démo : paiements simulés ». Il est **impossible à activer en production** (refus au démarrage).
- **Avec les variables renseignées** : intégrations réelles (Lightning mainnet, PayTech). C'est ce que montre la démo en ligne.
- Le README contient un encadré « Testez en 2 minutes » : commande, adresse, comptes, puis les 4 gestes du parcours heureux.
- **Production** : une URL publique en HTTPS est **obligatoire** pour l'IPN PayTech et pour que les juges testent ; un nom de domaine payant ne l'est **pas**.
  Choix retenu (budget zéro) et procédure : § 16.2.

### 16.2 Mise en ligne gratuite : Render + Neon (choix retenu)

**Architecture en ligne** : **une seule URL** `https://<service>.onrender.com`, **une seule image Docker** (`infra/api.Dockerfile`, cible `all`)
et un seul service web Render (offre gratuite : 512 Mo de RAM, 0,1 CPU). Pas de Netlify : le front compilé est servi par Caddy dans la même image,
donc **même origine** pour la PWA, l'API, les cookies de session Sanctum et le WebSocket (`/app`) — ni CORS, ni cookie tiers, ni proxy externe.

| Processus (supervisord, utilisateur non-root) | Écoute | Rôle |
|---|---|---|
| Caddy + PHP 8.3 (FrankenPHP, 4 fils) | `0.0.0.0:$PORT` (10000) | PWA, `/api`, `/sanctum`, `/broadcasting`, `/r`, `/webhooks`, `/audio`, `/internal`, `/sante`, `/up` ; `/app/*` → Reverb |
| Reverb | `127.0.0.1:8080` | WebSocket (protocole Pusher) |
| Worker de files (`--memory=96`) | — | files `paiements`, `audio`, `imports`, `default` (pilote `database`) |
| Planificateur (`schedule:work`) | — | cours toutes les minutes, expirations |
| Passerelle Lightning (Node 22) | `127.0.0.1:3011` | NWC ; rappelle l'API par `http://127.0.0.1:$PORT/internal/…` (HMAC) |

- **Base** sur **Neon** (PostgreSQL géré, gratuit sans expiration, sans carte bancaire, 100 CU-heures/mois, mise en veille après 5 min sans requête) via `DATABASE_URL` (`?sslmode=require`).
  **Pas de Redis** : cache (cours, limites de débit, nonces HMAC anti-rejeu), files et sessions sont **en base** (tables `cache`, `cache_locks`,
  `jobs`, `failed_jobs`, `sessions` créées par les migrations).
- Les adresses publiques (`APP_URL`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `REVERB_PUBLIC_HOST`, base des IPN PayTech) sont **déduites
  au démarrage** de `RENDER_EXTERNAL_URL` (fourni par Render) ; on ne les renseigne que pour un domaine personnalisé.
- Mémoire mesurée localement (image `all`, `mem_limit` 512 Mo, démo simulée, 8/11/2026) : **≈ 214 Mo** après un parcours d'encaissement complet,
  **≈ 222 Mo** sous 600 requêtes concurrentes ; budget **≤ 400 Mo** sur 512 (réglages : 4 fils PHP, OPcache 64 Mo, worker `--memory=96`, Node `--max-old-space-size=96`).
- Repli si les limites gratuites ne suffisent pas : **Oracle Cloud « Always Free »** ou **GitHub Student Developer Pack** (même image, ou `docker compose up`).

**Procédure pas à pas** (une seule fois, ~20 min) :

1. **Comptes** (gratuits, sans carte bancaire) : créer un compte **GitHub** (dépôt `SatsPoint` poussé), puis **Neon** (neon.com → *Sign up* →
   *Continue with GitHub*) et **Render** (render.com → *Get started* → *GitHub*). Sur Render, autoriser l'accès au dépôt `SatsPoint`.
2. **Base Neon** : *New project* → nom `satspoint`, PostgreSQL 16, région **AWS Europe Central 1 (Frankfurt)** (la même que Render).
   Dans le *compute* de la branche principale (*Branches → production → Edit*), régler l'autoscaling sur **0,25 ↔ 0,25 CU** pour économiser les CU-heures.
   *Connect* → décocher **Connection pooling** (connexion **directe**, nécessaire aux processus permanents) → copier la chaîne
   `postgresql://neondb_owner:…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require` (le paramètre `channel_binding` éventuel peut rester).
3. **Blueprint Render** : *New* → **Blueprint** → choisir le dépôt → Render lit `infra/render.yaml` (indiquer ce chemin si demandé : *Blueprint Path*).
4. **Variables demandées** (`sync: false`) :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | la chaîne Neon de l'étape 2 |
   | `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | adresse et mot de passe (≥ 12 caractères) de la propriétaire |
   | `DEMO_PASSWORD` | mot de passe (≥ 12) des comptes démo `demo@satspoint.local` et `caissier@satspoint.local` — **obligatoire** (sinon régénéré à chaque démarrage) |
   | `DEMO_NWC_URI` | lien Nostr Wallet Connect **Coinos** de la boutique démo (réception seule, budget) ; vide = portefeuille simulé (mettre alors `ALLOW_MOCK_WALLET=true`) |
   | `PAYTECH_API_KEY` / `PAYTECH_API_SECRET` | clés PayTech (mode test) ; vide = mobile money simulé |

   Les secrets techniques (`APP_KEY`, `DATA_ENCRYPTION_KEY`, `GATEWAY_HMAC_SECRET`, `REVERB_APP_SECRET`) sont **générés par Render** (`generateValue`).
   **Ne jamais régénérer `DATA_ENCRYPTION_KEY`** ensuite : les URI NWC, clés PayTech et secrets 2FA chiffrés deviendraient illisibles.
5. *Apply* : premier build ~10 min (front, Composer, passerelle). Au démarrage : migrations, registre des clés vocales, données de démo.
   Vérifier `https://<service>.onrender.com/sante` → `base`, `redis` (= cache), `reverb`, `passerelle` à `true` et `/api/v1/config`.
6. **Première connexion super-admin** : ouvrir l'URL, se connecter avec `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`, **activer la 2FA**
   (obligatoire pour la console plateforme), enregistrer les audios essentiels dans le studio. Tester le parcours démo (1 500 FCFA).
7. **PayTech** : dans le tableau de bord PayTech, l'IPN est `https://<service>.onrender.com/webhooks/paytech/{boutique}` (posée automatiquement à chaque demande).
8. **Réveil** : Render endort un service gratuit après 15 min sans trafic (réveil ≈ 1 min). Sur **cron-job.org** (compte gratuit) : *Create cronjob*
   → URL `https://<service>.onrender.com/up`, **toutes les 10 minutes**, méthode GET, alerte e-mail en cas d'échec.
   Budget Neon : service éveillé en permanence ≈ 0,25 CU × 24 h = **6 CU-h/jour** → 100 CU-h ≈ **16 jours** : n'activer le ping que pendant la
   période de jugement (ping désactivé, Render et Neon s'endorment et ne consomment presque rien).
9. Mises à jour : chaque `git push` sur la branche suivie (`main`) redéploie (`autoDeploy`, filtré sur `api/`, `web/`, `lightning-gateway/`, `infra/`).

**Limites connues de l'offre gratuite** : disque **non persistant** (effacé à chaque redéploiement ou réveil). Conséquence traitée : **les audios
du studio sont désormais stockés en base** (Neon, table `audio_fichiers`, bytea ; brouillons compris, dès la fin du traitement ffmpeg) et les
**rapports d'import aussi** (`imports.rapport`) ; le disque n'est plus qu'un cache reconstruit à la demande (`storage/app/cache-audio`). Seuls
les fichiers en transit peuvent être perdus par un redémarrage : un audio déposé mais pas encore traité passe en `erreur` « Renvoyez
l'enregistrement » (`audio:nettoyer`, au démarrage et toutes les 5 min), un fichier d'import analysé mais pas encore exécuté est à renvoyer.
Sauvegarde du travail d'enregistrement hors de la base : `php artisan audio:exporter {dossier}` / `audio:importer {dossier}` (voir `api/README.md`).
Volume : MP3 de 5 à 30 Ko (~220 clés × 5 langues ≈ 20 à 30 Mo au plus, archives comprises), très en deçà des 0,5 Go de Neon gratuit. Autres limites : un seul processus de chaque type ;
CPU faible (premier affichage après réveil ≈ 1 min).

### 16.3 Exploitation

- **Développement** : tout tourne en local ; pour recevoir l'IPN PayTech pendant les tests, tunnel temporaire gratuit (Cloudflare Quick Tunnel).
- **Auto-hébergement** (VPS, Oracle) : `git pull` + `docker compose up -d --build` (un conteneur par rôle, Redis) ou l'image `all` seule.
- Comptes créés automatiquement par les seeders **à partir de variables d'environnement** (jamais de mot de passe dans le dépôt) :
  super-admin de la propriétaire, boutique de démonstration « Boutique Démo » avec un propriétaire et un caissier de démonstration
  (portefeuille de démo **sans permission d'envoi** pour les juges).
- Surveillance : `GET /sante` (base, cache — Redis ou base —, Reverb, passerelle, âge du cours), alerte de disponibilité externe (cron-job.org), journaux sur la sortie standard (Render les conserve).
- Sauvegardes : base chiffrée quotidienne, 14 jours conservés, audios sauvegardés avec la base.

## 17. Livrables du hackathon

| Livrable | Contenu |
|---|---|
| Dépôt GitHub public | Code complet, licence MIT, historique de commits clair |
| `README.md` | Problème, utilisateur principal, avant / après, solution, captures, **schéma d'architecture**, « Testez en 2 minutes », installation en une commande, comptes de démo, **contraintes et limites connues**, **indicateurs suivis**, **prochaine itération**, mesures de performance |
| `docs/THREAT_MODEL.md` | Modèle de menaces STRIDE |
| MVP en ligne | URL HTTPS publique, vrai réseau Lightning, PayTech |
| Vidéo de 3 min | **Dans l'ordre exigé par le jury** : problème (30 s) → solution, démontrée en vrai sur téléphone, sécurité comprise (1 min 30) → impact et portée (30 s) → prochaines étapes (30 s). Voix off `fr-FR-VivienneMultilingualNeural` selon les directives ; sous-titres anglais (jury en partie anglophone) |
| Page Devpost | Texte déjà rédigé (à aligner sur ce qui est réellement livré) |

## 18. Planning

Aujourd'hui : dimanche 8 novembre (J0). Soumission : vendredi 20 novembre avant 20 h 00 (heure de Dakar = UTC).

| Jour | Date | Objectif | Résultat vérifiable |
|---|---|---|---|
| J0 | 8 nov. | Cahier des charges, directives, dépôt | Documents poussés sur GitHub |
| J1 | 9 nov. | Socle : Docker Compose, Laravel, React PWA, design system, i18n FR/EN, thèmes, CI | `docker compose up` affiche l'application, CI verte |
| J2 | 10 nov. | Comptes, boutiques, rôles, Policies, scope, journal d'audit, en-têtes, temps réel (middleware + hook) | Tests anti-IDOR verts ; 2 navigateurs synchronisés |
| J3 | 11 nov. | Passerelle Lightning NWC, cours de change, connexion du portefeuille | Facture créée sur le vrai portefeuille |
| J4 | 12 nov. | Caisse + paiement Lightning de bout en bout + écran de succès | 100 FCFA payés depuis un téléphone → écran vert < 2 s |
| J5 | 13 nov. | PayTech (demande + IPN + vérification) + reçus | Paiement Wave réel confirmé automatiquement |
| J6 | 14 nov. | Aide vocale : lecteur, registre des clés, sélecteur de langue parlé, annonces | Haut-parleurs visibles et fonctionnels sur la caisse |
| J7 | 15 nov. | Studio audio : matrice, enregistrement, traitement ffmpeg, publication | Un audio enregistré dans le studio est entendu sur un autre appareil |
| J8 | 16 nov. | Tableau de bord, ventes, portefeuille (solde/recevoir/envoyer/historique), équipe | Parcours propriétaire + caissier complet |
| J9 | 17 nov. | Mise en production (VPS, domaine, HTTPS), comptes de démo ; recherche globale et import/export (P1) | URL publique accessible aux juges |
| J10 | 18 nov. | Tests Playwright complets, audit sécurité, audit performance, corrections | `RAPPORT.md`, zéro défaut bloquant |
| J11 | 19 nov. | **Enregistrement des audios par la propriétaire** (mode rafale), vidéo, README, schéma, THREAT_MODEL, texte Devpost final | Vidéo publiée, documentation complète |
| J12 | 20 nov. | Marge, dernières corrections, **soumission avant 18 h** (2 h de marge) | Soumission Devpost validée |

## 19. Risques et parades

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| Relais Nostr lent ou indisponible | Moyenne | Élevé | Relais du portefeuille + délai borné + message clair + mobile money toujours disponible |
| Compte PayTech pas encore en production / IPN non reçue | Moyenne | Élevé | Vérifier le statut du compte dès J1 ; tester l'IPN dès que l'URL publique existe (J5 avec un tunnel temporaire si besoin) ; lien Wave direct en secours |
| Retard sur le planning | Élevée | Élevé | Priorités P0/P1 strictes ; P1 sacrifiés en premier ; gel des fonctionnalités le 18 au soir |
| Charge d'enregistrement des audios | Moyenne | Moyen | Clés « essentielles » d'abord (~120 enregistrements), mode rafale, traitement automatique |
| Juges sans portefeuille Lightning | Faible | Moyen | Vidéo de démo + paiement mobile money + mode d'emploi pour installer un portefeuille en 1 min |
| Volatilité du cours | Faible | Faible | Cours figé par facture, expiration courte, arrondi au sat supérieur |
| Éligibilité (« Students only » sur Devpost) | À confirmer | Élevé | Écrire à l'organisateur pour confirmation écrite |

## 20. Critères d'acceptation

Le MVP est **accepté** quand :
1. Une personne crée sa boutique, connecte son portefeuille NWC et réussit un paiement test de 100 FCFA **sans aide**, en moins de 5 minutes.
2. Un paiement Lightning réel s'affiche en vert sur l'écran du commerçant **moins de 2 s** après le règlement, et apparaît **sans rechargement** sur le tableau de bord du propriétaire ouvert sur un autre appareil.
3. Un paiement Wave réel via PayTech est confirmé **automatiquement**.
4. Un caissier ne peut ni voir le solde, ni envoyer de sats, ni accéder aux réglages — ni par le menu, ni en tapant l'adresse, ni par l'API.
5. Un utilisateur d'une boutique A ne peut lire aucune donnée de la boutique B (test automatique sur toutes les routes).
6. Tous les boutons du parcours d'encaissement ont un haut-parleur qui lit l'audio dans les 4 langues locales ; le sélecteur de langue est parlé.
7. Un audio publié dans le studio est disponible sur les autres appareils sans réinstallation.
8. L'application fonctionne en clair et en sombre, en français et en anglais, à 390 px et à 1366 px.
9. `docker compose up` lance tout avec des données de démonstration.
10. Les 6 tests temps réel et les parcours Playwright sont verts ; zéro erreur console ; zéro vulnérabilité haute ou critique.
11. README, schéma d'architecture, THREAT_MODEL et vidéo de 3 minutes sont publiés.

## 21. Évolutions après le hackathon

- Conversion des sats en FCFA vers le mobile money via un partenaire local (rampe de sortie).
- Montants lus à voix haute ; interface entièrement pilotable à la voix.
- Paiement hors ligne et confirmations par SMS/USSD pour les zones peu couvertes.
- Module de paiement pour boutiques en ligne (même encaissement intégré à un site e-commerce).
- Impression de reçus sur imprimante thermique Bluetooth.
- Remboursements, remises, pourboires, TVA.
- Plusieurs boutiques par propriétaire.
- **Pilote** : 10 commerçants dans un quartier de Dakar ; indicateurs : commerçants actifs par semaine, paiements par commerçant et par semaine, délai médian de confirmation, part des ventes en sats / mobile money.

## 22. Glossaire

| Terme | Définition simple |
|---|---|
| **Bitcoin (BTC)** | Monnaie numérique. |
| **Sat (satoshi)** | Plus petite unité du bitcoin : 1 BTC = 100 000 000 sats. |
| **Lightning** | Réseau de paiement rapide au-dessus de Bitcoin : paiements en quelques secondes, frais minimes. |
| **Facture Lightning (BOLT11)** | Demande de paiement d'un montant précis, sous forme de texte ou de QR, valable un temps limité. |
| **Portefeuille (wallet)** | Application qui garde les bitcoins de son propriétaire. |
| **Non-custodial** | SatsPoint ne garde jamais l'argent : il reste dans le portefeuille du commerçant. |
| **Nostr Wallet Connect (NWC)** | Protocole qui permet à SatsPoint de demander au portefeuille du commerçant de créer des factures, avec des droits limités et révocables. |
| **Relais Nostr** | Serveur qui transmet les messages chiffrés entre SatsPoint et le portefeuille. |
| **PayTech** | Agrégateur sénégalais de paiements (Wave, Orange Money, Free Money, carte). |
| **IPN** | Notification envoyée par PayTech au serveur de SatsPoint quand un paiement est confirmé. |
| **PWA** | Site web installable comme une application, rapide et utilisable sur tout téléphone. |
| **IDOR** | Faille qui permet d'accéder aux données d'un autre en changeant un identifiant. |

## 23. Décisions prises et points ouverts

### Décisions prises
- Nom : **SatsPoint**. Dépôt : `C:\SatsPoint` ↔ GitHub `makaGit10/SatsPoint`, commit et push à chaque étape.
- **Vrai réseau Lightning** (mainnet) avec de petits montants pour la démo.
- Lightning via **Nostr Wallet Connect** (non-custodial). Mobile money via **PayTech** ; lien Wave direct en option.
- Base de données **PostgreSQL** (identifiants de développement dans le `.env` local uniquement).
- Interface FR/EN, thèmes clair/sombre, aide vocale wolof / sérère / pulaar / diola (+ français).

### Points ouverts (à trancher)
| # | Question | Qui | Pour quand |
|---|---|---|---|
| 1 | **Activation PayTech en production** : vérifié le 8 nov. — le mode test fonctionne, la production renvoie « contactez le support pour activer votre compte ». Contacter support@paytech.sn / WhatsApp. Développement en mode test en attendant. | Propriétaire | Au plus tôt |
| 2 | Profil Devpost : passer de « Professional » à « Student (college / university) » | Propriétaire | Au plus tôt |

### À faire par la propriétaire (liste vivante)
| Quand | Quoi | État |
|---|---|---|
| Dès que possible | Profil Devpost : passer de « Professional » à « Student (college / university) » | ⏳ |
| Dès que possible | WhatsApp à PayTech (+221 77 125 57 99) pour activer la production — non bloquant pour le hackathon | ⏳ |
| Avant J4 (12 nov.) | Obtenir ~1 100 sats dans Wallet of Satoshi (Banxaas : bouton « Troc » grisé le 9 nov. à 2 h, réessayer en journée ; plan B : communauté du hackathon) | ⏳ |
| J11 (19 nov.) | Enregistrer les audios wolof / sérère / pulaar / diola dans le studio (~1 h 30, clés essentielles d'abord) | ⏳ |
| Avant la démo publique | Révoquer la connexion Coinos actuelle (passée dans le chat, et elle autorise `pay_invoice`) et en recréer une **avec le budget minimal** (idéalement sans droit d'envoi), collée directement dans `.env` | ⏳ |
| Pendant toute la durée | Laisser le PC allumé avec Docker Desktop ouvert pendant que les agents travaillent | ⏳ |

### Réglés
- Adresse e-mail du compte super-admin : fournie (conservée **hors dépôt**, dans le `.env`, car le dépôt est public).
- Éligibilité : la propriétaire est étudiante (université) → éligible ; seul le profil Devpost est à corriger.
- PayTech : mode test suffisant pour le hackathon (vérifié le 8 nov. : test OK, production non activée).
- Portefeuille de développement et de démo : **Coinos** (connexion NWC) ; Alby Hub envisagé pour la démo finale.
- Hébergement : tout sur Render (une seule image : PWA + API + temps réel + passerelle) + Neon (base), voir section 16.2. Netlify abandonné (même origine plus simple et plus sûre).
