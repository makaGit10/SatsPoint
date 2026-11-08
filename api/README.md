# SatsPoint — API (Laravel 12, PHP 8.3)

Back-end de SatsPoint : comptes, boutiques, équipe, caisse, paiements Lightning (via la passerelle NWC) et mobile money (PayTech, Wave direct), reçus publics, tableau de bord, portefeuille, articles, exports, temps réel (Reverb).

Références : [`docs/CAHIER_DES_CHARGES.md`](../docs/CAHIER_DES_CHARGES.md), [`docs/DIRECTIVES.md`](../docs/DIRECTIVES.md) (12 règles de sécurité), [`docs/CONTRAT_API.md`](../docs/CONTRAT_API.md) (formes JSON front ↔ back), [`docs/CONTRAT_PASSERELLE.md`](../docs/CONTRAT_PASSERELLE.md) (API ↔ passerelle Lightning).

## Démarrage (Docker)

```bash
docker compose up -d                          # api :8120, reverb :8125, pg :5440, redis, queue, scheduler, lightning-gateway
docker compose exec api php artisan test      # suite Pest (base satspoint_test, garde-fou dans tests/bootstrap.php)
docker compose exec api composer audit        # dépendances
curl -s http://localhost:8120/sante           # { base, redis, reverb, passerelle, cours: { age_s, disponible } }
```

En développement (`COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml`), le code est monté, `vendor/` vit dans un volume Docker et la passerelle expose `127.0.0.1:3011`. Le front tourne sur l'hôte (`cd web && npm run dev` → :5190).

## Modules

| Module | Code | Rôle |
|---|---|---|
| Socle | `Services/BoutiqueCourante`, `Models/Scopes/BoutiqueScope`, `Policies/*`, `Services/Audit`, `Services/ChiffrementDonnees` | Cloisonnement par boutique (scope global obligatoire), refus par défaut, journal d'audit sans secret, AES-256-GCM avec `DATA_ENCRYPTION_KEY`. |
| Temps réel | `Http/Middleware/DiffuserEcritures`, `Services/Diffuseur`, `Events/DonneesModifiees` | Un seul point d'émission HTTP (après écriture réelle sur une table métier), même service pour les jobs et commandes. Signal = `{ rubrique, auteur, horodatage }`, jamais de donnée. |
| Cours | `Services/CoursChange`, `Console/Commands/CoursRafraichir`, `Support/Conversion` | Médiane BTC/EUR de Kraken, Bitstamp, CoinGecko (écart > 2 % écarté, source unique acceptée seulement si cohérente avec le dernier cours), × 655,957 → XOF, cache Redis 60 s, table `cours_change`, `disponible=false` au-delà de 10 min. `Conversion::xofVersSats` = arrondi au sat supérieur, en entiers. |
| Caisse | `Services/Caisse`, `Models/SequenceVente`, `Http/Controllers/Api/V1/VenteController` | Vente numérotée `V-000001` par boutique (UPSERT atomique sur `sequences_vente`), lignes facultatives (somme = montant), première tentative créée dans la même transaction. |
| Machine d'état | `Services/MachineEtatPaiement` | Transitions en transaction + `SELECT … FOR UPDATE` (paiement puis vente), idempotence par `evenements_paiement` (source + empreinte), annulation des autres tentatives, **trop-perçu** et **payée après annulation/expiration** (alertes + audit). Rien n'est jamais ignoré. |
| Lightning | `Services/PaiementsLightning`, `Services/PasserelleLightning`, `Jobs/TraiterEvenementLightning`, `Console/Commands/PaiementsExpirer` | Facture via la passerelle (msats, description `SatsPoint · {boutique} · {numéro}`, expiration = réglage), cours figé sur le paiement. `payment_received` → **revérification par lookup** (statut `reglee`, même hash, montant ≥ attendu ; montant absent/0 = repli). Expiration planifiée chaque minute. Mode simulé si la connexion est `mock://demo`. |
| PayTech | `Services/PaytechService`, `Http/Controllers/Webhooks/PaytechWebhookController`, `Http/Controllers/Api/V1/BoutiquePaytechController` | Clés par boutique (chiffrées, déchiffrées en mémoire), `request-payment`, IPN HMAC-SHA256(`{final_item_price}\|{ref_command}\|{api_key}`, api_secret) avec repli SHA-256, montant + devise + référence, boutique résolue depuis le paiement, idempotent, 200 toujours. Mode simulé sans clés. |
| Wave direct | `Services/Caisse::lienWave`, `PaiementController::confirmerManuellement` | Lien `pay.wave.com` de la boutique + `?amount=`, confirmation manuelle propriétaire/gérant auditée (`paiement.confirme_manuellement`). |
| Reçu public | `Http/Controllers/RecuController` (`GET /r/{jeton}`) | Jeton 32 caractères créé au règlement, 60/min/IP, aucune donnée personnelle. JSON si `Accept: application/json` ; sinon `index.html` du front compilé (`WEB_DIST_PATH`) ; sans front (dev) le JSON aussi. |
| Tableau de bord | `Services/TableauDeBord` | Agrégats SQL (CA, nombre, panier moyen, répartition Lightning / mobile money, série par jour local, comparaison période précédente), fuseau boutique, caissier = ses chiffres du jour. |
| Portefeuille | `Services/Portefeuille`, `WalletController`, `BoutiqueWalletController` | Solde (cache 15 s) + conversion, historique, recevoir, aperçu/envoi (propriétaire, mot de passe revérifié, `PAIEMENT_INCERTAIN` sur `DELAI_DEPASSE`, audit), connexion NWC (vérifiée par la passerelle, URI chiffrée, jamais renvoyée), révocation. |
| Articles | `ArticleController`, `Policies/ArticlePolicy` | CRUD + `POST /articles/ordre` ; caissier lecture seule ; SKU unique par boutique. |
| Export | `Services/ExportVentes` | CSV UTF-8 avec BOM, séparateur `;`, flux par paquets, filtres de la liste, injection de formule neutralisée. |

## Commandes artisan

| Commande | Planification (`routes/console.php`) | Rôle |
|---|---|---|
| `cours:rafraichir [--purger]` | chaque minute (purge > 30 j à 03:15) | Récupère le cours, calcule la médiane, met en cache. |
| `paiements:expirer` | chaque minute | Factures échues → `expire` ; ventes sans tentative depuis 30 min → `expiree` ; signaux `paiements` / `ventes`. |
| `queue:work` | conteneur `queue` | File `paiements` (événements de la passerelle). |
| `schedule:work` | conteneur `scheduler` | Exécute la planification ci-dessus (`schedule:run` pour un passage manuel). |
| `db:seed --class=DemoSeeder` | au démarrage du conteneur `api` si `DEMO_SEED=true` | Super-admin, Boutique Démo (propriétaire + caissier, 8 articles), portefeuille (`DEMO_NWC_URI` ou `mock://demo`), PayTech si clés. |

## Variables d'environnement (voir `.env.example` à la racine)

| Variable | Rôle |
|---|---|
| `APP_KEY`, `DATA_ENCRYPTION_KEY` | Clé Laravel ; clé dédiée (32 octets base64) des secrets en base (URI NWC, clés PayTech, 2FA). |
| `APP_URL`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN`, `CORS_ORIGINES_SUPPLEMENTAIRES` | URL publique de l'API (base des `ipn_url` PayTech et des reçus), origine du front (CORS, `success_url` / `cancel_url`). |
| `DB_*`, `REDIS_*`, `CACHE_STORE`, `QUEUE_CONNECTION`, `SESSION_DRIVER` | PostgreSQL, Redis (cache du cours, limites de débit, nonces HMAC, files). |
| `BROADCAST_CONNECTION`, `REVERB_*`, `REVERB_PUBLIC_*` | Temps réel. |
| `LIGHTNING_GATEWAY_URL`, `GATEWAY_HMAC_SECRET` | Passerelle Lightning (réseau interne) et secret HMAC partagé. |
| `WEB_DIST_PATH` | Dossier du front compilé servi pour `/r/{jeton}` (défaut `/app/web-dist`). |
| `PAYTECH_IPN_BASE_URL` | Base publique **HTTPS** des `ipn_url` PayTech (vide = `APP_URL`). PayTech refuse toute IPN en http : en local, l'URL du tunnel. |
| `DEMO_SEED`, `DEMO_PASSWORD`, `DEMO_NWC_URI`, `PAYTECH_ENV`, `PAYTECH_API_KEY`, `PAYTECH_API_SECRET` | Données de démonstration (portefeuille Coinos et compte PayTech **de la boutique démo** uniquement). |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | Compte plateforme. |
| `ALLOW_MOCK_WALLET` | En production seulement : autorise `mock://` (et `POST /paiements/{ulid}/simuler`). |

## Paiements : règles appliquées

- Montants entiers (FCFA, sats, msats). `sats = ⌈ xof × 1e8 / btc_xof ⌉`. Cours figé sur la tentative.
- Statut « payé » décidé **uniquement côté serveur** : lookup du portefeuille (Lightning), IPN authentifiée (PayTech), confirmation manuelle auditée (Wave direct). Jamais sur la parole du navigateur.
- Vente : `en_attente → payee | annulee | expiree`. Paiement : `en_attente → reussi | expire | echoue | annule`. Une seule tentative solde la vente ; les autres passent à `annule`.
- Double règlement → vente `payee`, 2e tentative `reussi`, `alerte = trop_percu`. Règlement après annulation/expiration → vente `payee`, `alerte = payee_apres_annulation`. Les deux sont journalisés (`paiement.trop_percu`, `paiement.recu_apres_annulation`).
- Expiration : facture Lightning à `expire_at` ; demande PayTech sans réponse après 30 min ; Wave direct **n'expire pas** (attend la confirmation ou l'annulation). Vente `expiree` après 30 min sans tentative en attente.
- Limites : création de vente 30/min/utilisateur, vérification 20/min/paiement, IPN 60/min/boutique, reçu 60/min/IP, envoi de sats 10/min, configuration 10/min.

## Tester l'IPN PayTech en local (tunnel)

PayTech appelle `ipn_url` depuis Internet et **exige une URL en HTTPS** (`ipn_url doit etre en https`, et sans `ipn_url` : `IPN URL manquant`). En local (`APP_URL=http://localhost:8120`), une demande réelle est donc refusée tant que l'API n'est pas exposée.

1. Ouvrir un tunnel HTTPS vers l'API : `cloudflared tunnel --url http://localhost:8120` (ou `ngrok http 8120`). Noter l'URL publique, ex. `https://abc.trycloudflare.com`.
2. Dans `.env` : `PAYTECH_IPN_BASE_URL=https://abc.trycloudflare.com` (seule la base des `ipn_url` change ; le reste de l'application reste sur localhost), puis `docker compose up -d --force-recreate api queue scheduler`.
3. Côté boutique : `PUT /api/v1/boutique/paytech` avec les clés **test**, puis `POST /api/v1/boutique/paytech/verifier` → `{ ok: true }`.
4. Créer une vente `POST /api/v1/ventes { montant_xof: 100, methode: 'paytech', operateur: 'wave' }` → `paiement.paytech.redirect_url` ; ouvrir le lien et payer avec les identifiants de test PayTech.
5. PayTech envoie `POST {APP_URL}/webhooks/paytech/{boutique_ulid}` (`type_event=sale_complete`, `ref_command` = ulid du paiement, `hmac_compute`…). Le paiement passe à `reussi`, la vente à `payee`, le signal `paiements` est émis. Vérifier avec `GET /api/v1/paiements/{ulid}` et `docker compose logs api | grep "paytech ipn"`.
6. Rejouer l'IPN (même corps) : réponse 200, aucun second effet (`evenements_paiement`). Modifier le montant : 200, refus journalisé (`paytech.ipn_refusee`).

Sans tunnel, le flux se teste avec `tests/Feature/Caisse/PaytechWebhookTest.php` (IPN valide, falsifiée, rejouée, montant différent, annulée, payée après annulation).

## Parcours réel Lightning (vérification manuelle)

Avec la connexion Coinos de la boutique démo (`DEMO_NWC_URI`) : connexion → `POST /ventes { montant_xof: 100, methode: 'lightning' }` → facture `lnbc…` réelle (≈ 2 s, relais Nostr) → `GET /paiements/{ulid}` = `en_attente` → `POST /paiements/{ulid}/verifier` (lookup réel). La facture expire au bout de `expiration_facture_min` puis `paiements:expirer` la passe à `expire`. Aucun `pay_invoice` n'est jamais exécuté sur ce portefeuille par les tests.
