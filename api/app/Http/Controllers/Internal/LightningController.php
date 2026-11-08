<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Jobs\TraiterEvenementLightning;
use App\Models\ConnexionWallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Routes internes exposées à la passerelle (CONTRAT_PASSERELLE § 3). Protégées par HMAC.
 */
class LightningController extends Controller
{
    /** GET /internal/lightning/connexions → { connexions: [ { id, uri } ] } */
    public function connexions(): JsonResponse
    {
        $connexions = ConnexionWallet::toutesBoutiques()
            ->with('boutique:id,ulid,statut')
            ->where('statut', ConnexionWallet::STATUT_ACTIVE)
            ->get(['id', 'boutique_id', 'uri_chiffree', 'statut', 'budget_sats']);

        $liste = $connexions
            ->filter(fn (ConnexionWallet $c) => $c->boutique !== null && $c->boutique->estActive())
            ->map(function (ConnexionWallet $c) {
                $connexion = ['id' => $c->boutique->ulid, 'uri' => $c->uri_chiffree];
                if ($c->budget_sats !== null) {
                    $connexion['budget_msats'] = (int) $c->budget_sats * 1000;
                }

                return $connexion;
            })
            ->values();

        return response()->json(['connexions' => $liste])
            ->header('Cache-Control', 'no-store, private');
    }

    /** POST /internal/lightning/evenement → 202 ; traitement asynchrone (revérification obligatoire). */
    public function evenement(Request $request): JsonResponse
    {
        $donnees = $request->validate([
            'type' => ['required', 'string', 'in:payment_received,payment_sent'],
            'id' => ['required', 'string', 'regex:/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/'],
            'payment_hash' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/i'],
            'montant_msats' => ['required', 'integer', 'min:0', 'max:9223372036854775807'],
            'regle_le' => ['required', 'date'],
            'preimage' => ['sometimes', 'nullable', 'string', 'regex:/^[a-f0-9]{64}$/i'],
        ]);

        TraiterEvenementLightning::dispatch($donnees);

        return response()->json(['accepte' => true], 202);
    }
}
