<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BoutiqueController;
use App\Http\Controllers\Api\V1\ConfigController;
use App\Http\Controllers\Api\V1\EquipeController;
use App\Http\Controllers\Api\V1\InvitationController;
use App\Http\Controllers\Api\V1\ManifesteAudioController;
use App\Http\Controllers\Api\V1\MoiController;
use App\Http\Controllers\Api\V1\MotDePasseController;
use App\Models\Membre;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 — JSON, session par cookie (Sanctum) + CSRF, Policies sur tout.
|--------------------------------------------------------------------------
*/

Route::pattern('membre', Membre::ULID_REGEX);
Route::pattern('invitation', Membre::ULID_REGEX);
Route::pattern('jeton', '[A-Za-z0-9]{40,64}');
Route::pattern('langue', '[a-z]{2,3}');

Route::prefix('v1')->name('api.v1.')->group(function () {

    // ---- Public --------------------------------------------------------
    Route::get('config', ConfigController::class)->middleware('throttle:public')->name('config');
    Route::get('audio/manifeste/{langue}', ManifesteAudioController::class)->middleware('throttle:public')->name('audio.manifeste');

    // ---- Authentification ---------------------------------------------
    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('inscription', [AuthController::class, 'inscription'])->middleware('throttle:inscription')->name('inscription');
        Route::post('connexion', [AuthController::class, 'connexion'])->middleware('throttle:connexion')->name('connexion');
        Route::post('mot-de-passe/oubli', [MotDePasseController::class, 'oubli'])->middleware('throttle:oubli')->name('mot-de-passe.oubli');
        Route::post('mot-de-passe/reinitialisation', [MotDePasseController::class, 'reinitialisation'])->middleware('throttle:reinitialisation')->name('mot-de-passe.reinitialisation');

        Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
            Route::post('deconnexion', [AuthController::class, 'deconnexion'])->name('deconnexion');
            Route::post('deconnexion-partout', [AuthController::class, 'deconnexionPartout'])->name('deconnexion-partout');
        });
    });

    // ---- Espace connecté ----------------------------------------------
    Route::middleware(['auth:sanctum', 'session.valide', 'throttle:api'])->group(function () {
        Route::get('moi', [MoiController::class, 'show'])->name('moi');
        Route::patch('moi/preferences', [MoiController::class, 'preferences'])->name('moi.preferences');

        Route::post('boutique', [BoutiqueController::class, 'store'])->name('boutique.store');
        Route::get('boutique', [BoutiqueController::class, 'show'])->name('boutique.show');
        Route::patch('boutique', [BoutiqueController::class, 'update'])->name('boutique.update');

        Route::get('equipe', [EquipeController::class, 'index'])->name('equipe.index');
        Route::post('equipe/invitations', [InvitationController::class, 'store'])->middleware('throttle:invitations')->name('equipe.invitations.store');
        Route::delete('equipe/invitations/{invitation}', [InvitationController::class, 'destroy'])->name('equipe.invitations.destroy');
        Route::patch('equipe/{membre}', [EquipeController::class, 'update'])->name('equipe.update');
        Route::delete('equipe/{membre}', [EquipeController::class, 'destroy'])->name('equipe.destroy');

        Route::post('invitations/{jeton}/accepter', [InvitationController::class, 'accepter'])->middleware('throttle:invitations-accepter')->name('invitations.accepter');
    });
});
