<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\CoursChange;
use Illuminate\Http\JsonResponse;

/** GET /cours → { disponible, btc_xof, recupere_le, age_s, sources } (CONTRAT_API § 2). */
class CoursController extends Controller
{
    public function __invoke(CoursChange $cours): JsonResponse
    {
        return response()->json($cours->actuel())->header('Cache-Control', 'no-store, private');
    }
}
