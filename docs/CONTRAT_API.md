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
| `GET /ventes` | `periode=aujourdhui\|hier\|7j\|30j\|perso`, `du`, `au` (YYYY-MM-DD, fuseau boutique), `statut`, `methode`, `caissier` (ulid), `q` (numéro ou montant), `page` (≥ 1), `par_page` (10–100, défaut 20) — voir **§ 13 Pagination** | `{ ventes: VenteCourte[], pagination: Pagination, totaux: { nombre, montant_xof, payees_xof } }` — caissier : uniquement ses ventes du jour |
| `GET /ventes/{ulid}` | — | `{ vente: Vente }` |
| `GET /exports/ventes` | mêmes filtres + `format=csv` (P0) `\|xlsx\|pdf` (P1) | fichier (UTF-8 BOM pour CSV) ; propriétaire/gérant |

Précisions back : `q` accepte un numéro (`V-000012`, `12`) ou un montant exact ; tout autre texte renvoie une liste vide (pas de recherche libre). `methode` filtre sur la tentative réussie, ou sur la tentative en attente si la vente n'est pas payée. `perso` exige `du` (et `au ≥ du`). Tri `cree_le` puis identifiant décroissants (le plus récent d'abord). `pagination.total` = `totaux.nombre` (un seul comptage). Totaux calculés sur tout l'ensemble filtré, quelle que soit la page. CSV : séparateur `;`, en-têtes français, colonnes Numéro, Date, Heure, Montant (FCFA), Statut, Moyen, Opérateur, Montant (sats), Cours (FCFA/BTC), Caissier, Note, Alerte, Payée le, Reçu (URL absolue) ; 6 exports/min.

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

---

## 13. Pagination des listes (10 novembre — remplace `curseur` / `limite` / `curseur_suivant`)

Listes paginées côté serveur : `GET /ventes`, `GET /admin/boutiques`, `GET /admin/journal`.

| Paramètre | Règle (Form Request) | Défaut |
|---|---|---|
| `page` | entier, 1 ≤ page ≤ 10 000 | 1 |
| `par_page` | entier, 10 ≤ par_page ≤ 100 | ventes 20 · boutiques 20 · journal 30 |

Hors bornes ou non entier → `422` (erreurs de validation habituelles). `curseur` et `limite` ne sont plus lus (ignorés s'ils sont envoyés).

```ts
type Pagination = {
  page: number       // page renvoyée (celle demandée)
  par_page: number   // taille de page effective
  total: number      // nombre de lignes de l'ensemble filtré (toutes pages)
  pages: number      // nombre de pages = max(1, ⌈total / par_page⌉) — une liste vide a 1 page (vide)
}
// Réponse : les données gardent leur nom habituel, à côté de `pagination`.
// GET /ventes          → { ventes: VenteCourte[], pagination: Pagination, totaux }
// GET /admin/boutiques → { boutiques: BoutiqueAdmin[], pagination: Pagination }
// GET /admin/journal   → { entrees: EntreeJournal[], pagination: Pagination }
```

- **Page au-delà de la dernière** (`page > pages`) : `200`, liste vide, `pagination` exacte (`page` = page demandée, `total` et `pages` réels). Choix assumé : le serveur ne déplace pas la page en silence ; **le client revient à la dernière page** (`pages`) et met son adresse à jour. Cas typique : la dernière ligne d'une page a été supprimée ou un filtre change pendant qu'un autre écran est ouvert.
- Filtres, tri, cloisonnement par boutique (`BoutiqueScope`), Policies et limites de débit inchangés : `pagination.total` est calculé sur le même ensemble filtré que les données.
- Front : numéro de page dans l'adresse (`?page=2`), retour à la page 1 quand un filtre change ; le rechargement en direct (`useDonneesEnDirect`) relit la page courante.
- `GET /wallet/transactions` garde `limite` / `decalage` (la passerelle NWC ne donne pas de total) : le front demande `limite = par_page + 1` pour savoir s'il existe une page suivante et affiche « Page N » sans total.
- Listes chargées en entier (`GET /articles`, `GET /equipe`, `GET /admin/audio/matrice`) : pagination côté écran (20 par page ; 50 pour la matrice du studio), recherche et filtres appliqués avant la pagination. Aucun changement d'API.

## 14. Pays, langues et moyens de paiement par pays (10 novembre)

**Périmètre** : zone franc CFA **XOF** (UEMOA) — une seule devise, la conversion BTC/XOF existante reste valable. Pays : `SN` Sénégal, `CI` Côte d'Ivoire, `ML` Mali, `BF` Burkina Faso, `NE` Niger, `TG` Togo, `BJ` Bénin, `GW` Guinée-Bissau. Les autres devises (GNF, XAF, GHS, NGN…) sont **hors périmètre** : un pays ne s'ajoute pas par l'API (liste fermée, migration). **Rien ne change pour le Sénégal** : PayTech (Wave / Orange Money / Free Money) et le lien Wave direct (`wave_manuel`) restent tels quels.

```ts
type CodePays = 'SN' | 'CI' | 'ML' | 'BF' | 'NE' | 'TG' | 'BJ' | 'GW'
type Pays = { code: CodePays, nom_fr: string, nom_en: string, indicatif: string /* « +221 » */, devise: 'XOF', actif: boolean, ordre: number }
// Code de langue : ^[a-z]{2,8}(-[a-z]{2,3})?$ (12 caractères au plus) — ex. wo, srr, ff, dyo, bm, dyu, mos, ff-ml
type Langue = { code: string, nom_local: string /* nom dans la langue elle-même */, nom_fr: string, nom_en: string,
                pays: CodePays[] /* [] = tous les pays (le français) */, actif: boolean, ordre: number }
type CouleurMoyen = 'bleu' | 'ciel' | 'orange' | 'jaune' | 'vert' | 'rouge' | 'violet' | 'gris'
type MoyenCatalogue = { ulid: string, pays: CodePays, nom: string, type: 'lien' | 'numero', couleur: CouleurMoyen,
                        instructions_fr: string | null, instructions_en: string | null, actif: boolean, ordre: number }
type MoyenBoutique = { ulid /* du moyen du catalogue */, nom, type, couleur, instructions_fr, instructions_en,
                       active: boolean /* activé par la boutique */, valeur: string | null /* numéro ou lien marchand */ }
```

### 14.1 Lecture publique (légère, mise en cache)

`GET /config` ajoute (catalogue **actif** seulement, cache serveur invalidé à chaque écriture du catalogue ; le front le garde 10 min et le relit sur le signal `catalogues`) :
- `pays: Array<Pick<Pays, 'code'|'nom_fr'|'nom_en'|'indicatif'>>` (triés par `ordre` : Sénégal d'abord) ;
- `langues: Array<Pick<Langue, 'code'|'nom_local'|'nom_fr'|'nom_en'|'pays'|'ordre'>>` (triées par `ordre`) ;
- `langues_audio` reste, dérivé des langues actives : `{ code, nom (= nom_fr), nom_local }`.

`GET /api/v1/audio/manifeste/{langue}` accepte tout code de langue **existant** (active ou désactivée : les appareils qui l'avaient choisie gardent leurs audios) ; inconnu → `404`. Fichiers : `GET /audio/{langue}/{cle}.{empreinte8}.mp3` (même motif de code).

### 14.2 Console : catalogues (super-admin + 2FA ; écritures 30 / min ; journal d'audit ; signal `catalogues` sur le canal public `plateforme`)

| Route | Corps | Réponse |
|---|---|---|
| `GET /admin/pays` | — | `{ pays: Array<Pays & { boutiques: number }> }` (tous, actifs ou non ; `boutiques` = nombre de boutiques de ce pays) |
| `PATCH /admin/pays/{code}` | `{ nom_fr?, nom_en?, actif? }` | `{ pays }` — `SN` ne se désactive pas (`409 PAYS_PROTEGE`) ; un pays désactivé n'est plus proposé à la création de boutique (les boutiques existantes le gardent) |
| `GET /admin/langues` | — | `{ langues: Array<Langue & { audios_publies: number }> }` (toutes) |
| `POST /admin/langues` | `{ code, nom_local, nom_fr, nom_en, pays: CodePays[], actif?, ordre? }` | `201 { langue }` — crée aussi la clé vocale `langue.{code}` (écran `langue`, essentielle) pour que son nom s'enregistre au studio ; code déjà pris → `422` (`errors.code`) |
| `PATCH /admin/langues/{code}` | `{ nom_local?, nom_fr?, nom_en?, pays?, actif?, ordre? }` | `{ langue }` — le code ne change jamais ; `fr` ne se désactive pas (`409 LANGUE_PROTEGEE`, c'est la langue de repli) |
| `DELETE /admin/langues/{code}` | — | `204` seulement si la langue n'a **aucun** audio (brouillon compris) et n'est pas `fr` ; sinon `409 LANGUE_UTILISEE` (« désactivez-la ») / `LANGUE_PROTEGEE` |
| `GET /admin/moyens-paiement?pays=` | — | `{ moyens: Array<MoyenCatalogue & { boutiques_actives: number }> }` (triés pays, ordre, nom) |
| `POST /admin/moyens-paiement` | `{ pays, nom, type, couleur, instructions_fr?, instructions_en?, actif?, ordre? }` | `201 { moyen }` |
| `PATCH /admin/moyens-paiement/{ulid}` | `{ nom?, couleur?, instructions_fr?, instructions_en?, actif?, ordre? }` | `{ moyen }` — `pays` et `type` ne changent pas après création |
| `DELETE /admin/moyens-paiement/{ulid}` | — | `204` s'il n'a jamais servi (aucune boutique, aucun paiement) ; sinon `409 MOYEN_UTILISE` (désactiver) |

Validation : `code` `^[a-z]{2,8}(-[a-z]{2,3})?$` ; `nom_local` / `nom_fr` / `nom_en` 2–40 caractères (lettres, chiffres, espace, `' ’ - .`) ; `pays` ⊂ codes connus, 0–8 distincts ; `ordre` 0–999 ; moyen : `nom` 2–40 (lettres, chiffres, espace, `' ’ - . & + /`), unique par pays (`422`), `type` ∈ `lien|numero`, `couleur` ∈ `CouleurMoyen`, `instructions_*` ≤ 160 caractères, **texte brut** (aucun `<` ni `>`, pas de retour à la ligne) ; `pays` doit exister. Non super-admin → `403` avant toute validation. Journal : `plateforme.pays_modifie`, `plateforme.langue_creee`, `plateforme.langue_modifiee`, `plateforme.langue_supprimee`, `plateforme.moyen_cree`, `plateforme.moyen_modifie`, `plateforme.moyen_supprime` (détails : codes, noms, champs changés — jamais de donnée de boutique).

Graines (migration, modifiables ensuite) — langues : `wo` Wolof (SN), `srr` Seereer (SN), `ff` Pulaar (SN), `dyo` Joola (SN), `fr` Français (tous pays). Moyens : CI Wave, Orange Money, MTN MoMo, Moov Money · ML Orange Money, Moov Money, Wave · BF Orange Money, Moov Money · NE Airtel Money, Moov Money · TG Mixx by Yas, Flooz · BJ MTN MoMo, Moov Money · GW Orange Money, MTN MoMo. Aucun moyen pour SN (PayTech et Wave direct suffisent).

### 14.3 Boutique

- `GET /boutique` ajoute `pays: CodePays` et `moyens_pays: MoyenBoutique[]` — les moyens **activés** par la boutique, actifs au catalogue et du pays de la boutique (lisible par tous les rôles : la caisse en a besoin ; `valeur` est un numéro ou lien destiné aux clients).
- `POST /boutique` accepte `pays?` (défaut `SN`, pays actif sinon `422`). `PATCH /boutique` accepte `pays` (**propriétaire seulement**, `403` pour le gérant ; pays actif) : les moyens du pays précédent sont désactivés ; journal `boutique.pays_modifie`.
- `GET /boutique/moyens-pays` (propriétaire / gérant) → `{ pays: CodePays, moyens: MoyenBoutique[] }` : tous les moyens actifs du catalogue pour le pays de la boutique, avec la configuration de la boutique.
- `PUT /boutique/moyens-pays/{ulid}` `{ active: boolean, valeur?: string | null }` (propriétaire / gérant, 10 / min) → `{ moyen: MoyenBoutique }`. Moyen inconnu, inactif au catalogue **ou d'un autre pays** → `404` (indiscernable : anti-IDOR). `valeur` : type `lien` → URL `https://` ≤ 300 caractères ; type `numero` → numéro international `+` 8 à 15 chiffres (espaces, points et tirets retirés) ou code marchand de 3 à 12 chiffres. Activer sans valeur (fournie ou déjà enregistrée) → `422` (`errors.valeur`). Journal `boutique.moyen_pays_modifie` (`{ moyen, nom, active, valeur_modifiee }`, jamais la valeur). Signal `parametres`.
- Stockage : table `moyens_paiement_boutique` (scope boutique). La valeur est **en clair**, comme `reglages.wave_lien` : c'est une donnée publique (affichée en grand à chaque client qui paie), pas un secret d'accès — rien à protéger par chiffrement, contrairement aux clés PayTech ou à l'URI NWC.

### 14.4 Caisse et paiements

- Nouvelle méthode **`moyen_pays`** : `POST /ventes` et `POST /ventes/{ulid}/paiements` acceptent `{ methode: 'moyen_pays', moyen: '<ulid du moyen>' }` (`moyen` requis avec cette méthode, ignoré sinon). Moyen non activé par la boutique, inactif au catalogue ou d'un autre pays → `409 MOYEN_INACTIF` (rien n'est créé).
- `Paiement.methode` ajoute `'moyen_pays'` ; `Paiement.moyen: { ulid, nom, type, couleur, valeur, instructions_fr, instructions_en } | null` — **photographie** prise à la création de la tentative (un changement ultérieur du numéro ne modifie pas une tentative en cours). `operateur = null`, `expire_le = null` : comme le Wave direct, la tentative n'expire jamais et attend la confirmation ou l'annulation.
- `POST /paiements/{ulid}/confirmer-manuellement` accepte `wave_manuel` **et** `moyen_pays` (mêmes garde-fous : propriétaire / gérant, `{ confirmation: true }`, journal `paiement.confirme_manuellement`, signaux `paiements` + `ventes`).
- `VenteCourte` ajoute `moyen_reussi: string | null` (nom du moyen de la tentative réussie quand `methode_reussie = 'moyen_pays'`) ; le reçu public (`GET /r/{jeton}`) ajoute `moyen: string | null`. Filtre `GET /ventes?methode=moyen_pays` ; export CSV : colonne « Moyen » = nom du moyen.
- Statistiques : `moyen_pays` compte dans **mobile money** (`repartition.mobile_money` du tableau de bord, `part_mobile_money_pct` de la console).

### 14.5 Langues dans le reste de l'API

- `PATCH /moi/preferences` : `langue_audio` ∈ codes des langues **actives** (ou `null`).
- Studio : `GET /admin/audio/matrice` → `langues: Array<{ code, nom, nom_local, pays: CodePays[] }>` (langues **actives**, triées par `ordre`) ; `couverture` et `etats` portent sur ces langues ; `langue=` (filtre), `POST /admin/audio` et `POST /admin/audio/publier` acceptent toute langue active. `GET /admin/statistiques` : `couverture_audio` par langue active.
- Clés vocales `langue.{code}` : créées par `POST /admin/langues`, jamais marquées « retirées du code » par `audio:synchroniser` tant que la langue existe.

### 14.6 Temps réel

Écritures sur `pays`, `langues`, `moyens_paiement` → rubrique **`catalogues`** sur le canal public `plateforme` (aucune donnée) : le front relit `/config`, la boutique et les listes de la console. Écritures sur `moyens_paiement_boutique` → `parametres` sur `private-boutique.{ulid}`.

### 14.7 Précisions du back et du front (10 novembre)

- **Ordre des contrôles** (règle 12, comme `/wallet/*`) : `PUT /boutique/moyens-pays/{ulid}` vérifie le droit d'abord (caissier → `403`), puis le moyen (inconnu, inactif ou d'un autre pays → le même `404 INTROUVABLE`, quel que soit le corps), puis seulement le corps (`active` obligatoire). `PATCH /boutique` avec `pays` : pays inconnu ou fermé → `422` (`errors.pays`) ; gérant → `403` dès que le champ est envoyé, même avec le pays actuel (le front ne l'envoie que s'il change, et seulement pour le propriétaire).
- **Ordre par défaut** : une nouvelle langue prend le dernier `ordre` hors français + 1 ; un nouveau moyen, le dernier `ordre` de son pays + 1.
- `DELETE /admin/langues/{code}` marque aussi la clé `langue.{code}` « retirée du code » (sans la supprimer : ses éventuels audios dans d'autres langues restent). Les clés `langue.wo|srr|ff|dyo|fr|en` des graines viennent du registre du front (`cles-vocales.json`).
- **Journal** : détails ajoutés — `plateforme.*_modifie(e)` porte `changements: { champ: { avant, apres } }` ; `paiement.confirme_manuellement` porte aussi `methode` et `moyen` (nom) ; `boutique.creee` porte `pays`. Jamais le numéro ni le lien marchand.
- **Cache** : le catalogue public est mis en cache (1 h) et vidé par les événements des modèles `Pays`, `Langue`, `MoyenPaiement` ; une écriture directe en base (hors modèles) ne le vide pas.
- **Front** : `useCatalogue()` (`web/src/api/catalogue.ts`) lit `pays` / `langues` de `/config` avec repli Sénégal + langues de départ (avant la réponse, hors ligne) ; le pays de l'appareil est `localStorage['satspoint.pays']`, sinon la région de `navigator.language` (`fr-CI` → CI), sinon `SN`. Les noms affichés viennent du catalogue (`nom_local` en grand) ; seuls `langue.fr`/`langue.en` gardent une clé i18n. La matrice du studio sans `pays` (ancienne réponse) garde toutes ses colonnes. Numéro marchand affiché groupé (`+225 07 08 09 10 11`).
- **Mock** : `web/src/api/mockCatalogue.ts` (mêmes graines + bambara ML, dioula CI/BF, mooré BF, éwé TG désactivé) ; levier `sessionStorage['satspoint.mock.pays']='CI'` : boutique démo en Côte d'Ivoire, Wave (lien) et Orange Money (numéro) activés, vente `moyen_pays` en attente `01PDEMOMOYENPAYS0000000001`.


# Vague 3 — aide vocale, studio audio, 2FA, console plateforme, recherche, import/export

Mêmes conventions que ci-dessus. Le back fait foi ; toute précision est ajoutée ici.

## V3.1 Registre des clés vocales
Le front génère `web/src/voix/cles-vocales.json` (script `npm run cles-vocales`, lancé aussi par `npm run build`) :
`[{ cle, ecran, contexte, texte_fr, texte_en, essentielle }]` — `cle` = clé i18n utilisée par une prop `voix` / `HautParleur` / `annoncer()`, dans l'ordre d'apparition (écrans du parcours d'encaissement d'abord) ; `essentielle=true` pour le parcours d'encaissement et le choix de la langue.
Le back l'importe (`php artisan audio:synchroniser`, lancé au démarrage) dans `cles_audio`.

## V3.2 Fichiers et manifeste
`GET /audio/{langue}/{cle}.{empreinte8}.mp3` (immuable 1 an). `GET /api/v1/audio/manifeste/{langue}` → `{ langue, version, audios: { [cle]: url } }` (publiés seulement, ETag). Publication → signal `donnees.modifiees` rubrique `audios` sur le canal public `plateforme`.

## V3.3 Studio audio (super-admin + 2FA validée)
| Route | Corps | Réponse |
|---|---|---|
| `GET /api/v1/admin/audio/matrice?langue=&ecran=&manquants=1&q=` | — | `{ langues: [{code, nom}], ecrans: string[], couverture: { [langue]: { publies, brouillons, manquants, total, essentielles_manquantes } }, cles: [{ cle, ecran, contexte, texte_fr, texte_en, essentielle, ordre, etats: { [langue]: { statut: 'publie'\|'brouillon'\|'en_traitement'\|'erreur'\|'manquant', id?, url?, duree_ms?, mis_a_jour_le? } } }] }` |
| `POST /api/v1/admin/audio` (multipart) | `cle, langue, fichier` (mp3/wav/m4a/ogg/webm ≤ 2 Mo ≤ 15 s) | `202 { audio: { id, cle, langue, statut: 'en_traitement' } }` — traitement ffmpeg en file (silences coupés, volume normalisé, MP3 48 kb/s mono) ; fin signalée par rubrique `audio` sur `private-admin` |
| `GET /api/v1/admin/audio/{id}` | — | `{ audio: { id, cle, langue, statut, duree_ms, url_ecoute, erreur? } }` |
| `GET /api/v1/admin/audio/{id}/ecouter` | — | flux MP3 du brouillon |
| `POST /api/v1/admin/audio/publier` | `{ ids: number[] }` ou `{ cle, langue }` | `{ publies: number }` |
| `DELETE /api/v1/admin/audio/{id}` | — | `204` (brouillon/archive seulement) |

## V3.4 Double authentification (TOTP)
`GET /moi` ajoute `deux_fa: { active: boolean, requise: boolean, validee: boolean }` (`requise` = super-admin).
| Route | Corps | Réponse |
|---|---|---|
| `POST /api/v1/auth/2fa/initialiser` | — | `{ secret, otpauth_url, qr_svg }` |
| `POST /api/v1/auth/2fa/activer` | `{ code }` | `{ codes_secours: string[8] }` (affichés une seule fois) |
| `POST /api/v1/auth/2fa/verifier` | `{ code }` (TOTP ou code de secours) | `{ utilisateur }` (session marquée validée) |
| `DELETE /api/v1/auth/2fa` | `{ password }` | `204` |
Sans 2FA validée, `/api/v1/admin/*` → `403 { code: 'DEUX_FA_REQUISE' }`.

## V3.5 Console plateforme (super-admin + 2FA ; aucun accès aux ventes, portefeuilles ou PayTech des boutiques)
- `GET /api/v1/admin/boutiques?q=&statut=&page=&par_page=` (défaut 20, § 13) → `{ boutiques: [{ ulid, nom, ville, statut, cree_le, proprietaire: { nom, contact }, configuration: { wallet, paytech, paiement_test }, activite: { ventes_7j, derniere_vente_le } }], pagination: Pagination }`
- `PATCH /api/v1/admin/boutiques/{ulid}` `{ statut: 'active'|'suspendue' }` → `{ boutique }`
- `GET /api/v1/admin/sante` → `{ base, redis, reverb, passerelle, cours: { age_s, disponible }, files: { en_attente, echouees }, audio: { fichiers, octets } }`
- `GET /api/v1/admin/journal?action=&boutique=&du=&au=&page=&par_page=` (défaut 30, § 13) → `{ entrees: [{ id, action, utilisateur: { ulid, nom } | null, boutique: { ulid, nom } | null, ip, details, cree_le }], pagination: Pagination }`
- `GET /api/v1/admin/statistiques` → `{ commercants_actifs_semaine, paiements_par_commercant_semaine, delai_median_confirmation_ms, part_sats_pct, part_mobile_money_pct, couverture_audio: { [langue]: pct } }`

## V3.6 Recherche globale
- `GET /api/v1/recherche?q=` (≥ 2 caractères) → `{ groupes: [{ rubrique: 'ventes'|'articles'|'equipe'|'pages', resultats: [{ titre, sous_titre, url, score }] }] }` — 5 par rubrique, droits du rôle respectés (caissier : ni équipe ni réglages), tolérant aux accents et fautes.
- `GET /api/v1/recherche/recentes` → `{ recentes: string[] }` (4 dernières) ; `POST /api/v1/recherche/recentes` `{ terme }` → `204` ; `DELETE /api/v1/recherche/recentes` → `204`.

## V3.7 Import / export
- `POST /api/v1/imports/analyser` (multipart `fichier` CSV/XLSX ≤ 2 Mo, `type=articles`) → `{ import: { ulid, colonnes: string[], apercu: string[][], suggestions: { [colonne]: champ | null } }, champs: ['nom','prix_xof','categorie','sku','couleur','actif'] }`
- `POST /api/v1/imports/{ulid}/executer` `{ correspondance: { [colonne]: champ | null }, mode: 'creer'|'creer_et_mettre_a_jour'|'ignorer_erreurs' }` → `202 { import }` ; progression par rubrique `imports`.
- `GET /api/v1/imports/{ulid}` → `{ import: { ulid, statut: 'analyse'|'en_cours'|'termine'|'echoue', total, traitees, creees, mises_a_jour, erreurs: [{ ligne, message }], rapport_url | null } }`
- `GET /api/v1/exports/ventes?format=csv|xlsx|pdf&…filtres`, `GET /api/v1/exports/articles?format=csv|xlsx`, `GET /api/v1/exports/paiements?format=csv` — propriétaire/gérant.

## V3.8 Invitation
`GET /api/v1/invitations/{jeton}` (public) → `{ invitation: { boutique: { nom }, role, contact_masque, expire_le } }` ; `POST /api/v1/invitations/{jeton}/accepter` (session) → `{ utilisateur }`.

## V3.9 Précisions du back (ajouts compatibles — rien de ce qui précède n'est retiré)
- **403 `DEUX_FA_REQUISE`** porte aussi `etape: 'activer' | 'verifier'` (2FA pas encore activée / activée mais non vérifiée dans cette session). Toute nouvelle connexion remet `deux_fa.validee` à `false`. Les codes TOTP sont à usage unique (anti-rejeu : le code qui vient d'activer la 2FA ne sert pas une seconde fois dans la même fenêtre de 30 s). `POST /auth/2fa/activer` → `{ codes_secours, deux_fa }` (session validée d'office) ; `POST /auth/2fa/verifier` → `{ utilisateur, methode: 'totp'|'secours', codes_secours_restants }`. Codes de secours `XXXX-XXXX`, saisie tolérante (tiret, minuscules). Erreurs : `CODE_INVALIDE` (422), `DEUX_FA_DEJA_ACTIVE`, `DEUX_FA_NON_INITIALISEE`, `DEUX_FA_INACTIVE` (409).
- **Studio** : `GET /admin/audio/matrice` → `langues: [{ code, nom }]` ; `etats[langue].statut` = statut de la dernière version (`erreur` compte comme manquant dans `couverture`, avec `erreur: string`) ; `url` = URL publique pour `publie`, URL d'écoute pour `brouillon` ; quand une version publiée existe ET qu'une nouvelle est en préparation : `nouvelle_version: { statut, id, url, duree_ms, mis_a_jour_le }`. `couverture[langue].pct` (entier). `POST /admin/audio/publier` → `{ publies, audios: Audio[] }`. `Audio` = `{ id, cle, langue, statut, duree_ms (null en traitement), url_ecoute (null tant que non traité), erreur (null sauf statut erreur), url (publique, publié/archivé), taille, publie_le, mis_a_jour_le }`. Erreurs : `AUDIO_TYPE_INVALIDE`, `AUDIO_ILLISIBLE`, `AUDIO_TROP_LONG` (422), `AUDIO_NON_PUBLIABLE`, `AUDIO_NON_SUPPRIMABLE` (409), `AUDIO_INTROUVABLE` (404). Statuts d'un audio : `en_traitement → brouillon → publie → archive`, ou `erreur`.
- **Temps réel** : fin de traitement, dépôt, suppression et synchronisation des clés → rubrique `audio` sur `private-admin` ; publication → rubrique `audios` sur `plateforme` (public). Suspension d'une boutique → `parametres` sur `private-boutique.{ulid}` (les écrans relisent et reçoivent `403 BOUTIQUE_SUSPENDUE`). Import : `imports` (progression tous les 50 lignes en mode `ignorer_erreurs`, et à la fin) puis `articles`.
- **Boutique suspendue** : toute route de l'espace connecté → `403 { code: 'BOUTIQUE_SUSPENDUE' }`, sauf `GET /moi` et la déconnexion ; les sessions des membres sont révoquées à la suspension.
- **Console** : `GET /admin/sante` → `files: { en_attente: number|null, par_file: { paiements, audio, imports, default }, connexion, echouees, echouees_24h }`, `audio: { fichiers, publies, octets, disque_libre_octets }`, plus `statut`, `cours.sources`, `cours.recupere_le`, `version`, `horodatage`. `GET /admin/journal` accepte aussi `utilisateur=` (ulid), `action=prefixe.*` ; chaque entrée a aussi `cible: { type, id } | null`. `limite` / `curseur` sont remplacés par `page` / `par_page` (§ 13). `GET /admin/statistiques` ajoute `paiements_reussis_30j`, `boutiques: { total, actives, nouvelles_7j }`, `periode`. Délai médian et parts sur 30 jours de paiements réussis ; actifs et paiements par commerçant sur 7 jours.
- **Recherche** : `POST /recherche/recentes` → `204`. Un caissier ne voit que ses propres ventes. Les articles se trouvent aussi par prix exact (« 1500 », « 1 500 »).
- **Import** : `POST /imports/analyser` → `201` ; `import` contient aussi `format`, `encodage`, `separateur`, `nom_fichier`, `memorisee` (correspondance du dernier import de la boutique, déjà fusionnée dans `suggestions`), `correspondance`, `mode`, `lignes_en_erreur` (total réel ; `erreurs` est borné à 100), `cree_le`, `mis_a_jour_le`. `GET /imports/{ulid}/rapport` → CSV (résumé + erreurs). Mode `creer` / `creer_et_mettre_a_jour` : si une ligne est en erreur, rien n'est écrit (`statut: 'echoue'`, toutes les erreurs listées) ; `ignorer_erreurs` : les lignes valides sont importées. Erreurs : `IMPORT_VIDE`, `IMPORT_TROP_GRAND` (5 000 lignes), `FICHIER_ILLISIBLE`, `CORRESPONDANCE_INVALIDE` (422), `IMPORT_DEJA_EXECUTE` (409). `nom` et `prix_xof` doivent être associés.
- **Exports** : 6 / min ; `ventes` reprend les filtres de `GET /ventes` ; `articles?actifs=1` ; `paiements?periode=&du=&au=&statut=&methode=`. Caissier → 403.
- **Invitation** : `GET /invitations/{jeton}` 20 / min / IP ; jeton inconnu → 404 ; expirée, déjà acceptée ou boutique suspendue → `410 { code: 'INVITATION_EXPIREE' }`.
- **Stockage des audios et rapports (disque non persistant)** : le contenu des audios traités (brouillons, publiés, archivés) est **en base** (`audio_fichiers`, bytea) ; le disque n'est qu'un cache reconstruit à la demande. Aucune forme JSON ne change. `GET /audio/{langue}/{cle}.{empreinte8}.mp3` et `GET /admin/audio/{id}/ecouter` : mêmes en-têtes qu'avant (`audio/mpeg`, `nosniff` ; publics : `public, max-age=31536000, immutable` ; écoute : `no-store, private`), plus `ETag: "{empreinte SHA-256 complète}"` (304 sur `If-None-Match`) et `Accept-Ranges: bytes` (206 sur `Range`). Un audio resté `en_traitement` lors d'un redémarrage (source temporaire perdue, ou bloqué > 10 min) passe à `statut: 'erreur'` avec `erreur: "Le traitement a été interrompu (redémarrage du serveur). Renvoyez l'enregistrement."` — le studio le traite comme toute erreur (case « à renvoyer »). Le rapport d'import est en base (`GET /imports/{ulid}/rapport` toujours disponible) ; un fichier d'import perdu entre l'analyse et l'exécution donne `statut: 'echoue'`, `erreurs: [{ ligne: 0, message: "Le fichier importé n'est plus disponible (redémarrage du serveur) : renvoyez-le." }]`.

## V3.10 Précisions du front (ajouts compatibles — vague 3 front)
- **Registre des clés vocales** (`web/src/voix/cles-vocales.json`, régénéré par `npm run cles-vocales` et avant chaque `vite build`) : 219 clés au 8 novembre, dont 50 `essentielle` (choix de la langue, accueil, connexion, caisse, paiement, paiement reçu — en tête de fichier). `ecran` ∈ `langue, accueil, connexion, caisse, paiement, succes, navigation, compte, ventes, tableau, portefeuille, articles, equipe, invitation, reglages, demarrage, recu, securite, admin, divers` ; `contexte` = « type d'élément — écran » en français (ex. « Bouton icône — Caisse », « Annonce automatique — Paiement », « Menu — Menu »). Un test Vitest échoue si une clé vocale du code n'a pas de texte FR/EN, si un `Bouton`/`BoutonLien`/`BoutonIcone`/`Onglet` n'a pas de clé vocale, ou si le fichier n'est pas à jour.
- **Studio** : le front lit `etats[langue].url` pour écouter (brouillon compris : l'URL d'écoute doit fonctionner avec les cookies de session dans un `<audio>`). Il n'appelle pas `GET /admin/audio/{id}` : il relit la matrice sur le signal `audio` (et toutes les 3 s tant qu'une case est `en_traitement`). Avec `nouvelle_version`, la case affiche la version en préparation (statut, id, url) et garde l'URL publiée. Nom du fichier envoyé : `{cle}.{webm|m4a|ogg}` (enregistrement navigateur) ou le nom d'origine (dépôt). Contrôles côté client avant envoi : extension/type (mp3, wav, m4a, ogg, webm), 2 Mo, durée ≤ 15 s si lisible — le serveur reste juge.
- **2FA** : le QR est généré par le front à partir de `otpauth_url` (bibliothèque `qrcode`) ; `qr_svg` n'est jamais injecté dans la page (pas de HTML venu du serveur). Après `activer` ou `verifier`, le front accepte `{ utilisateur }` ou `{ deux_fa }` et relit `/moi` si besoin. Le front exige le code après connexion pour **tout compte** dont `deux_fa.active && !deux_fa.validee` (pas seulement le super-admin) : le back devrait appliquer la même règle à ses routes sensibles (règle 12 « cohérence »). `deux_fa` absent de `/moi` = 2FA inactive (la console reste refusée). `403 DEUX_FA_REQUISE` : `etape: 'activer'` → `/securite/2fa`, sinon `/verification-2fa?suite=…`.
- **Console** : santé lue avec tolérance (`files.en_attente` nombre ou détail par file). Libellés du journal : `admin.journal.actions.<action avec « . » → « _ »>`, repli sur le code brut ; `details` affichés tels quels en petit (ne jamais y mettre de montant ni de secret). `statistiques.boutiques` affiché s'il est présent.
- **Recherche** : URL attendues dans `resultats[].url` : `/ventes?vente={ulid}` (ouvre le détail), `/articles?article={ulid}` (ouvre la fiche), `/equipe`, `/reglages#boutique|paiements|paytech|preferences` (défile jusqu'à la section). Les pages et réglages sont aussi cherchés dans un index local (hors ligne) ; dédoublonnage par URL. `POST /recherche/recentes` : `204` ou `{ recentes }` acceptés.
- **Import** : le front affiche `total_lignes` (ou `total`) si présent, sinon la taille de l'aperçu ; `lignes_en_erreur` prioritaire sur `erreurs.length`. Le rapport (`rapport_url`) est téléchargé par `fetch` avec la session. La correspondance validée est aussi mémorisée localement (colonne normalisée → champ) en complément de `memorisee`.
- **Invitation** : `410 INVITATION_EXPIREE` → écran « Invitation expirée » ; `404` → « Invitation introuvable » ; `422 DEJA_MEMBRE` (acceptation par un compte qui a déjà une boutique) → message dédié. `/connexion` et `/inscription` acceptent `?suite=/invitation/{jeton}` (chemin interne uniquement : pas de redirection ouverte).
- **Boutique suspendue** : `403 BOUTIQUE_SUSPENDUE` → « Cette boutique est suspendue. Contactez l'équipe SatsPoint. »
- **Exports** : le nom de fichier de `Content-Disposition` est repris s'il est fourni.

## V3.11 Précisions issues de l'intégration front ↔ back (tests de bout en bout du 8 novembre)
- **Manifeste audio** : le front appelle `GET /api/v1/audio/manifeste/{langue}` (et non `/audio/manifeste/…`, qui n'existe pas) ; les fichiers restent servis sous `/audio/{langue}/{cle}.{empreinte8}.mp3` (URL absolue dans le manifeste).
- **`POST /boutique`** renvoie bien `201 { boutique, utilisateur }` (l'utilisateur est la forme de `GET /moi`).
- **Recherche** : `resultats[].url` des ventes = `/ventes?vente={ulid}` ; équipe = `/equipe` ; pages « Connexion du portefeuille » = `/portefeuille`, « Thème » = `/reglages#preferences` ; « Démarrage guidé » réservé au propriétaire.
- **Codes d'erreur** : `DERNIER_PROPRIETAIRE` (422, `PATCH`/`DELETE /equipe/{ulid}`) ; `DEJA_DANS_EQUIPE` (409, `POST /equipe/invitations` vers un membre actif) ; `INVITATION_EXPIREE` (410) aussi à l'acceptation ; `DEJA_MEMBRE` (422, acceptation par un compte déjà membre d'une autre boutique) ; `MOT_DE_PASSE_INCORRECT` (422, `POST /wallet/envoyer`, avec `errors.password`).
- **Ordre des contrôles** : `POST /wallet/recevoir`, `/wallet/envoyer/apercu`, `/wallet/envoyer` vérifient le droit **avant** la validation du corps (un rôle non autorisé reçoit 403, jamais le détail des champs).
- **Préférences** : `PATCH /moi/preferences` accepte `langue_audio: null` (interface en anglais, aide vocale coupée).
- **Articles** : `couleur` reste `#RRGGBB` ; le front rattache chaque valeur à la teinte la plus proche de sa palette (jetons clair / sombre) et envoie la valeur de référence de la teinte choisie.
- **Journal** : les suspensions sont tracées `plateforme.boutique_suspendue` / `plateforme.boutique_reactivee` (famille « plateforme. » du filtre de la console).
- **Environnement local uniquement** : `php artisan e2e:compte {prefixe} [--nom=] [--super-admin]` (compte de test, mot de passe aléatoire affiché une fois) et `php artisan e2e:nettoyer {prefixe=TEST-E2E-}` (suppression des données de test) — refusées hors `APP_ENV=local|testing`.
