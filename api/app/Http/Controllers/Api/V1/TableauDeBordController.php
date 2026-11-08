<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\VenteCourteResource;
use App\Models\Boutique;
use App\Services\BoutiqueCourante;
use App\Services\TableauDeBord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /tableau-de-bord?periode=aujourdhui|hier|7j|30j (CONTRAT_API § 6). */
class TableauDeBordController extends Controller
{
    public function __invoke(Request $request, BoutiqueCourante $courante, TableauDeBord $tableau): JsonResponse
    {
        $boutique = $courante->exiger(Boutique::class);
        $this->authorize('voirTableauDeBord', $boutique);

        $donnees = $request->validate(['periode' => ['sometimes', 'string', 'in:aujourdhui,hier,7j,30j']]);

        $resultat = $tableau->calculer($boutique, $courante->membre(), $request->user(), $donnees['periode'] ?? 'aujourdhui');
        $resultat['dernieres_ventes'] = VenteCourteResource::collection($resultat['dernieres_ventes'])->resolve();

        return response()->json($resultat);
    }
}
