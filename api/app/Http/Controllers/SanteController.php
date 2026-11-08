<?php

namespace App\Http\Controllers;

use App\Services\EtatSysteme;
use Illuminate\Http\JsonResponse;

/**
 * GET /sante — état des dépendances (surveillance externe). Aucune information sensible.
 */
class SanteController extends Controller
{
    public function __invoke(EtatSysteme $etat): JsonResponse
    {
        $base = $etat->base();

        return response()->json($base + [
            'version' => config('satspoint.version'),
            'horodatage' => now()->toIso8601String(),
        ], $base['base'] ? 200 : 503)->header('Cache-Control', 'no-store');
    }
}
