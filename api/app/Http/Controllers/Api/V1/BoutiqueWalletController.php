<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Boutique\ConnecterWalletRequest;
use App\Models\Boutique;
use App\Services\BoutiqueCourante;
use App\Services\Portefeuille;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** PUT / DELETE /boutique/wallet — propriétaire uniquement. L'URI n'est jamais renvoyée. */
class BoutiqueWalletController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante, private readonly Portefeuille $portefeuille) {}

    public function update(ConnecterWalletRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererPaiements', $boutique);

        $connexion = $this->portefeuille->connecter(
            $boutique,
            $request->user(),
            (string) $request->input('uri'),
            $request->filled('budget_sats') ? (int) $request->input('budget_sats') : null,
        );

        return response()->json([
            'connecte' => true,
            'alias' => $connexion->alias,
            'lud16' => $connexion->lud16,
            'permissions' => array_values((array) $connexion->permissions),
            'budget_sats' => $connexion->budget_sats,
            'simule' => $connexion->estSimulee(),
        ]);
    }

    public function destroy(Request $request): Response
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererPaiements', $boutique);

        $this->portefeuille->revoquer($boutique, $request->user());

        return response()->noContent();
    }
}
