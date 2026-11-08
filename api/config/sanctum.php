<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

return [

    /*
    | Domaines « stateful » : requêtes du front authentifiées par cookie de session.
    | Lus depuis SANCTUM_STATEFUL_DOMAINS (hôte:port, séparés par des virgules).
    */
    'stateful' => array_values(array_filter(array_map('trim', explode(',', (string) env(
        'SANCTUM_STATEFUL_DOMAINS',
        'localhost,localhost:5190,127.0.0.1,127.0.0.1:5190,localhost:8120,127.0.0.1:8120'
    ))))),

    'guard' => ['web'],

    // Aucun jeton d'API personnel n'est émis : l'authentification est exclusivement par session.
    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

];
