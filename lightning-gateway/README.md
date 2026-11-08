# Passerelle Lightning — SatsPoint

Service interne Node.js 22+ / TypeScript / Fastify 5 qui relie l'API Laravel aux portefeuilles Lightning des
commerçants par **Nostr Wallet Connect (NIP-47)** avec `@getalby/sdk`. Elle ne détient aucun fonds ni aucune
clé : les URI NWC arrivent de l'API (déchiffrées) et restent **en mémoire uniquement**.

Le contrat exact (routes, formes JSON, codes d'erreur, HMAC, mode mock) est dans
[`docs/CONTRAT_PASSERELLE.md`](../docs/CONTRAT_PASSERELLE.md). Ce fichier résume l'implémentation.

## Rôle

- `get_info`, `make_invoice`, `lookup_invoice`, `get_balance`, `list_transactions`, `pay_invoice` vers le portefeuille du commerçant.
- Abonnement aux notifications `payment_received` / `payment_sent` et transmission **signée** à l'API
  (`POST /internal/lightning/evenement`), qui revérifie par `lookup_invoice` avant de marquer quoi que ce soit comme payé.
- Résolution des destinations de paiement : facture BOLT11, adresse Lightning (`nom@domaine`, LUD-16), LNURL-pay (LUD-06).
- Portefeuille **simulé** (`mock://demo`) pour la démonstration sans portefeuille réel.
- Réhydratation au démarrage : `GET {API_INTERNAL_URL}/internal/lightning/connexions` (signé), avec reprises exponentielles si l'API n'est pas prête.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3011` | Port d'écoute (réseau interne Docker, aucun port publié en production). |
| `HOST` | `0.0.0.0` | Interface d'écoute. |
| `GATEWAY_HMAC_SECRET` | **obligatoire** (≥ 16 car.) | Secret partagé avec l'API pour signer et vérifier toutes les requêtes (sauf `/sante`). |
| `API_INTERNAL_URL` | — | Base de l'API (ex. `http://api:8000`). Absente → pas de réhydratation ni d'événements (avertissement). |
| `LOG_LEVEL` | `info` | Niveau pino (`fatal`…`trace`, `silent`). |
| `ALLOW_MOCK_WALLET` | `false` | En production (`NODE_ENV=production`), autorise explicitement `mock://`. Hors production, le mock est toujours accepté. |
| `NODE_ENV` | `development` | `production` active le refus du mode simulé. |

## Routes

Toutes les routes sont décrites dans le contrat (§ 2). Résumé :

| Route | Rôle |
|---|---|
| `GET /sante` *(sans HMAC)* | `{ ok, connexions, mock, uptime_s }` — `mock` = au moins une connexion simulée enregistrée. |
| `PUT /connexions/{id}` | `{ uri, budget_msats? }` → vérifie par `get_info`, mémorise, s'abonne aux notifications. |
| `GET /connexions/{id}[?verifier=false]` | État ; revérifie par `get_info` sauf `verifier=false`. |
| `DELETE /connexions/{id}` | `204` (idempotent). |
| `POST /connexions/{id}/factures` | Crée une facture (`montant_msats`, `description`, `expiration_s`). |
| `GET /connexions/{id}/factures/{payment_hash}` | Statut `en_attente` / `reglee` (+ `preimage`) / `expiree`. |
| `GET /connexions/{id}/solde` | `{ msats }`. |
| `GET /connexions/{id}/transactions?limite=&decalage=&type=` | Historique normalisé. |
| `POST /connexions/{id}/paiements/apercu` | Aperçu d'une destination (BOLT11, adresse, LNURL). |
| `POST /connexions/{id}/paiements` | `{ bolt11 }` ou `{ destination, montant_msats }` → paie (budget passerelle puis budget NWC). |
| `POST /mock/{id}/payer/{payment_hash}` | Règle une facture simulée (connexion `mock://` uniquement, sinon `404`). |

Erreurs : `{ erreur: { code, message } }` avec les codes du contrat (+ `ENTREE_INVALIDE`, `NON_AUTORISE`,
`ROUTE_INCONNUE`, `PAIEMENT_ECHOUE`, documentés dans le contrat). Délai maximal **15 s** par appel au portefeuille (`DELAI_DEPASSE`).

## Sécurité

- **HMAC mutuel** (contrat § 1) : `X-SP-Timestamp`, `X-SP-Nonce` (≥ 16 octets hex), `X-SP-Signature` ;
  fenêtre ±30 s, nonces mémorisés 5 min (consommés seulement après signature valide), comparaison à temps constant.
  Les appels sortants vers l'API sont signés de la même façon.
- **Validation zod** de toutes les entrées (paramètres, query, corps) ; champs inconnus refusés ; corps limité à 32 Ko ;
  `Content-Type` JSON obligatoire.
- **Aucun secret dans les journaux** : redaction pino des champs `uri`, `secret`, `preimage`, `bolt11`, `invoice`,
  signatures ; seuls les 8 premiers caractères d'un `payment_hash` sont journalisés ; corps des requêtes jamais journalisés.
- **Isolation** : une connexion au relais par portefeuille, appels bornés à 15 s ; un portefeuille injoignable ne bloque pas les autres.
- **Argent réel** : un portefeuille NWC ne paie que des factures **mainnet** (`lnbc`) ; `pay_invoice` exige la permission côté
  portefeuille et respecte un **budget côté passerelle** optionnel (`budget_msats`, cumul des paiements sortants depuis
  l'enregistrement de la connexion) en plus du budget NWC.
- **Anti-SSRF** sur LNURL / adresses Lightning : HTTPS uniquement, hôtes locaux et plages privées refusés, réponses
  limitées à 64 Ko et 10 s, facture reçue vérifiée (montant, réseau, expiration, `description_hash`).
- **Mode simulé impossible en production** sauf `ALLOW_MOCK_WALLET=true`.
- En-têtes de réponse : `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
- Pas de base de données, pas de port publié : la passerelle n'est joignable que par l'API sur le réseau interne.

## Mode mock (`mock://demo`)

Portefeuille en mémoire : solde de départ **100 000 sats**, factures BOLT11 **regtest (`lnbcrt`) réellement signées**
par une clé de test générée au démarrage (bibliothèque `bolt11`, décodage `light-bolt11-decoder`),
`POST /mock/{id}/payer/{hash}` règle la facture, crédite le solde et émet `payment_received` vers l'API exactement
comme un vrai portefeuille. Les paiements sortants simulés débitent le solde (frais ≥ 1 sat) et émettent `payment_sent`.

## Développement et tests

```bash
npm install
npm run typecheck        # tsc strict (src, tests, scripts)
npm test                 # Vitest : HMAC, routes mock, sécurité, validation, erreurs, événements, LNURL, BOLT11
GATEWAY_HMAC_SECRET=un-secret-local-assez-long npm run dev   # http://127.0.0.1:3011/sante
npm run build && npm start
```

Vérification réelle d'un portefeuille (lecture seule + une facture, **aucun paiement**) : avec la passerelle lancée
localement avec le même `GATEWAY_HMAC_SECRET` que `C:\SatsPoint\.env`, puis

```bash
npm run verifier-connexion -- --env ../.env --url http://127.0.0.1:3011
```

Le script lit `DEMO_NWC_URI` sans jamais l'afficher et rapporte les durées de chaque étape.

Docker :

```bash
docker build --target prod -t satspoint/lightning-gateway .
docker run --rm -p 127.0.0.1:3012:3011 -e GATEWAY_HMAC_SECRET=un-secret-local-assez-long satspoint/lightning-gateway
curl http://127.0.0.1:3012/sante
```

## Organisation du code

```
src/
  index.ts                 démarrage, arrêt propre, réhydratation non bloquante
  app.ts                   construction Fastify : parseur JSON brut, HMAC, erreurs, routes
  config.ts                variables d'environnement (zod)
  journal.ts               pino + redaction
  erreurs.ts               codes et statuts HTTP du contrat
  securite/hmac.ts         signature / vérification / nonces
  api-interne.ts           client signé vers l'API
  evenements.ts            file d'envoi des événements (5 tentatives, backoff)
  registre.ts              connexions en mémoire, budget, réhydratation
  portefeuilles/           interface Portefeuille, PortefeuilleNwc, PortefeuilleMock, décodage BOLT11
  paiements/destination.ts résolution BOLT11 / adresse Lightning / LNURL-pay
  routes/                  une route = un fichier, validation zod, codes d'erreur typés
tests/                     Vitest (serveurs API et LNURL factices locaux)
scripts/verifier-connexion.ts
```
