<?php

use App\Http\Controllers\Api\V1\Admin\AudioStudioController;
use App\Http\Controllers\Api\V1\Admin\CatalogueController;
use App\Http\Controllers\Api\V1\Admin\ConsoleController;
use App\Http\Controllers\Api\V1\ArticleController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BoutiqueController;
use App\Http\Controllers\Api\V1\BoutiqueMoyensPaysController;
use App\Http\Controllers\Api\V1\BoutiquePaytechController;
use App\Http\Controllers\Api\V1\BoutiqueWalletController;
use App\Http\Controllers\Api\V1\ConfigController;
use App\Http\Controllers\Api\V1\CoursController;
use App\Http\Controllers\Api\V1\DeuxFacteursController;
use App\Http\Controllers\Api\V1\EquipeController;
use App\Http\Controllers\Api\V1\ExportController;
use App\Http\Controllers\Api\V1\ImportController;
use App\Http\Controllers\Api\V1\InvitationController;
use App\Http\Controllers\Api\V1\ManifesteAudioController;
use App\Http\Controllers\Api\V1\MoiController;
use App\Http\Controllers\Api\V1\MotDePasseController;
use App\Http\Controllers\Api\V1\PaiementController;
use App\Http\Controllers\Api\V1\RechercheController;
use App\Http\Controllers\Api\V1\TableauDeBordController;
use App\Http\Controllers\Api\V1\VenteController;
use App\Http\Controllers\Api\V1\WalletController;
use App\Models\Langue;
use App\Models\Membre;
use App\Models\Pays;
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
Route::pattern('import', Membre::ULID_REGEX);
Route::pattern('boutique', Membre::ULID_REGEX);
Route::pattern('audio', '[0-9]{1,12}');
Route::pattern('jeton', '[A-Za-z0-9]{40,64}');
// Code de langue du catalogue (CONTRAT_API § 14) : wo, srr, bm, dyu, ff-ml…
Route::pattern('langue', Langue::CODE_REGEX);
Route::pattern('pays', Pays::CODE_REGEX);
Route::pattern('moyen', Membre::ULID_REGEX);

Route::prefix('v1')->name('api.v1.')->group(function () {

    // ---- Public --------------------------------------------------------
    Route::get('config', ConfigController::class)->middleware('throttle:public')->name('config');
    Route::get('audio/manifeste/{langue}', ManifesteAudioController::class)->middleware('throttle:public')->name('audio.manifeste');
    // Invitation : aperçu public (contact masqué), CONTRAT_API V3.8.
    Route::get('invitations/{jeton}', [InvitationController::class, 'show'])->middleware('throttle:invitation-publique')->name('invitations.show');

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

        // ---- 2FA TOTP (CONTRAT_API vague 3 § 2) : 5 / min, jamais soumis à « 2fa.obligatoire ».
        Route::middleware(['auth:sanctum', 'session.valide', 'throttle:deux-fa'])->prefix('2fa')->name('2fa.')->group(function () {
            Route::post('initialiser', [DeuxFacteursController::class, 'initialiser'])->name('initialiser');
            Route::post('activer', [DeuxFacteursController::class, 'activer'])->name('activer');
            Route::post('verifier', [DeuxFacteursController::class, 'verifier'])->name('verifier');
            Route::delete('/', [DeuxFacteursController::class, 'desactiver'])->name('desactiver');
        });
    });

    // ---- Espace connecté ----------------------------------------------
    Route::middleware(['auth:sanctum', 'session.valide', 'boutique.active', 'throttle:api'])->group(function () {
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

        Route::get('paiements/{paiement}', [PaiementController::class, 'show'])->name('paiements.show');
        Route::post('paiements/{paiement}/verifier', [PaiementController::class, 'verifier'])->middleware('throttle:verification-paiement')->name('paiements.verifier');
        Route::post('paiements/{paiement}/simuler', [PaiementController::class, 'simuler'])->middleware('throttle:verification-paiement')->name('paiements.simuler');
        Route::post('paiements/{paiement}/confirmer-manuellement', [PaiementController::class, 'confirmerManuellement'])->name('paiements.confirmer-manuellement');

        // ---- Exports (CONTRAT_API vague 3 § 6) : propriétaire / gérant, 6 / min
        Route::middleware('throttle:exports')->prefix('exports')->name('exports.')->group(function () {
            Route::get('ventes', [ExportController::class, 'ventes'])->name('ventes');
            Route::get('articles', [ExportController::class, 'articles'])->name('articles');
            Route::get('paiements', [ExportController::class, 'paiements'])->name('paiements');
        });

        // ---- Import d'articles (CONTRAT_API vague 3 § 5) : propriétaire / gérant
        Route::post('imports/analyser', [ImportController::class, 'analyser'])->middleware('throttle:imports')->name('imports.analyser');
        Route::post('imports/{import}/executer', [ImportController::class, 'executer'])->middleware('throttle:imports')->name('imports.executer');
        Route::get('imports/{import}', [ImportController::class, 'show'])->name('imports.show');
        Route::get('imports/{import}/rapport', [ImportController::class, 'rapport'])->name('imports.rapport');

        // ---- Tableau de bord --------------------------------------------
        Route::get('tableau-de-bord', TableauDeBordController::class)->name('tableau-de-bord');

        // ---- Recherche globale (CONTRAT_API vague 3 § 4) : 60 / min
        Route::get('recherche', [RechercheController::class, 'chercher'])->middleware('throttle:recherche')->name('recherche');
        Route::get('recherche/recentes', [RechercheController::class, 'recentes'])->name('recherche.recentes');
        Route::post('recherche/recentes', [RechercheController::class, 'memoriser'])->middleware('throttle:recherche')->name('recherche.recentes.store');
        Route::delete('recherche/recentes', [RechercheController::class, 'effacer'])->name('recherche.recentes.destroy');

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

        // ---- Moyens de paiement du pays (CONTRAT_API § 14.3) : propriétaire / gérant
        Route::get('boutique/moyens-pays', [BoutiqueMoyensPaysController::class, 'index'])->name('boutique.moyens-pays.index');
        Route::put('boutique/moyens-pays/{moyen}', [BoutiqueMoyensPaysController::class, 'update'])->middleware('throttle:configuration')->name('boutique.moyens-pays.update');

        // ---- Articles (CONTRAT_API § 9) ----------------------------------
        Route::get('articles', [ArticleController::class, 'index'])->name('articles.index');
        Route::post('articles', [ArticleController::class, 'store'])->middleware('throttle:medias-envoi')->name('articles.store');
        Route::post('articles/ordre', [ArticleController::class, 'ordre'])->name('articles.ordre');
        Route::patch('articles/{article}', [ArticleController::class, 'update'])->name('articles.update');
        Route::delete('articles/{article}', [ArticleController::class, 'destroy'])->name('articles.destroy');

        // ---- Articles sans écrire (CONTRAT_API § 15) : photo et nom dit à voix haute, contenus en base.
        Route::post('articles/{article}/photo', [ArticleController::class, 'envoyerPhoto'])->middleware('throttle:medias-envoi')->name('articles.photo.store');
        Route::delete('articles/{article}/photo', [ArticleController::class, 'supprimerPhoto'])->name('articles.photo.destroy');
        Route::post('articles/{article}/voix', [ArticleController::class, 'envoyerVoix'])->middleware('throttle:medias-envoi')->name('articles.voix.store');
        Route::delete('articles/{article}/voix', [ArticleController::class, 'supprimerVoix'])->name('articles.voix.destroy');
        Route::get('articles/{article}/photo', [ArticleController::class, 'photo'])->withoutMiddleware('throttle:api')->middleware('throttle:medias-lecture')->name('articles.photo');
        Route::get('articles/{article}/voix', [ArticleController::class, 'voix'])->withoutMiddleware('throttle:api')->middleware('throttle:medias-lecture')->name('articles.voix');
    });

    // ---- Console plateforme (CONTRAT_API vague 3 § 1 et 3) : super-admin + 2FA vérifiée ----
    Route::middleware(['auth:sanctum', 'session.valide', 'super.admin', '2fa.obligatoire', 'throttle:api'])->prefix('admin')->name('admin.')->group(function () {
        Route::get('audio/matrice', [AudioStudioController::class, 'matrice'])->name('audio.matrice');
        Route::post('audio', [AudioStudioController::class, 'store'])->middleware('throttle:upload-audio')->name('audio.store');
        Route::post('audio/publier', [AudioStudioController::class, 'publier'])->name('audio.publier');
        Route::get('audio/{audio}', [AudioStudioController::class, 'show'])->name('audio.show');
        Route::get('audio/{audio}/ecouter', [AudioStudioController::class, 'ecouter'])->name('audio.ecouter');
        Route::delete('audio/{audio}', [AudioStudioController::class, 'destroy'])->name('audio.destroy');

        Route::get('boutiques', [ConsoleController::class, 'boutiques'])->name('boutiques');
        Route::patch('boutiques/{boutique}', [ConsoleController::class, 'statutBoutique'])->name('boutiques.statut');
        Route::get('sante', [ConsoleController::class, 'sante'])->name('sante');
        Route::get('journal', [ConsoleController::class, 'journal'])->name('journal');
        Route::get('statistiques', [ConsoleController::class, 'statistiques'])->name('statistiques');

        // Catalogues : pays, langues, moyens de paiement par pays (CONTRAT_API § 14.2) — écritures 30 / min.
        Route::get('pays', [CatalogueController::class, 'pays'])->name('pays.index');
        Route::patch('pays/{pays}', [CatalogueController::class, 'modifierPays'])->middleware('throttle:catalogue')->name('pays.update');
        Route::get('langues', [CatalogueController::class, 'langues'])->name('langues.index');
        Route::post('langues', [CatalogueController::class, 'creerLangue'])->middleware('throttle:catalogue')->name('langues.store');
        Route::patch('langues/{langue}', [CatalogueController::class, 'modifierLangue'])->middleware('throttle:catalogue')->name('langues.update');
        Route::delete('langues/{langue}', [CatalogueController::class, 'supprimerLangue'])->middleware('throttle:catalogue')->name('langues.destroy');
        Route::get('moyens-paiement', [CatalogueController::class, 'moyens'])->name('moyens-paiement.index');
        Route::post('moyens-paiement', [CatalogueController::class, 'creerMoyen'])->middleware('throttle:catalogue')->name('moyens-paiement.store');
        Route::patch('moyens-paiement/{moyen}', [CatalogueController::class, 'modifierMoyen'])->middleware('throttle:catalogue')->name('moyens-paiement.update');
        Route::delete('moyens-paiement/{moyen}', [CatalogueController::class, 'supprimerMoyen'])->middleware('throttle:catalogue')->name('moyens-paiement.destroy');
    });
});
