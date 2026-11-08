# Contrat API ↔ passerelle Lightning

Référence partagée entre l'API Laravel (`api/`) et la passerelle (`lightning-gateway/`). Toute modification se fait **ici d'abord**.

## 1. Authentification mutuelle (HMAC)

Secret partagé : `GATEWAY_HMAC_SECRET` (même valeur des deux côtés). Toute requête **dans les deux sens** porte :

| En-tête | Contenu |
|---|---|
| `X-SP-Timestamp` | Horodatage Unix en secondes |
| `X-SP-Nonce` | Chaîne aléatoire ≥ 16 octets en hexadécimal, unique |
| `X-SP-Signature` | `hex( HMAC-SHA256( secret, message ) )` |

```
message = timestamp + "." + nonce + "." + METHODE_HTTP + "." + chemin_avec_query + "." + sha256hex(corps_brut)
```
`corps_brut` = corps exact envoyé (`""` si aucun). Le chemin commence par `/` et inclut la query string telle qu'envoyée.

Refus (`401`) si : signature invalide (comparaison à temps constant), `|maintenant − timestamp| > 30 s`, ou nonce déjà vu dans les 5 dernières minutes.

## 2. Passerelle → exposée à l'API (port interne 3011, aucun port publié)

Identifiant de connexion = `ulid` de la boutique. Montants en **millisats** (entiers). Dates en ISO 8601 UTC.

| Méthode & chemin | Corps | Réponse |
|---|---|---|
| `GET /sante` *(sans HMAC)* | — | `{ ok: true, connexions: n, mock: bool, uptime_s }` |
| `PUT /connexions/{id}` | `{ uri, budget_msats? }` — `nostr+walletconnect://…` ou `mock://demo` ; `budget_msats` optionnel (voir § 5) | `{ pubkey, relais: [..], alias, methods: [..], notifications: [..], lud16?: string, mock: bool, budget_msats? }` — vérifie par `get_info`, mémorise (remplace la connexion précédente du même `id`), s'abonne aux notifications |
| `GET /connexions/{id}` | query `verifier=false` facultative | même forme + `{ connecte: bool, derniere_verification, budget_utilise_msats? }` — revérifie par `get_info` (met à jour `connecte` et `derniere_verification`) sauf si `verifier=false` (réponse immédiate depuis la mémoire) |
| `DELETE /connexions/{id}` | — | `204` (idempotent : `204` aussi si l'identifiant est inconnu) |
| `POST /connexions/{id}/factures` | `{ montant_msats, description, expiration_s }` | `{ bolt11, payment_hash, montant_msats, cree_le, expire_le }` |
| `GET /connexions/{id}/factures/{payment_hash}` | — | `{ payment_hash, statut: "en_attente"\|"reglee"\|"expiree", montant_msats, regle_le?, preimage?, expire_le }` |
| `GET /connexions/{id}/solde` | — | `{ msats }` |
| `GET /connexions/{id}/transactions?limite=&decalage=&type=` | — | `{ transactions: [ { type: "entrante"\|"sortante", statut, montant_msats, frais_msats, description, payment_hash, regle_le, cree_le } ] }` |
| `POST /connexions/{id}/paiements/apercu` | `{ destination, montant_msats? }` — `destination` = BOLT11, adresse Lightning `nom@domaine` ou LNURL | `{ type: "bolt11"\|"adresse"\|"lnurl", bolt11?, montant_msats, description?, destinataire?, min_msats?, max_msats?, payment_hash? }` |
| `POST /connexions/{id}/paiements` | `{ bolt11 }` **ou** `{ destination, montant_msats }` | `{ payment_hash, preimage, frais_msats, montant_msats }` |
| `POST /mock/{id}/payer/{payment_hash}` | — | `{ ok: true }` — **uniquement** pour une connexion `mock://`, sinon `404` |

Erreurs : `{ erreur: { code, message } }` avec codes stables : `CONNEXION_INCONNUE`, `URI_INVALIDE`, `PORTEFEUILLE_INJOIGNABLE`, `PERMISSION_MANQUANTE`, `BUDGET_DEPASSE`, `SOLDE_INSUFFISANT`, `FACTURE_INVALIDE`, `FACTURE_INCONNUE`, `DESTINATION_INVALIDE`, `DELAI_DEPASSE`, `INTERNE`. Délai maximal par appel au portefeuille : 15 s.

Précisions d'implémentation (passerelle v1) :

| Code | HTTP | Quand |
|---|---|---|
| `ENTREE_INVALIDE` | 400 (413 corps trop grand, 415 mauvais `Content-Type`) | Validation d'un paramètre, d'une query ou d'un corps (types, bornes, champ inconnu, JSON illisible). Le message liste les champs fautifs, jamais de détail technique. |
| `NON_AUTORISE` | 401 | Signature HMAC absente, invalide, horodatage hors fenêtre ou nonce rejoué. |
| `ROUTE_INCONNUE` | 404 | Chemin inexistant. |
| `CONNEXION_INCONNUE` | 404 | Identifiant inconnu — aussi renvoyé par `/mock/{id}/…` pour une connexion **non** simulée. |
| `URI_INVALIDE` | 400 | URI mal formée, ou `mock://` refusée en production. |
| `FACTURE_INVALIDE` | 400 | BOLT11 indéchiffrable, expirée, déjà réglée, sans montant alors que `montant_msats` manque, ou d'un autre réseau (un portefeuille NWC ne paie que `lnbc` mainnet). |
| `FACTURE_INCONNUE` | 404 | `lookup_invoice` ne connaît pas ce `payment_hash`. |
| `DESTINATION_INVALIDE` | 400 | Adresse / LNURL non résolue, service injoignable ou réponse non conforme, montant hors `min_msats`/`max_msats`, hôte non autorisé (HTTPS obligatoire, hôtes privés refusés). |
| `SOLDE_INSUFFISANT` | 402 | Refus du portefeuille (`INSUFFICIENT_BALANCE`) ou du mock. |
| `PERMISSION_MANQUANTE` | 403 | Méthode absente de `methods` ou refus `RESTRICTED` / `UNAUTHORIZED` / `NOT_IMPLEMENTED` du portefeuille. |
| `BUDGET_DEPASSE` | 403 | Budget passerelle (§ 5) ou budget NWC (`QUOTA_EXCEEDED`) atteint. |
| `PAIEMENT_ECHOUE` | 422 | Le portefeuille a tenté puis refusé le paiement (`PAYMENT_FAILED`) ou n'a pas renvoyé de preimage. |
| `PORTEFEUILLE_INJOIGNABLE` | 502 | Relais ou portefeuille injoignable, chiffrement incompatible, `RATE_LIMITED`. |
| `DELAI_DEPASSE` | 504 | Pas de réponse en 15 s. Pour `POST …/paiements`, le paiement **peut** avoir été exécuté : l'API doit vérifier par `GET …/transactions` avant toute nouvelle tentative. |
| `INTERNE` | 500 | Tout le reste (détails dans les journaux de la passerelle seulement). |

`GET /sante` : `mock` vaut `true` dès qu'au moins une connexion `mock://` est enregistrée. `POST /connexions/{id}/paiements/apercu` : pour une adresse ou une LNURL sans `montant_msats`, `montant_msats` vaut `0` et l'appelant doit demander un montant entre `min_msats` et `max_msats`. Les URI `nostrwalletconnect://` (forme historique) sont acceptées comme `nostr+walletconnect://`.

## 3. API → exposée à la passerelle (réseau interne, HMAC obligatoire)

| Méthode & chemin | Rôle |
|---|---|
| `GET /internal/lightning/connexions` | Réhydratation au démarrage de la passerelle → `{ connexions: [ { id, uri, budget_msats? } ] }` (URI déchiffrées en mémoire seulement). La passerelle réessaie avec un délai croissant (2 s → 60 s, 30 tentatives) tant que l'API ne répond pas, sans bloquer son démarrage. |
| `POST /internal/lightning/evenement` | Notification du portefeuille → `{ type: "payment_received"\|"payment_sent", id, payment_hash, montant_msats, regle_le, preimage? }`. L'API répond `202` immédiatement puis **revérifie** par `GET /connexions/{id}/factures/{payment_hash}` avant de marquer quoi que ce soit comme payé. |

## 4. Mode démonstration (`mock://demo`)
Portefeuille simulé en mémoire dans la passerelle : factures BOLT11 syntaxiquement valides (réseau `lnbcrt`, signées par une clé de test), solde de départ 100 000 sats, `POST /mock/{id}/payer/{hash}` règle une facture et déclenche l'événement `payment_received` vers l'API comme un vrai portefeuille. Impossible en production : la passerelle refuse `mock://` si `NODE_ENV=production` **et** `ALLOW_MOCK_WALLET` ≠ `true`.

Précisions : régler deux fois la même facture est idempotent (`{ ok: true }`, un seul événement) ; une facture expirée ne peut plus être réglée (`FACTURE_INVALIDE`). Un paiement sortant simulé débite le solde avec des frais de max(1 sat, 0,1 %) et émet `payment_sent` ; payer une facture du même portefeuille simulé la règle aussi (auto-paiement).

## 5. Budget côté passerelle (`budget_msats`, optionnel)

En complément du budget NWC (fixé dans le portefeuille), l'API peut transmettre `budget_msats` dans `PUT /connexions/{id}` (et dans la réhydratation). C'est un **plafond cumulé des paiements sortants** (montant + frais) **depuis l'enregistrement de la connexion**, tenu en mémoire par la passerelle :

- avant chaque `pay_invoice`, le montant est réservé ; si `utilisé + réservé + montant > budget_msats` → `BUDGET_DEPASSE` sans appel au portefeuille ;
- après succès, la réservation devient de l'utilisé (montant + frais réels) ; après échec, elle est libérée ; après `DELAI_DEPASSE`, elle est conservée (paiement incertain) ;
- `GET /connexions/{id}` expose `budget_msats` et `budget_utilise_msats` ;
- un nouveau `PUT` (ou un redémarrage de la passerelle) remet le compteur à zéro : l'API reste la source de vérité du budget métier (table `connexions_wallet.budget_sats`) et doit le réappliquer si elle veut une fenêtre glissante.
