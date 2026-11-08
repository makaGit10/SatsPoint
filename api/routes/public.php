<?php

use App\Http\Controllers\PaiementSimuleController;
use App\Http\Controllers\RecuController;
use App\Http\Controllers\Webhooks\PaytechWebhookController;
use App\Models\Membre;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Routes publiques hors /api/v1 (CAHIER § 11) : reçu, page de paiement simulé, webhooks.
|--------------------------------------------------------------------------
| Chargées par bootstrap/app.php avec le groupe « api » (sans CSRF, JSON) et un throttle dédié.
| Caddy route /r/* et /webhooks/* vers PHP (infra/Caddyfile).
*/

Route::get('r/{jeton}', RecuController::class)
    ->where('jeton', '[A-Za-z0-9]{32}')
    ->middleware('throttle:recu-public')
    ->name('recu.public');

Route::get('paiement-simule/{ulid}', PaiementSimuleController::class)
    ->where('ulid', Membre::ULID_REGEX)
    ->middleware('throttle:recu-public')
    ->name('paiement.simule');

Route::post('webhooks/paytech/{boutique_ulid}', PaytechWebhookController::class)
    ->where('boutique_ulid', Membre::ULID_REGEX)
    ->middleware('throttle:webhook-paytech')
    ->name('webhooks.paytech');
