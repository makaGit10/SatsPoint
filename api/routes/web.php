<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Routes web
|--------------------------------------------------------------------------
| L'API est servie par routes/api.php ; le front est une PWA séparée.
| La racine renvoie un simple JSON pour éviter la page « welcome » de Laravel.
*/

Route::get('/', fn () => response()->json([
    'nom' => config('app.name'),
    'version' => config('satspoint.version'),
    'documentation' => 'docs/CAHIER_DES_CHARGES.md',
]))->name('racine');
