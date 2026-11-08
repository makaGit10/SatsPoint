<?php

use App\Http\Controllers\Internal\LightningController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Routes internes API ← passerelle Lightning (CONTRAT_PASSERELLE § 3)
|--------------------------------------------------------------------------
| Préfixe /internal, middleware « hmac.passerelle » (signature + horodatage + anti-rejeu).
*/

Route::get('lightning/connexions', [LightningController::class, 'connexions'])->name('internal.lightning.connexions');
Route::post('lightning/evenement', [LightningController::class, 'evenement'])->name('internal.lightning.evenement');
