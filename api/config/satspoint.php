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
            'membres' => ['rubrique' => 'equipe', 'canal' => 'boutique'],
            'invitations' => ['rubrique' => 'equipe', 'canal' => 'boutique'],
            'boutiques' => ['rubrique' => 'parametres', 'canal' => 'boutique'],
            'connexions_wallet' => ['rubrique' => 'wallet', 'canal' => 'boutique'],
            'comptes_paytech' => ['rubrique' => 'parametres', 'canal' => 'boutique'],
            'imports' => ['rubrique' => 'imports', 'canal' => 'boutique'],
            'users' => ['rubrique' => 'preferences', 'canal' => 'utilisateur'],
            'audios' => ['rubrique' => 'audios', 'canal' => 'plateforme'],
            'cles_audio' => ['rubrique' => 'audio', 'canal' => 'admin'],
        ],
    ],
];
