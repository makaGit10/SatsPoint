# SatsPoint — pause du 12 novembre 2026 : où on en est

> Échéance : **vendredi 20 novembre 2026, 20 h 00 (Dakar = UTC)** — soumission visée avant 18 h.
> **Rien n'est en ligne** depuis le 8/11 : https://satspoint.onrender.com montre encore l'ancienne version (`main`).

## Branches
- **`wip/pause-2026-11-08`** : travail VÉRIFIÉ depuis le 8/11 (Pest 404 verts, Vitest 185 verts au 11/11) — direction « Lumière », logo cauri, landing, sélecteurs soleil/lune + FR|EN, « Se souvenir de moi », pagination, super-admin avec sa boutique, pays UEMOA + langues dynamiques + moyens de paiement par pays, correctif ventes, 2FA « virtuelle » en local, API des articles sans écrire, découpe des blancs (serveur + fonctions navigateur), hook `useGuideVocal`.
- **`wip/pause-2026-11-12`** (dépôt local resté dessus) : + tout le travail NON VÉRIFIÉ des deux chantiers interrompus (commit `178b9a1`).

## Reprise du 13 novembre (fait)
- Plus aucun haut-parleur muet : **voix française de base** pour les 518 clés (`tools/voix-base/generer_fr.py`, voix neuronale, blancs coupés, importée en local par `audio:importer`) et, à défaut d'enregistrement, la voix du navigateur lit le texte (production comprise).
- Garde-fou « un haut-parleur sur chaque élément actionnable » étendu aux articles et au champ code ; double authentification entièrement parlée (`TexteLu`, `voixSousTitre`).
- Caisse mobile : **bande d'articles en images** au-dessus du pavé (vendre sans lire ni taper), « Encaisser » visible en 390×844 et 360×740.
- Réglages et démarrage sans débordement à 390 px ; guide vocal des articles ; découpe des blancs unifiée (vérifiée : 5,8 s → 0,92 s ; fond bruyant 11,5 s → 5,9 s).
- Caisse sous le budget (169,4 Ko) ; Vitest 223 verts, Pest 425 verts.
- Audios : **enregistrer directement sur le site en ligne** après déploiement (Render gratuit n'a pas de console pour `audio:importer`) ; liste par priorité dans `docs/AUDIOS_ESSENTIELS.md` (`node web/scripts/audios-essentiels.mjs`).

## À finir à la reprise (dans l'ordre)
1. **Voix (parcours guidé)** : terminer l'audit « un haut-parleur sur chaque élément actionnable » et son garde-fou automatique ; haut-parleurs sur chaque étape de la double authentification (demande de la propriétaire, garder `CodeLocal`) ; régénérer `web/src/voix/cles-vocales.json` puis `docs/AUDIOS_ESSENTIELS.md` ; vérifier à l'écran le panneau de première visite (choix de la langue), le bouton « 🔊 WO » + feuille vocale, le bouton « Réécouter l'aide », l'aide « Vous ne savez pas écrire ? » ; débordement de `/portefeuille` à 390 px.
2. **Articles sans écrire** (écrans) : vérifier formulaire (photo / pictogramme / nom dit à voix haute, nom écrit facultatif, prix au pavé), galerie de pictogrammes, grille de la caisse, panier, détail de vente, reçu ; brancher `useGuideVocal` ; unifier la découpe des silences (`ecrans/articles/decoupeSilences.ts` → `voix/decoupe*.ts`).
3. Vérifications complètes : `tsc`, `oxlint`, `vitest`, `build`, `taille` (caisse ≈ 169,8/170 Ko : libérer de la place si besoin), Pest complet, captures 390/1366 clair/sombre FR/EN, puis **Playwright de bout en bout sur la vraie pile** (jamais lancé) et `tests/e2e/RAPPORT.md`.
4. Montrer les captures à la propriétaire → « valide » → fusion dans `main` → Render.
5. Propriétaire : enregistrer les audios sur le **front réel** (http://localhost:5190, jamais le mode démo qui ne garde rien) une fois la découpe des blancs vérifiée ; recouper les anciens avec `php artisan audio:retraiter --simulation` puis sans l'option ; exporter vers la production (`audio:exporter` / `audio:importer`).
6. Propriétaire : Render `SUPERADMIN_PASSWORD` (nouveau mot de passe dans `.env`), `DEMO_NWC_URI` (nouvelle connexion Coinos), `DEMO_PASSWORD`, mot de passe Neon ; rechanger tous les secrets passés dans le chat avant le jury.
7. Paiement réel (Banxaas samedi 14/11 ?), vidéo (script à mettre à jour avec la nouvelle interface), README (captures, mesures), Devpost (profil Student), soumission avant le 20/11 18 h.

## Environnement local
- Docker : `docker compose up -d` dans `C:\SatsPoint` (si le moteur répond 500 : fermer de force les processus `C:\Program Files\Docker\*` puis relancer Docker Desktop).
- Front réel : `cd web && npx vite --port 5190 --strictPort` ; front démo pour les vérifications : `npx vite --mode mock --port 5195 --strictPort`.
- 2FA en local : le code est affiché à l'écran (« Mode local », `DEUX_FA_CODE_LOCAL=true` dans `.env`, ignoré hors `APP_ENV=local`).

---

# Historique — pause du 8 novembre

> Échéance : **vendredi 20 novembre 2026, 20 h 00 (Dakar = UTC)** — soumission visée avant 18 h.
> Site en ligne : **https://satspoint.onrender.com** (Render gratuit + Neon). Dépôt : branche `main` = version en ligne.

## Où est le travail en cours
Le travail des deux agents interrompus (non vérifié, non mis en ligne) est sauvegardé sur la branche **`wip/pause-2026-11-08`** (poussée sur GitHub, sans effet sur Render qui déploie `main`). Pour reprendre : `git checkout wip/pause-2026-11-08`, relancer les vérifications ci-dessous, corriger, puis fusionner dans `main`.

| Chantier interrompu | État au moment de la pause | Pour reprendre |
|---|---|---|
| **Refonte « blanc et or »** (demande de la propriétaire : plus d'orange ni de sombre par défaut, trop proche de Banxaas ; thème clair blanc et or, sombre en option) + **inscription simplifiée** (3 champs, œil afficher/masquer, plus de confirmation) | Presque fini : jetons de couleur, logo or (`docs/images/logo.svg`), icônes ; l'agent faisait la « vérification complète finale » | `cd web && npx tsc -b && npx oxlint && npx vitest run && npm run build && npm run taille` ; captures `node scripts/captures.mjs` → `captures/theme-or/` ; **montrer les captures à la propriétaire avant la mise en ligne** |
| Deux défauts de la caisse signalés par la propriétaire | Transmis à l'agent de la refonte, statut inconnu | (1) sans moyen de paiement actif, « Encaisser » doit devenir « Brancher un moyen de paiement » (pas de toast d'erreur) ; (2) sur bureau le montant FCFA sort du haut de l'écran → mise en page 2 colonnes ou pavé limité, vérifier 1366×768 et 1920×880 |
| **Intégration front ↔ vrai back + tests Playwright A→Z** | 22 fichiers de tests écrits (`tests/e2e/01-…` à `22-…`), `PARCOURS.md` et `RAPPORT.md` présents mais **pas finalisés** ; corrections d'intégration dans `api/` (Boutique, Équipe, Invitation, Wallet, Préférences, Recherche…) et `web/` | Relancer la pile (`docker compose up -d`, `cd web && npm run dev`), `cd tests/e2e && npm test`, corriger, finir `RAPPORT.md` ; relancer `php artisan test` (377 verts avant) et `npx vitest run` |

## Ce qui reste ensuite (dans l'ordre)
1. **Finir et fusionner** les deux chantiers ci-dessus (tests verts, captures validées par la propriétaire), pousser → Render redéploie (15–20 min), puis Ctrl+F5.
2. **Render — variables** (par la propriétaire) : `DEMO_NWC_URI` = **nouvelle** connexion Coinos (l'ancienne est passée dans le chat : la supprimer dans Coinos), `DEMO_PASSWORD` (≥ 12 caractères). Aujourd'hui `config.app.demo = true` → les encaissements Lightning de la boutique démo ne marchent pas en ligne.
3. **Neon** : réinitialiser le mot de passe du rôle `neondb_owner` (passé dans le chat), mettre la nouvelle chaîne dans `DATABASE_URL` sur Render.
4. **Première connexion super-admin** sur le site + activation de la 2FA (Google Authenticator, garder les 8 codes de secours).
5. **Sats pour le vrai paiement** : Banxaas a suspendu les transactions BTC ; demander ~1 000 sats à la communauté du hackathon (Discord/Telegram, liens dans l'onglet « Resources » de Devpost ; message prêt dans la conversation) ou Hiropay (KYC, minimum ~5 000 FCFA, on-chain vers l'adresse `bc1…` Coinos). → **Premier paiement réel chronométré** (100 FCFA, téléphone) pour la vidéo.
6. **Audios** : la propriétaire enregistre les clés essentielles (≈ 50) en wolof, sérère, pulaar, diola dans le studio (`/admin/studio`, mode rafale) ; sauvegarde `php artisan audio:exporter`.
7. **Vidéo 3 min** (script `tools/video/SCRIPT.md`, voix off déjà générée `tools/video/voix/`) : tournage des écrans réels (nouveau thème), plan du paiement réel chronométré, sous-titres anglais, montage, YouTube.
8. **Finition** : captures dans le README, mesures réelles (bundle, délai écran vert, Lighthouse), `docs/DEVPOST.md` aligné sur ce qui est livré (retirer ce qui ne l'est pas), réveil cron-job.org sur `/up` toutes les 10 min **pendant le jugement seulement** (budget Neon).
9. **Devpost** : profil « Student », coller le texte, liens GitHub / démo / YouTube, **soumettre avant le 20 novembre 18 h**.

## À faire par la propriétaire (récapitulatif)
- [ ] Coinos : supprimer l'ancienne connexion « SatsPoint », en créer une nouvelle (budget 500 FCFA), la coller dans Render (`DEMO_NWC_URI`) et/ou dans l'appli (« Connecter mon portefeuille »)
- [ ] Render : `DEMO_PASSWORD`
- [ ] Neon : réinitialiser le mot de passe `neondb_owner` → `DATABASE_URL` sur Render
- [ ] Obtenir ~1 000 sats (communauté du hackathon)
- [ ] Profil Devpost en « Student »
- [ ] PayTech (facultatif) : WhatsApp au support pour activer la production + changer le nom « MyEntreprise »
- [ ] Valider les captures du thème blanc et or
- [ ] Enregistrer les audios (≈ 1 h 30)
