# Contrat API front ↔ back — vague 2 (caisse, paiements, ventes, tableau de bord, portefeuille, réglages)

Complète le contrat d'authentification déjà implémenté (`/auth/*`, `/moi`, `/config`, `/audio/manifeste/{langue}`). Base `/api/v1`, JSON, cookies Sanctum + `X-XSRF-TOKEN`. Montants **entiers** : `*_xof` en FCFA, `*_sats` en sats. Dates ISO 8601 UTC, suffixe `_le`. Identifiants publics = `ulid`. Erreurs `{ message, code?, errors? }`. Toute modification se fait **ici d'abord**.

## 1. Formes communes

```ts
type Paiement = {
  ulid: string
  methode: 'lightning' | 'paytech' | 'wave_manuel'
  operateur: 'wave' | 'orange_money' | 'free_money' | null
  statut: 'en_attente' | 'reussi' | 'expire' | 'echoue' | 'annule'
  montant_xof: number
  montant_sats: number | null            // lightning seulement
  cours_xof_par_btc: number | null
  bolt11: string | null                  // lightning, tant que en_attente ou reussi
  payment_hash_abrege: string | null     // 8 caractères
  paytech: { redirect_url: string, token: string } | null
  wave_lien: string | null               // wave_manuel : lien pay.wave.com avec montant
  simule: boolean                        // mode démo (portefeuille ou mobile money simulé)
  cree_le: string
  expire_le: string | null
  regle_le: string | null
}

type VenteCourte = {
  ulid: string
  numero: string                         // « V-000012 »
  montant_xof: number
  statut: 'en_attente' | 'payee' | 'annulee' | 'expiree'
  methode_reussie: Paiement['methode'] | null
  operateur_reussi: Paiement['operateur'] | null
  methode_en_cours: Paiement['methode'] | null   // méthode de la tentative en attente (vente `en_attente`), sinon null — ajout vague 2 front
  montant_sats_reussi: number | null
  caissier: { ulid: string, nom: string }
  note: string | null
  alerte: 'trop_percu' | 'payee_apres_annulation' | null
  cree_le: string
  payee_le: string | null
}

type Vente = VenteCourte & {
  lignes: Array<{ libelle: string, quantite: number, prix_unitaire_xof: number, article_ulid: string | null }>
  paiements: Paiement[]
  paiement_reussi: Paiement | null
  recu_url: string | null                // « /r/{jeton} » (absolu côté front), seulement si payee
}
```

## 2. Cours

| Route | Réponse |
|---|---|
| `GET /cours` | `{ disponible: boolean, btc_xof: number \| null, recupere_le: string \| null, age_s: number \| null, sources: number }` — médiane de 3 sources, cache 60 s. `disponible=false` si aucun cours de moins de 10 min : la caisse désactive Lightning et le dit. |

Conversion (identique front et back, le back fait foi) : `sats = ceil(montant_xof × 100 000 000 / btc_xof)`.

## 3. Caisse et paiements

| Route | Corps | Réponse |
|---|---|---|
| `POST /ventes` | `{ montant_xof, note?, lignes?: [{ article_ulid?, libelle, quantite, prix_unitaire_xof }], methode: 'lightning'\|'paytech'\|'wave_manuel', operateur? }` — bornes : 100 ≤ montant ≤ `montant_max_xof` de la boutique ; si `lignes` présent, `montant_xof` doit égaler la somme | `201 { vente: Vente }` (la 1re tentative est dans `vente.paiements[0]`) |
| `POST /ventes/{ulid}/paiements` | `{ methode, operateur? }` — nouvelle tentative (changement de méthode ou facture expirée) ; les tentatives `en_attente` passent à `annule` | `201 { paiement: Paiement }` |
| `GET /paiements/{ulid}` | — | `{ paiement: Paiement, vente: { ulid, statut, numero } }` — c'est l'appel fait à la réception du signal temps réel `paiements` |
| `POST /paiements/{ulid}/verifier` | — | idem, après consultation forcée du portefeuille / de PayTech (limite 20/min) |
| `POST /paiements/{ulid}/simuler` | — | `200 { paiement }` **uniquement** si `paiement.simule` ; sinon `404` |
| `POST /paiements/{ulid}/confirmer-manuellement` | `{ confirmation: true }` | `200 { paiement, vente }` — `wave_manuel` seulement ; propriétaire/gérant ; journal d'audit |
| `POST /ventes/{ulid}/annuler` | — | `200 { vente }` — seulement `en_attente` ; caissier : ses propres ventes |

Règles : statut « payé » décidé **uniquement** côté serveur ; double règlement → `alerte='trop_percu'` ; règlement après annulation → vente `payee` + `alerte='payee_apres_annulation'`. Le signal temps réel émis à chaque transition : rubrique `paiements` (et `ventes`).

Précisions back (vague 2) :
- `POST /ventes` et `POST /ventes/{ulid}/paiements` : 30/min/utilisateur. Erreurs métier `{ message, code }` : `COURS_INDISPONIBLE` (503, Lightning bloqué sans cours < 10 min ; mobile money toujours possible), `WALLET_NON_CONNECTE` (409), `MOYEN_INACTIF` (409, moyen désactivé dans les réglages), `WAVE_NON_CONFIGURE` (409, pas de `wave_lien`), `PORTEFEUILLE_INDISPONIBLE` (502), `PAYTECH_INDISPONIBLE` / `PAYTECH_REFUS` (502), `VENTE_CLOSE` (409, nouvelle tentative sur une vente qui n'est plus en attente), `ARTICLE_INTROUVABLE` (422). Rien n'est enregistré quand la 1re tentative échoue (transaction).
- `POST /ventes/{ulid}/annuler` sur une vente close → `409 VENTE_NON_ANNULABLE`. `POST /paiements/{ulid}/simuler` sur une tentative close → `409 PAIEMENT_CLOS`. `confirmer-manuellement` sur autre chose que `wave_manuel` → `409 CONFIRMATION_IMPOSSIBLE`.
- `POST /paiements/{ulid}/verifier` : Lightning = lookup réel du portefeuille ; PayTech = sans effet (aucune API de consultation publique : la confirmation vient de l'IPN) ; Wave direct = sans effet. `POST /paiements/{ulid}/simuler` est aussi limité à 20/min.
- Expiration automatique (chaque minute) : facture Lightning à `expire_le` ; demande PayTech sans réponse 30 min après sa création ; **Wave direct n'expire jamais** (`expire_le = null`, attend la confirmation ou l'annulation). Vente `expiree` 30 min après la dernière tentative si aucune n'est en attente.
- `Paiement.paytech.token` est le jeton de la page de paiement PayTech (public, déjà dans `redirect_url`). En mode simulé (aucune clé PayTech), `redirect_url` = `{APP_URL}/paiement-simule/{ulid}` (page JSON informative) et `token` = `simule-{ulid}`.
- `GET /paiements/{ulid}?detail=1` ajoute `vente.detail: Vente` (évite un second appel après le signal temps réel).

## 4. Ventes

| Route | Paramètres | Réponse |
|---|---|---|
| `GET /ventes` | `periode=aujourdhui\|hier\|7j\|30j\|perso`, `du`, `au` (YYYY-MM-DD, fuseau boutique), `statut`, `methode`, `caissier` (ulid), `q` (numéro ou montant), `curseur`, `limite` (≤ 100, défaut 30) | `{ ventes: VenteCourte[], curseur_suivant: string \| null, totaux: { nombre, montant_xof, payees_xof } }` — caissier : uniquement ses ventes du jour |
| `GET /ventes/{ulid}` | — | `{ vente: Vente }` |
| `GET /exports/ventes` | mêmes filtres + `format=csv` (P0) `\|xlsx\|pdf` (P1) | fichier (UTF-8 BOM pour CSV) ; propriétaire/gérant |

Précisions back : `q` accepte un numéro (`V-000012`, `12`) ou un montant exact ; tout autre texte renvoie une liste vide (pas de recherche libre). `methode` filtre sur la tentative réussie, ou sur la tentative en attente si la vente n'est pas payée. `perso` exige `du` (et `au ≥ du`). Le curseur est opaque (`cursorPaginate`, tri `cree_le` puis `ulid` décroissants). Totaux calculés sur tout l'ensemble filtré. CSV : séparateur `;`, en-têtes français, colonnes Numéro, Date, Heure, Montant (FCFA), Statut, Moyen, Opérateur, Montant (sats), Cours (FCFA/BTC), Caissier, Note, Alerte, Payée le, Reçu (URL absolue) ; 6 exports/min.

## 5. Reçu public

`GET /r/{jeton}` (sans session, 60/min/IP, `Accept: application/json` → JSON ; sinon la SPA s'en charge) →
`{ numero, montant_xof, montant_sats, methode, operateur, statut: 'payee', paye_le, boutique: { nom, ville }, message: string | null, alerte: 'trop_percu' | 'payee_apres_annulation' | null }`. Aucune donnée personnelle.

Précisions back : le jeton fait exactement 32 caractères `[A-Za-z0-9]` ; toute autre forme, un jeton inconnu ou une vente non payée → `404`. Sans `Accept: application/json`, le back sert l'`index.html` du front compilé (production) ; en développement (front sur Vite) il renvoie le JSON. `alerte` est ajouté pour que le reçu puisse signaler un trop-perçu (à rembourser hors application).

## 6. Tableau de bord

`GET /tableau-de-bord?periode=aujourdhui|hier|7j|30j` →
```ts
{
  periode, du, au,
  chiffre_affaires_xof, nombre_ventes, panier_moyen_xof,
  repartition: { lightning: { nombre, montant_xof }, mobile_money: { nombre, montant_xof } },
  comparaison_pct: number | null,          // vs période précédente
  serie: Array<{ jour: 'YYYY-MM-DD', montant_xof, nombre }>,
  dernieres_ventes: VenteCourte[]          // 10
}
```
Caissier : ses chiffres du jour uniquement. Rubriques temps réel à écouter : `ventes`, `paiements`.

Précisions back : `du` / `au` sont des jours locaux (fuseau boutique) inclusifs ; les agrégats portent sur les ventes **payées** (par `payee_le`), `dernieres_ventes` sur toutes les ventes créées dans la période (10, les plus récentes d'abord) ; `serie` comporte un point par jour, zéros compris ; `comparaison_pct` est `null` si la période précédente est à zéro ; `mobile_money` = PayTech + Wave direct. Le caissier reçoit toujours `periode: 'aujourdhui'`.

## 7. Portefeuille (exigence « wallet implementation »)

| Route | Corps | Réponse |
|---|---|---|
| `GET /wallet` | — | `{ connecte: boolean, alias, lud16, permissions: string[], budget_sats: number \| null, verifie_le, solde: { sats, xof, cours_xof_par_btc } \| null }` |
| `GET /wallet/transactions` | `limite` (≤ 50), `decalage` | `{ transactions: Array<{ type: 'entrante'\|'sortante', statut, montant_sats, frais_sats, description, regle_le, cree_le }> }` |
| `POST /wallet/recevoir` | `{ montant_xof? , montant_sats?, description? }` (l'un des deux) | `{ bolt11, montant_sats, montant_xof, expire_le }` |
| `POST /wallet/envoyer/apercu` | `{ destination, montant_sats? }` | `{ type: 'bolt11'\|'adresse'\|'lnurl', montant_sats, montant_xof, destinataire, description, min_sats?, max_sats? }` |
| `POST /wallet/envoyer` | `{ destination, montant_sats?, password }` | `{ payment_hash_abrege, montant_sats, frais_sats }` — **propriétaire seulement**, mot de passe revérifié, journal d'audit ; erreurs `SOLDE_INSUFFISANT`, `BUDGET_DEPASSE`, `DESTINATION_INVALIDE`, `PAIEMENT_INCERTAIN` |
| `PUT /boutique/wallet` | `{ uri }` | `{ connecte, alias, lud16, permissions, budget_sats }` — propriétaire ; l'URI n'est **jamais** renvoyée |
| `DELETE /boutique/wallet` | — | `204` |

Rubrique temps réel : `wallet`. Caissier : 403 sur tout `/wallet*`.

Précisions back :
- `GET /wallet` ajoute `simule: boolean` (connexion `mock://demo`). `solde` vaut `null` si la passerelle ou le portefeuille ne répond pas (la connexion passe alors en erreur : `connecte=false` jusqu'au prochain succès). `solde.xof` et `cours_xof_par_btc` sont `null` sans cours connu. Solde en cache 15 s.
- `GET /wallet/transactions` : `limite` ≤ 50 (défaut 20), `decalage` ≤ 10 000 ; aucun `payment_hash` exposé.
- `POST /wallet/recevoir` → `201` ; en FCFA le cours frais est obligatoire (`503 COURS_INDISPONIBLE`), en sats non. Ajoute `payment_hash_abrege`.
- `POST /wallet/envoyer/apercu` ajoute `payment_hash_abrege` (BOLT11). Les deux routes d'envoi sont réservées au **propriétaire** (le gérant reçoit 403 dès l'aperçu) et limitées à 10/min. Une adresse Lightning ou une LNURL exige `montant_sats` (`422 MONTANT_REQUIS`).
- `POST /wallet/envoyer` : mot de passe incorrect → `422` avec `errors.password` (journalisé). Erreurs : `SOLDE_INSUFFISANT` (422), `BUDGET_DEPASSE` (422), `DESTINATION_INVALIDE` (422), `PAIEMENT_ECHOUE` (422), `PERMISSION_MANQUANTE` (403, le portefeuille n'autorise pas `pay_invoice`), `PAIEMENT_INCERTAIN` (409 : le portefeuille n'a pas répondu en 15 s, le paiement a peut-être eu lieu, vérifier l'historique avant de réessayer), `WALLET_NON_CONNECTE` (409), `PORTEFEUILLE_INDISPONIBLE` (502).
- `PUT /boutique/wallet` accepte aussi `budget_sats?` (plafond cumulé des envois côté passerelle) et renvoie `simule`. URI acceptées : `nostr+walletconnect://…` (ou `nostrwalletconnect://…`) ; `mock://demo` hors production seulement. 10/min. `DELETE /boutique/wallet` est idempotent (`204` même sans connexion).

## 8. Boutique, réglages, PayTech

`GET /boutique` → `{ boutique: { ulid, nom, telephone, ville, devise, reglages: { expiration_facture_min, montant_max_xof, moyens: { lightning, paytech, wave_manuel }, message_recu, wave_lien }, configuration: { wallet, paytech, paiement_test }, paytech: { configure: boolean, environnement: 'test'\|'prod' } } }`
`PATCH /boutique` (propriétaire/gérant, champs partiels) ; `PUT /boutique/paytech` `{ api_key, api_secret, environnement }` → `{ configure, environnement }` (secrets jamais renvoyés ; champ vide = conserver) ; `DELETE /boutique/paytech` ; `POST /boutique/paytech/verifier` → `{ ok, message }` (demande de paiement de 100 FCFA en test).
`PATCH /boutique` accepte `{ paiement_test: true }` pour marquer le démarrage terminé.

Précisions back (PayTech) : `PUT /boutique/paytech` — propriétaire seulement, 10/min ; `api_key` / `api_secret` : 8 à 255 caractères `[A-Za-z0-9._-]`, requis la première fois (sinon `422`), vide ensuite = conservé ; l'enregistrement active automatiquement `reglages.moyens.paytech` (désactivable). `DELETE /boutique/paytech` → `204`, désactive le moyen. `POST /boutique/paytech/verifier` → `{ ok, message }` : `ok=false` met le compte en erreur (les nouvelles tentatives PayTech passent alors en **mode simulé** jusqu'à une vérification réussie) ; `409 PAYTECH_NON_CONFIGURE` sans compte. **PayTech exige une `ipn_url` en HTTPS** : en local, exposer l'API par un tunnel et renseigner `PAYTECH_IPN_BASE_URL` (voir `api/README.md`) ; sinon PayTech refuse la demande et le message le dit.

**Ajouts vague 2 (front) :**
- `POST /boutique` `{ nom, telephone?, ville }` (personne connectée **sans boutique**, démarrage guidé étape 1) → `201 { boutique, utilisateur }` : la personne devient `proprietaire`, `utilisateur` est la nouvelle forme de `GET /moi` (évite un aller-retour). `422` si elle a déjà une boutique.
- `GET /boutique` est lisible par **tous les rôles** de la boutique (la caisse a besoin de `reglages.moyens`, `montant_max_xof`, `wave_lien`, `paytech.configure`) ; seuls `PATCH`/`PUT`/`DELETE` sont réservés.
- `POST /ventes` : un caissier peut créer une vente même si le portefeuille appartient au propriétaire (les moyens actifs sont ceux de la boutique).

## 9. Articles (P1)

`GET /articles` → `{ articles: Article[] }` ; `POST /articles` ; `PATCH /articles/{ulid}` ; `DELETE /articles/{ulid}` ; `POST /articles/ordre` `{ ulids: string[] }`.
`Article = { ulid, nom, prix_xof, categorie, couleur, sku, actif, position }`. Caissier : lecture seule.

Précisions back : `POST` → `201 { article }` (position = dernière + 1 si absente) ; `PATCH` champs partiels → `{ article }` ; `DELETE` → `204` (les lignes de vente gardent leur libellé) ; `POST /articles/ordre` → `{ articles }` réordonnés (ulids inconnus ignorés, 1 à 500 ulids distincts). Validation : `nom` 1–120, `prix_xof` 0–50 000 000, `categorie` ≤ 60, `couleur` `#RRGGBB`, `sku` ≤ 40 `[A-Za-z0-9._-]` unique par boutique. `GET /articles` renvoie actifs et inactifs, triés par `position` puis `nom`.

## 10. Équipe

`GET /equipe` → `{ membres: Array<{ ulid, nom, contact, role, actif, derniere_connexion_le, est_moi }>, invitations: Array<{ ulid, contact, role, expire_le }> }` ;
`POST /equipe/invitations` `{ contact, role }` → `201 { invitation }` ; `DELETE /equipe/invitations/{ulid}` ; `PATCH /equipe/{ulid}` `{ role?, actif? }` ; `DELETE /equipe/{ulid}` ; `POST /invitations/{jeton}/accepter` (session requise) → `{ utilisateur }`.

## 11. Webhook PayTech

`POST /webhooks/paytech/{boutique_ulid}` (public, sans CSRF, 60/min/boutique) : vérifie HMAC/empreintes, montant, devise, `ref_command` = ulid du paiement ; idempotent ; répond toujours `200`. Déclenche la transition et le signal `paiements`.

Précisions back : authenticité = `hmac_compute` = HMAC-SHA256(`{final_item_price}|{ref_command}|{api_key}`, `api_secret`) en priorité, repli sur `api_key_sha256` + `api_secret_sha256` ; montant = `final_item_price` (ou `item_price`) égal au FCFA près, devise `XOF` (`currency` ou `devise`) ; la boutique et les clés sont résolues depuis le paiement en base et l'ulid d'URL doit correspondre ; `type_event=sale_canceled` → tentative `echoue` ; `payment_method` (« Wave », « Orange Money », « Free Money ») met à jour `operateur`. Une IPN invalide est journalisée (`paytech.ipn_refusee`) sans rien révéler. Signaux `paiements` et `ventes` émis par le middleware temps réel (auteur `null`).

## 12. Cours (précisions back)

`GET /cours` est réservé aux membres connectés (401 sinon). `btc_xof` est un entier. `sources` = nombre de sources retenues dans la médiane (1 à 3) ; une source unique n'est acceptée que si elle reste à ± 2 % du dernier cours connu. Les sources sont interrogées chaque minute par le planificateur ; `/sante` expose `cours: { age_s, disponible }`.

## 12. Codes d'erreur (ajouts vague 2 front — le back les reprend tels quels)

Chaque erreur porte `message` (lisible) et, quand le front doit réagir, un `code` stable. Le front traduit le code en message utile (cahier § 6.18) ; le `message` du serveur n'est affiché que pour les `422` de validation par champ.

| Code | Statut | Route | Réaction du front |
|---|---|---|---|
| `COURS_INDISPONIBLE` | 503 | `POST /ventes`, `POST /ventes/{ulid}/paiements` (lightning) | « Le prix du bitcoin n'est pas disponible » + mobile money proposé ; relecture de `GET /cours` |
| `WALLET_INJOIGNABLE` | 503 | idem, `/wallet/*` | « Votre portefeuille ne répond pas » + Réessayer / mobile money |
| `MONTANT_HORS_BORNES` | 422 | `POST /ventes` | message des bornes (le front les vérifie déjà avant l'appel) |
| `MOYEN_DESACTIVE`, `PAYTECH_NON_CONFIGURE`, `WAVE_NON_CONFIGURE` | 422 | création de tentative | relecture de `GET /boutique`, message |
| `VENTE_DEJA_PAYEE`, `VENTE_ANNULEE`, `VENTE_NON_ANNULABLE`, `PAIEMENT_TERMINE` | 409 | tentatives, annulation, simulation, confirmation | « Ces données ont changé entre-temps » + relecture de `GET /paiements/{ulid}` |
| `CONFIRMATION_IMPOSSIBLE` | 422 | `POST /paiements/{ulid}/confirmer-manuellement` | message (seul `wave_manuel` se confirme à la main) |
| `SOLDE_INSUFFISANT` (+ `manque_sats` facultatif dans le corps), `BUDGET_DEPASSE`, `DESTINATION_INVALIDE`, `PAIEMENT_INCERTAIN`, `MOT_DE_PASSE_INCORRECT` | 422 | `/wallet/envoyer*` | messages dédiés (§ 6.18), « Modifier le montant » |
| `DERNIER_PROPRIETAIRE` | 422 | `PATCH`/`DELETE /equipe/{ulid}` | « La boutique doit garder au moins un propriétaire » |

Signal temps réel émis par le mock (et attendu du back) après chaque transition : `paiements` + `ventes` (règlement, expiration, annulation), `wallet` (règlement Lightning, envoi, connexion), `parametres` (boutique, PayTech), `articles`, `equipe`. Le règlement constaté par le serveur (webhook, passerelle) est émis avec `auteur = null` : tous les écrans ouverts, y compris celui de la personne qui a créé la vente, relisent le statut.
