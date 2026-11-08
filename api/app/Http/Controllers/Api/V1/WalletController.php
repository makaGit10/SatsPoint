<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Wallet\EnvoyerRequest;
use App\Http\Requests\Wallet\RecevoirRequest;
use App\Models\Boutique;
use App\Services\BoutiqueCourante;
use App\Services\Portefeuille;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/** Portefeuille (CONTRAT_API § 7). Caissier : 403 partout. Envoi : propriétaire + mot de passe revérifié. */
class WalletController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante, private readonly Portefeuille $portefeuille) {}

    /** GET /wallet */
    public function show(): JsonResponse
    {
        $boutique = $this->boutique();

        return response()->json($this->portefeuille->etat($boutique))->header('Cache-Control', 'no-store, private');
    }

    /** GET /wallet/transactions?limite=&decalage= */
    public function transactions(Request $request): JsonResponse
    {
        $boutique = $this->boutique();

        $donnees = $request->validate([
            'limite' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'decalage' => ['sometimes', 'integer', 'min:0', 'max:10000'],
        ]);

        return response()->json([
            'transactions' => $this->portefeuille->transactions($boutique, (int) ($donnees['limite'] ?? 20), (int) ($donnees['decalage'] ?? 0)),
        ]);
    }

    /** POST /wallet/recevoir */
    public function recevoir(RecevoirRequest $request): JsonResponse
    {
        $boutique = $this->boutique();

        $resultat = $this->portefeuille->recevoir(
            $boutique,
            $request->filled('montant_xof') ? (int) $request->input('montant_xof') : null,
            $request->filled('montant_sats') ? (int) $request->input('montant_sats') : null,
            $request->input('description'),
        );

        return response()->json($resultat, 201);
    }

    /** POST /wallet/envoyer/apercu */
    public function apercu(EnvoyerRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('envoyerSats', $boutique);

        return response()->json($this->portefeuille->apercuEnvoi(
            $boutique,
            $request->input('destination'),
            $request->filled('montant_sats') ? (int) $request->input('montant_sats') : null,
        ));
    }

    /** POST /wallet/envoyer — propriétaire seulement, mot de passe revérifié, journal d'audit. */
    public function envoyer(EnvoyerRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('envoyerSats', $boutique);

        if (! Hash::check((string) $request->input('password'), $request->user()->password)) {
            Audit::enregistrer('wallet.envoi_refuse_mot_de_passe', $boutique);

            throw ValidationException::withMessages(['password' => 'Mot de passe incorrect.']);
        }

        return response()->json($this->portefeuille->envoyer(
            $boutique,
            $request->user(),
            $request->input('destination'),
            $request->filled('montant_sats') ? (int) $request->input('montant_sats') : null,
        ));
    }

    private function boutique(): Boutique
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('voirWallet', $boutique);

        return $boutique;
    }
}
