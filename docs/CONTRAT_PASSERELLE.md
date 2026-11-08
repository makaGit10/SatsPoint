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
| `PUT /connexions/{id}` | `{ uri }` — `nostr+walletconnect://…` ou `mock://demo` | `{ pubkey, relais: [..], alias, methods: [..], notifications: [..], lud16?: string, mock: bool }` — vérifie par `get_info`, mémorise, s'abonne aux notifications |
| `GET /connexions/{id}` | — | même forme + `{ connecte: bool, derniere_verification }` |
| `DELETE /connexions/{id}` | — | `204` |
| `POST /connexions/{id}/factures` | `{ montant_msats, description, expiration_s }` | `{ bolt11, payment_hash, montant_msats, cree_le, expire_le }` |
| `GET /connexions/{id}/factures/{payment_hash}` | — | `{ payment_hash, statut: "en_attente"\|"reglee"\|"expiree", montant_msats, regle_le?, preimage?, expire_le }` |
| `GET /connexions/{id}/solde` | — | `{ msats }` |
| `GET /connexions/{id}/transactions?limite=&decalage=&type=` | — | `{ transactions: [ { type: "entrante"\|"sortante", statut, montant_msats, frais_msats, description, payment_hash, regle_le, cree_le } ] }` |
| `POST /connexions/{id}/paiements/apercu` | `{ destination, montant_msats? }` — `destination` = BOLT11, adresse Lightning `nom@domaine` ou LNURL | `{ type: "bolt11"\|"adresse"\|"lnurl", bolt11?, montant_msats, description?, destinataire?, min_msats?, max_msats?, payment_hash? }` |
| `POST /connexions/{id}/paiements` | `{ bolt11 }` **ou** `{ destination, montant_msats }` | `{ payment_hash, preimage, frais_msats, montant_msats }` |
| `POST /mock/{id}/payer/{payment_hash}` | — | `{ ok: true }` — **uniquement** pour une connexion `mock://`, sinon `404` |

Erreurs : `{ erreur: { code, message } }` avec codes stables : `CONNEXION_INCONNUE`, `URI_INVALIDE`, `PORTEFEUILLE_INJOIGNABLE`, `PERMISSION_MANQUANTE`, `BUDGET_DEPASSE`, `SOLDE_INSUFFISANT`, `FACTURE_INVALIDE`, `FACTURE_INCONNUE`, `DESTINATION_INVALIDE`, `DELAI_DEPASSE`, `INTERNE`. Délai maximal par appel au portefeuille : 15 s.

## 3. API → exposée à la passerelle (réseau interne, HMAC obligatoire)

| Méthode & chemin | Rôle |
|---|---|
| `GET /internal/lightning/connexions` | Réhydratation au démarrage de la passerelle → `{ connexions: [ { id, uri } ] }` (URI déchiffrées en mémoire seulement) |
| `POST /internal/lightning/evenement` | Notification du portefeuille → `{ type: "payment_received"\|"payment_sent", id, payment_hash, montant_msats, regle_le, preimage? }`. L'API répond `202` immédiatement puis **revérifie** par `GET /connexions/{id}/factures/{payment_hash}` avant de marquer quoi que ce soit comme payé. |

## 4. Mode démonstration (`mock://demo`)
Portefeuille simulé en mémoire dans la passerelle : factures BOLT11 syntaxiquement valides (réseau `lnbcrt`, signées par une clé de test), solde de départ 100 000 sats, `POST /mock/{id}/payer/{hash}` règle une facture et déclenche l'événement `payment_received` vers l'API comme un vrai portefeuille. Impossible en production : la passerelle refuse `mock://` si `NODE_ENV=production` **et** `ALLOW_MOCK_WALLET` ≠ `true`.
