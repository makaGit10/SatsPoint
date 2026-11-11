<?php

/*
|--------------------------------------------------------------------------
| SatsPoint — configuration applicative
|--------------------------------------------------------------------------
| Tout vient de l'environnement ; aucune valeur secrète ici.
*/

return [

    'version' => env('APP_VERSION', '0.1.0'),

    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost:8120')), '/'),

    // Front compilé servi par PHP pour /r/{jeton} (Caddy route /r/* vers PHP). Absent en dev → JSON.
    'web_dist' => env('WEB_DIST_PATH', '/app/web-dist'),

    // Clé de chiffrement des données sensibles (distincte de APP_KEY) : "base64:..." (32 octets).
    'cle_donnees' => env('DATA_ENCRYPTION_KEY'),

    'locales' => ['fr', 'en'],

    // Repli UNIQUEMENT si la table `langues` est absente (avant migration) : la source est le catalogue en base
    // (App\Services\Catalogue, CONTRAT_API § 14). Ne plus modifier cette liste pour ajouter une langue.
    'langues_audio' => [
        ['code' => 'wo', 'nom' => 'Wolof', 'nom_local' => 'Wolof'],
        ['code' => 'srr', 'nom' => 'Sérère', 'nom_local' => 'Seereer'],
        ['code' => 'ff', 'nom' => 'Pulaar', 'nom_local' => 'Pulaar'],
        ['code' => 'dyo', 'nom' => 'Diola', 'nom_local' => 'Joola'],
        ['code' => 'fr', 'nom' => 'Français', 'nom_local' => 'Français'],
    ],

    'themes' => ['clair', 'sombre', 'auto'],

    'preferences_defaut' => [
        'locale' => 'fr',
        'langue_audio' => 'wo',
        'theme' => 'auto',
        'aide_vocale' => true,
    ],

    'boutique' => [
        'fuseau' => 'Africa/Dakar',
        'devise' => 'XOF',
        // Forme alignée sur docs/CONTRAT_API.md § 8.
        'reglages_defaut' => [
            'expiration_facture_min' => 5,            // minutes (2 à 15)
            'montant_max_xof' => 2_000_000,           // FCFA par vente (100 à 50 000 000)
            'moyens' => ['lightning' => true, 'paytech' => false, 'wave_manuel' => false],
            'message_recu' => null,                   // ≤ 200 caractères
            'wave_lien' => null,                      // lien pay.wave.com du commerçant (paiement Wave direct)
            'paiement_test' => false,                 // démarrage guidé terminé (test de paiement effectué)
        ],
        'moyens' => ['lightning', 'paytech', 'wave_manuel'],
        'roles' => ['proprietaire', 'gerant', 'caissier'],
    ],

    'invitation' => [
        'duree_heures' => 72,
    ],

    'mot_de_passe' => [
        'longueur_min' => 12,
        'reinitialisation_minutes' => 30,
    ],

    // Informations publiques transmises au navigateur pour Laravel Echo.
    'reverb_public' => [
        'cle' => env('REVERB_APP_KEY'),
        'hote' => env('REVERB_PUBLIC_HOST', 'localhost'),
        'port' => (int) env('REVERB_PUBLIC_PORT', 8125),
        'schema' => env('REVERB_PUBLIC_SCHEME', 'http'),
    ],

    'passerelle' => [
        'url' => rtrim((string) env('LIGHTNING_GATEWAY_URL', 'http://lightning-gateway:3011'), '/'),
        'secret' => env('GATEWAY_HMAC_SECRET'),
        'delai_s' => 15,
        'fenetre_s' => 30,          // tolérance d'horodatage
        'nonce_ttl_s' => 300,       // mémoire anti-rejeu
    ],

    'demo' => [
        'seed' => filter_var(env('DEMO_SEED', true), FILTER_VALIDATE_BOOL),
        // Autorise le mode simulé (mock://, POST /paiements/{ulid}/simuler) en production — même variable que la passerelle.
        'mock_autorise_en_production' => filter_var(env('ALLOW_MOCK_WALLET', false), FILTER_VALIDATE_BOOL),
        'nwc_uri' => env('DEMO_NWC_URI'),
        'mot_de_passe' => env('DEMO_PASSWORD'),
        'email_proprietaire' => 'demo@satspoint.local',
        'email_caissier' => 'caissier@satspoint.local',
        'nom_boutique' => 'Boutique Démo',
    ],

    /*
     * Double authentification « virtuelle » pour le développement : en environnement LOCAL uniquement et si
     * DEUX_FA_CODE_LOCAL=true, GET /auth/2fa/code-local donne le code TOTP du moment (plus besoin d'appli
     * d'authentification sur le poste de dev). Jamais en production : la route n'est même pas déclarée.
     */
    'deux_fa_code_local' => env('APP_ENV') === 'local' && filter_var(env('DEUX_FA_CODE_LOCAL', false), FILTER_VALIDATE_BOOL),

    'superadmin' => [
        'email' => env('SUPERADMIN_EMAIL', 'admin@satspoint.local'),
        'mot_de_passe' => env('SUPERADMIN_PASSWORD'),
    ],

    'paytech' => [
        'env' => env('PAYTECH_ENV', 'test'),
        'api_key' => env('PAYTECH_API_KEY'),
        'api_secret' => env('PAYTECH_API_SECRET'),
        // Base publique HTTPS des IPN (PayTech refuse http). Vide = APP_URL. En local : URL du tunnel (cloudflared / ngrok).
        'ipn_base_url' => env('PAYTECH_IPN_BASE_URL'),
    ],

    /*
    | Temps réel : correspondance table → rubrique et canal.
    | Toute table absente de cette liste est ignorée par le middleware DiffuserEcritures
    | (sessions, cache, jobs, journal_audit, recherches_recentes, evenements_paiement,
    | cours_change, password_reset_tokens, failed_jobs, personal_access_tokens…).
    */
    'temps_reel' => [
        'tables' => [
            'ventes' => ['rubrique' => 'ventes', 'canal' => 'boutique'],
            'lignes_vente' => ['rubrique' => 'ventes', 'canal' => 'boutique'],
            'paiements' => ['rubrique' => 'paiements', 'canal' => 'boutique'],
            'articles' => ['rubrique' => 'articles', 'canal' => 'boutique'],
            // Photo et nom vocal d'un article (contenu en base) : la caisse et la liste se mettent à jour.
            'article_fichiers' => ['rubrique' => 'articles', 'canal' => 'boutique'],
            'membres' => ['rubrique' => 'equipe', 'canal' => 'boutique'],
            'invitations' => ['rubrique' => 'equipe', 'canal' => 'boutique'],
            'boutiques' => ['rubrique' => 'parametres', 'canal' => 'boutique'],
            'connexions_wallet' => ['rubrique' => 'wallet', 'canal' => 'boutique'],
            'comptes_paytech' => ['rubrique' => 'parametres', 'canal' => 'boutique'],
            'imports' => ['rubrique' => 'imports', 'canal' => 'boutique'],
            'users' => ['rubrique' => 'preferences', 'canal' => 'utilisateur'],
            // Les écritures sur `audios` (dépôts, traitements) ne concernent que le studio : rubrique « audio », canal admin.
            // La PUBLICATION émet en plus « audios » sur le canal public « plateforme » (Diffuseur, AudioStudioController).
            'audios' => ['rubrique' => 'audio', 'canal' => 'admin'],
            'cles_audio' => ['rubrique' => 'audio', 'canal' => 'admin'],
            // Catalogues de la plateforme (CONTRAT_API § 14.6) : signal public, sans donnée ; les écrans relisent /config.
            'pays' => ['rubrique' => 'catalogues', 'canal' => 'plateforme'],
            'langues' => ['rubrique' => 'catalogues', 'canal' => 'plateforme'],
            'moyens_paiement' => ['rubrique' => 'catalogues', 'canal' => 'plateforme'],
            // Activation d'un moyen du pays par une boutique : réglages de CETTE boutique.
            'moyens_paiement_boutique' => ['rubrique' => 'parametres', 'canal' => 'boutique'],
        ],
    ],

    /*
    | Aide vocale (CAHIER § 6.12, 6.13) : registre des clés, dépôt et traitement des fichiers.
    */
    'audio' => [
        // Fichier produit par le front (web/src/voix/cles-vocales.json), monté / copié dans l'image.
        'fichier_cles' => env('AUDIO_FICHIER_CLES', '/app/cles-i18n/cles-vocales.json'),
        // Obsolète : les langues du studio viennent du catalogue (table `langues`, App\Services\Catalogue).
        'langues' => ['wo', 'srr', 'ff', 'dyo', 'fr'],
        'extensions' => ['mp3', 'wav', 'm4a', 'ogg', 'webm'],
        'taille_max_ko' => 2048,          // 2 Mo
        'duree_max_ms' => 15_000,         // 15 s
        'ffmpeg' => env('AUDIO_FFMPEG', 'ffmpeg'),
        'ffprobe' => env('AUDIO_FFPROBE', 'ffprobe'),
        'delai_s' => 30,                  // délai maximal d'un traitement
        'debit' => '48k',                 // MP3 48 kb/s mono 48 kHz
        // Préfixe de l'URL publique /audio/{langue}/{cle}.{empreinte8}.mp3 (colonne audios.chemin = chemin LOGIQUE) ;
        // le contenu est en base (audio_fichiers), le disque « cache-audio » n'est qu'un cache.
        'dossier_public' => 'audio',
        'dossier_sources' => 'audio-sources', // storage/app/private/audio-sources/{id}.{ext} : source temporaire jusqu'au traitement
        // Au-delà, un audio encore « en_traitement » est considéré interrompu (redémarrage) : statut erreur, à renvoyer.
        'traitement_interrompu_min' => 10,
    ],

    /*
    | Articles sans écrire (11 novembre) : photo prise au téléphone et nom dit à voix haute, contenus EN BASE.
    | Tout est ré-encodé par le serveur (photo → WebP, voix → MP3 par le traitement ffmpeg du studio).
    */
    'articles_medias' => [
        'photo_max_ko' => 4096,           // 4 Mo à l'entrée (le front réduit déjà la photo avant l'envoi)
        'photo_pixels_max' => 25_000_000, // garde-fou mémoire (bombe de décompression)
        'photo_cote' => 512,              // côté maximal après ré-encodage
        'photo_qualite' => 80,            // qualité WebP
        'voix_max_ko' => 1024,            // 1 Mo à l'entrée
        'voix_duree_max_ms' => 7_000,     // ~5 s de parole (enregistreur arrêté à 5 s) + marge
    ],

    /*
    | Import d'articles (CAHIER § 6.15).
    */
    'import' => [
        'taille_max_ko' => 2048,
        'extensions' => ['csv', 'txt', 'xlsx'],
        'lignes_max' => 5000,
        'erreurs_max' => 100,
        'champs' => ['nom', 'prix_xof', 'categorie', 'sku', 'couleur', 'actif'],
        'modes' => ['creer', 'creer_et_mettre_a_jour', 'ignorer_erreurs'],
        'dossier' => 'imports',           // storage/app/private/imports/{ulid}.{ext}
    ],

    /*
    | Recherche globale (CAHIER § 6.14) : pages statiques trouvables, avec les rôles autorisés.
    | url = route du front ; mots = synonymes FR/EN (sans accent, minuscules) en plus des titres.
    */
    'recherche' => [
        'pages' => [
            ['cle' => 'caisse', 'url' => '/caisse', 'fr' => 'Caisse', 'en' => 'Checkout', 'mots' => ['encaisser', 'vente', 'charge', 'pos', 'paiement', 'payment'], 'roles' => ['proprietaire', 'gerant', 'caissier']],
            ['cle' => 'ventes', 'url' => '/ventes', 'fr' => 'Ventes', 'en' => 'Sales', 'mots' => ['historique', 'history', 'recus', 'receipts', 'export'], 'roles' => ['proprietaire', 'gerant', 'caissier']],
            ['cle' => 'tableau_de_bord', 'url' => '/tableau-de-bord', 'fr' => 'Tableau de bord', 'en' => 'Dashboard', 'mots' => ['statistiques', 'chiffre d affaires', 'revenue', 'stats'], 'roles' => ['proprietaire', 'gerant', 'caissier']],
            ['cle' => 'portefeuille', 'url' => '/portefeuille', 'fr' => 'Portefeuille', 'en' => 'Wallet', 'mots' => ['solde', 'balance', 'sats', 'bitcoin', 'lightning', 'envoyer', 'send', 'recevoir', 'receive', 'nwc'], 'roles' => ['proprietaire', 'gerant']],
            ['cle' => 'articles', 'url' => '/articles', 'fr' => 'Articles', 'en' => 'Items', 'mots' => ['produits', 'products', 'catalogue', 'prix', 'price', 'import'], 'roles' => ['proprietaire', 'gerant', 'caissier']],
            ['cle' => 'equipe', 'url' => '/equipe', 'fr' => 'Équipe', 'en' => 'Team', 'mots' => ['membres', 'members', 'caissier', 'cashier', 'gerant', 'manager', 'invitation'], 'roles' => ['proprietaire', 'gerant']],
            ['cle' => 'reglages', 'url' => '/reglages', 'fr' => 'Réglages', 'en' => 'Settings', 'mots' => ['parametres', 'preferences', 'boutique', 'shop', 'configuration'], 'roles' => ['proprietaire', 'gerant']],
            ['cle' => 'paytech', 'url' => '/reglages#paytech', 'fr' => 'PayTech (mobile money)', 'en' => 'PayTech (mobile money)', 'mots' => ['wave', 'orange money', 'free money', 'mobile money', 'cles api', 'api keys'], 'roles' => ['proprietaire']],
            ['cle' => 'wallet_connexion', 'url' => '/portefeuille', 'fr' => 'Connexion du portefeuille (NWC)', 'en' => 'Wallet connection (NWC)', 'mots' => ['nostr', 'wallet connect', 'coinos', 'alby'], 'roles' => ['proprietaire']],
            ['cle' => 'theme', 'url' => '/reglages#preferences', 'fr' => 'Thème (clair / sombre)', 'en' => 'Theme (light / dark)', 'mots' => ['apparence', 'appearance', 'sombre', 'dark', 'clair', 'light'], 'roles' => ['proprietaire', 'gerant']],
            ['cle' => 'langue', 'url' => '/langue', 'fr' => 'Langue et aide vocale', 'en' => 'Language and voice help', 'mots' => ['wolof', 'pulaar', 'seereer', 'joola', 'francais', 'english', 'voix', 'voice', 'audio'], 'roles' => ['proprietaire', 'gerant', 'caissier']],
            ['cle' => 'demarrage', 'url' => '/demarrage', 'fr' => 'Démarrage guidé', 'en' => 'Guided setup', 'mots' => ['configuration', 'onboarding', 'premiers pas', 'getting started'], 'roles' => ['proprietaire']],
        ],
        'recentes_max' => 4,
        'par_rubrique' => 5,
    ],
];
