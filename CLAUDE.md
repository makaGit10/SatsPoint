# SatsPoint — instructions pour l'assistant

Avant toute tâche, lire et appliquer :
1. `docs/DIRECTIVES.md` — consignes permanentes de la propriétaire (sécurité en 12 règles, temps réel, tests Playwright, design, aide vocale, voix off). **Elles priment sur tout le reste.**
2. `docs/CAHIER_DES_CHARGES.md` — périmètre, priorités P0/P1/P2, règles métier, architecture, planning.

Règles de travail :
- Commit **et push** à chaque étape terminée (`type(portée): description`, en français).
- Jamais de secret dans le dépôt : tout passe par `.env` (non versionné) ; `.env.example` sans valeur réelle.
- Avant de livrer : confirmer point par point les 12 règles de sécurité, lancer les tests, vérifier visuellement (390 px et 1366 px, clair et sombre, FR et EN).
- Toute nouvelle chaîne d'interface = clé i18n FR + EN + clé vocale (aide vocale).
- Être intelligent : compléter les oublis selon la logique métier et les meilleures applications du marché, et signaler ce qui a été ajouté.
