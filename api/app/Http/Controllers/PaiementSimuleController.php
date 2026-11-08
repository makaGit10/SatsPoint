<?php

namespace App\Http\Controllers;

use App\Models\Paiement;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * GET /paiement-simule/{ulid} : page de « paiement mobile money » du mode démo (aucune clé PayTech).
 * Informative seulement : le règlement se fait par POST /paiements/{ulid}/simuler depuis l'écran du commerçant.
 */
class PaiementSimuleController extends Controller
{
    public function __invoke(string $ulid): JsonResponse
    {
        $paiement = Paiement::toutesBoutiques()->where('ulid', $ulid)->where('simule', true)->where('methode', Paiement::METHODE_PAYTECH)->first();

        if ($paiement === null) {
            throw new NotFoundHttpException;
        }

        return response()->json([
            'simule' => true,
            'paiement' => $paiement->ulid,
            'montant_xof' => (int) $paiement->montant_xof,
            'statut' => $paiement->statut,
            'message' => 'Mode démonstration : aucun argent réel. Le commerçant règle cette tentative depuis son écran (« Simuler le paiement »).',
        ])->header('Cache-Control', 'no-store');
    }
}
