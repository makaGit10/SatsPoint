# SatsPoint — pause du 8 novembre 2026 (≈ 18 h) : ce qui reste

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
