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

## 4. Ventes

| Route | Paramètres | Réponse |
|---|---|---|
| `GET /ventes` | `periode=aujourdhui\|hier\|7j\|30j\|perso`, `du`, `au` (YYYY-MM-DD, fuseau boutique), `statut`, `methode`, `caissier` (ulid), `q` (numéro ou montant), `curseur`, `limite` (≤ 100, défaut 30) | `{ ventes: VenteCourte[], curseur_suivant: string \| null, totaux: { nombre, montant_xof, payees_xof } }` — caissier : uniquement ses ventes du jour |
| `GET /ventes/{ulid}` | — | `{ vente: Vente }` |
| `GET /exports/ventes` | mêmes filtres + `format=csv` (P0) `\|xlsx\|pdf` (P1) | fichier (UTF-8 BOM pour CSV) ; propriétaire/gérant |

## 5. Reçu public

`GET /r/{jeton}` (sans session, 60/min/IP, `Accept: application/json` → JSON ; sinon la SPA s'en charge) →
`{ numero, montant_xof, montant_sats, methode, operateur, statut: 'payee', paye_le, boutique: { nom, ville }, message: string | null }`. Aucune donnée personnelle.

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

## 8. Boutique, réglages, PayTech

`GET /boutique` → `{ boutique: { ulid, nom, telephone, ville, devise, reglages: { expiration_facture_min, montant_max_xof, moyens: { lightning, paytech, wave_manuel }, message_recu, wave_lien }, configuration: { wallet, paytech, paiement_test }, paytech: { configure: boolean, environnement: 'test'\|'prod' } } }`
`PATCH /boutique` (propriétaire/gérant, champs partiels) ; `PUT /boutique/paytech` `{ api_key, api_secret, environnement }` → `{ configure, environnement }` (secrets jamais renvoyés ; champ vide = conserver) ; `DELETE /boutique/paytech` ; `POST /boutique/paytech/verifier` → `{ ok, message }` (demande de paiement de 100 FCFA en test).
`PATCH /boutique` accepte `{ paiement_test: true }` pour marquer le démarrage terminé.

## 9. Articles (P1)

`GET /articles` → `{ articles: Article[] }` ; `POST /articles` ; `PATCH /articles/{ulid}` ; `DELETE /articles/{ulid}` ; `POST /articles/ordre` `{ ulids: string[] }`.
`Article = { ulid, nom, prix_xof, categorie, couleur, sku, actif, position }`. Caissier : lecture seule.

## 10. Équipe

`GET /equipe` → `{ membres: Array<{ ulid, nom, contact, role, actif, derniere_connexion_le, est_moi }>, invitations: Array<{ ulid, contact, role, expire_le }> }` ;
`POST /equipe/invitations` `{ contact, role }` → `201 { invitation }` ; `DELETE /equipe/invitations/{ulid}` ; `PATCH /equipe/{ulid}` `{ role?, actif? }` ; `DELETE /equipe/{ulid}` ; `POST /invitations/{jeton}/accepter` (session requise) → `{ utilisateur }`.

## 11. Webhook PayTech

`POST /webhooks/paytech/{boutique_ulid}` (public, sans CSRF, 60/min/boutique) : vérifie HMAC/empreintes, montant, devise, `ref_command` = ulid du paiement ; idempotent ; répond toujours `200`. Déclenche la transition et le signal `paiements`.
