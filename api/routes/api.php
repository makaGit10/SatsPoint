<?php

use App\Http\Controllers\Api\V1\ArticleController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BoutiqueController;
use App\Http\Controllers\Api\V1\BoutiquePaytechController;
use App\Http\Controllers\Api\V1\BoutiqueWalletController;
use App\Http\Controllers\Api\V1\ConfigController;
use App\Http\Controllers\Api\V1\CoursController;
use App\Http\Controllers\Api\V1\EquipeController;
use App\Http\Controllers\Api\V1\InvitationController;
use App\Http\Controllers\Api\V1\ManifesteAudioController;
use App\Http\Controllers\Api\V1\MoiController;
use App\Http\Controllers\Api\V1\MotDePasseController;
use App\Http\Controllers\Api\V1\PaiementController;
use App\Http\Controllers\Api\V1\TableauDeBordController;
use App\Http\Controllers\Api\V1\VenteController;
use App\Http\Controllers\Api\V1\WalletController;
use App\Models\Membre;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 — JSON, session par cookie (Sanctum) + CSRF, Policies sur tout.
|--------------------------------------------------------------------------
*/

Route::pattern('membre', Membre::ULID_REGEX);
Route::pattern('invitation', Membre::ULID_REGEX);
Route::pattern('vente', Membre::ULID_REGEX);
Route::pattern('paiement', Membre::ULID_REGEX);
Route::pattern('article', Membre::ULID_REGEX);
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

        // ---- Cours ------------------------------------------------------
        Route::get('cours', CoursController::class)->name('cours');

        // ---- Caisse, ventes, paiements (CONTRAT_API § 3 et 4) ----------
        Route::get('ventes', [VenteController::class, 'index'])->name('ventes.index');
        Route::post('ventes', [VenteController::class, 'store'])->middleware('throttle:ventes')->name('ventes.store');
        Route::get('ventes/{vente}', [VenteController::class, 'show'])->name('ventes.show');
        Route::post('ventes/{vente}/paiements', [VenteController::class, 'nouvelleTentative'])->middleware('throttle:ventes')->name('ventes.paiements.store');
        Route::post('ventes/{vente}/annuler', [VenteController::class, 'annuler'])->name('ventes.annuler');
        Route::get('exports/ventes', [VenteController::class, 'exporter'])->middleware('throttle:exports')->name('exports.ventes');

        Route::get('paiements/{paiement}', [PaiementController::class, 'show'])->name('paiements.show');
        Route::post('paiements/{paiement}/verifier', [PaiementController::class, 'verifier'])->middleware('throttle:verification-paiement')->name('paiements.verifier');
        Route::post('paiements/{paiement}/simuler', [PaiementController::class, 'simuler'])->middleware('throttle:verification-paiement')->name('paiements.simuler');
        Route::post('paiements/{paiement}/confirmer-manuellement', [PaiementController::class, 'confirmerManuellement'])->name('paiements.confirmer-manuellement');

        // ---- Tableau de bord --------------------------------------------
        Route::get('tableau-de-bord', TableauDeBordController::class)->name('tableau-de-bord');

        // ---- Portefeuille (CONTRAT_API § 7) ------------------------------
        Route::get('wallet', [WalletController::class, 'show'])->name('wallet.show');
        Route::get('wallet/transactions', [WalletController::class, 'transactions'])->name('wallet.transactions');
        Route::post('wallet/recevoir', [WalletController::class, 'recevoir'])->middleware('throttle:ventes')->name('wallet.recevoir');
        Route::post('wallet/envoyer/apercu', [WalletController::class, 'apercu'])->middleware('throttle:wallet-envoi')->name('wallet.envoyer.apercu');
        Route::post('wallet/envoyer', [WalletController::class, 'envoyer'])->middleware('throttle:wallet-envoi')->name('wallet.envoyer');
        Route::put('boutique/wallet', [BoutiqueWalletController::class, 'update'])->middleware('throttle:configuration')->name('boutique.wallet.update');
        Route::delete('boutique/wallet', [BoutiqueWalletController::class, 'destroy'])->name('boutique.wallet.destroy');

        // ---- PayTech (CONTRAT_API § 8) -----------------------------------
        Route::put('boutique/paytech', [BoutiquePaytechController::class, 'update'])->middleware('throttle:configuration')->name('boutique.paytech.update');
        Route::delete('boutique/paytech', [BoutiquePaytechController::class, 'destroy'])->name('boutique.paytech.destroy');
        Route::post('boutique/paytech/verifier', [BoutiquePaytechController::class, 'verifier'])->middleware('throttle:configuration')->name('boutique.paytech.verifier');

        // ---- Articles (CONTRAT_API § 9) ----------------------------------
        Route::get('articles', [ArticleController::class, 'index'])->name('articles.index');
        Route::post('articles', [ArticleController::class, 'store'])->name('articles.store');
        Route::post('articles/ordre', [ArticleController::class, 'ordre'])->name('articles.ordre');
        Route::patch('articles/{article}', [ArticleController::class, 'update'])->name('articles.update');
        Route::delete('articles/{article}', [ArticleController::class, 'destroy'])->name('articles.destroy');
    });
});
