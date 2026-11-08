<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Caisse\ConfirmerManuellementRequest;
use App\Http\Resources\PaiementResource;
use App\Http\Resources\VenteResource;
use App\Models\Boutique;
use App\Models\Paiement;
use App\Services\BoutiqueCourante;
use App\Services\MachineEtatPaiement;
use App\Services\PaiementsLightning;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PaiementController extends Controller
{
    public function __construct(
        private readonly BoutiqueCourante $courante,
        private readonly PaiementsLightning $lightning,
        private readonly MachineEtatPaiement $machine,
    ) {}

    /** GET /paiements/{paiement} → { paiement, vente: { ulid, statut, numero } } */
    public function show(Paiement $paiement): JsonResponse
    {
        $this->authorize('view', $paiement);

        return $this->reponse($paiement);
    }

    /** POST /paiements/{paiement}/verifier (20/min par paiement) : consultation forcée du portefeuille / PayTech. */
    public function verifier(Paiement $paiement): JsonResponse
    {
        $this->authorize('verifier', $paiement);

        if ($paiement->estLightning() && $paiement->estEnAttente()) {
            $this->lightning->verifier($paiement);
        }
        // PayTech : aucune API de consultation publique documentée → la confirmation arrive par IPN ; no-op.
        // Wave manuel : confirmation humaine uniquement.

        return $this->reponse($paiement->refresh());
    }

    /** POST /paiements/{paiement}/simuler → { paiement } uniquement si paiement.simule, sinon 404. */
    public function simuler(Paiement $paiement): JsonResponse
    {
        $this->authorize('simuler', $paiement);

        // Jamais en production, sauf autorisation explicite (même garde-fou que la passerelle : ALLOW_MOCK_WALLET).
        if (! $paiement->simule || (app()->isProduction() && ! config('satspoint.demo.mock_autorise_en_production'))) {
            throw new NotFoundHttpException;
        }

        if (! $paiement->estEnAttente()) {
            throw new ErreurMetier('PAIEMENT_CLOS', 'Cette tentative n\'est plus en attente.', 409);
        }

        $boutique = $this->courante->exiger(Boutique::class);

        if ($paiement->estLightning()) {
            // La passerelle règle la facture simulée puis renvoie payment_received → job → revérification.
            $this->lightning->simuler($paiement, $boutique);
            // En plus de l'événement asynchrone, on vérifie tout de suite : écran vert immédiat.
            $this->lightning->verifier($paiement);
        } else {
            $this->machine->reussir($paiement, MachineEtatPaiement::SOURCE_VERIFICATION, 'simulation', [
                'paiement' => $paiement->ulid, 'simulation' => true,
            ], ['operateur' => $paiement->operateur ?? 'wave']);
        }

        return $this->reponse($paiement->refresh());
    }

    /** POST /paiements/{paiement}/confirmer-manuellement { confirmation: true } — wave_manuel, propriétaire / gérant. */
    public function confirmerManuellement(ConfirmerManuellementRequest $request, Paiement $paiement): JsonResponse
    {
        $this->authorize('confirmerManuellement', $paiement);

        if (! $paiement->estWaveManuel()) {
            throw new ErreurMetier('CONFIRMATION_IMPOSSIBLE', 'Seul un paiement Wave direct se confirme manuellement.', 409);
        }

        $resultat = $this->machine->reussir($paiement, MachineEtatPaiement::SOURCE_MANUEL, 'confirmation_manuelle', [
            'paiement' => $paiement->ulid, 'par' => $request->user()->ulid,
        ], ['confirme_par' => $request->user(), 'operateur' => 'wave']);

        if ($resultat['effet'] !== 'deja_regle' && $resultat['effet'] !== 'deja_traite') {
            Audit::enregistrer('paiement.confirme_manuellement', $paiement, [
                'vente' => $resultat['vente']->ulid, 'numero' => $resultat['vente']->numeroAffiche(),
                'montant_xof' => $paiement->montant_xof, 'effet' => $resultat['effet'],
            ]);
        }

        return $this->reponse($paiement->refresh());
    }

    private function reponse(Paiement $paiement): JsonResponse
    {
        $paiement->load(['vente' => fn ($q) => $q->with(['caissier:id,ulid,nom', 'paiementReussi', 'lignes.article:id,ulid', 'paiements'])]);
        $vente = $paiement->vente;

        return response()->json([
            'paiement' => (new PaiementResource($paiement))->resolve(),
            'vente' => ['ulid' => $vente->ulid, 'statut' => $vente->statut, 'numero' => $vente->numeroAffiche()]
                + (request()->boolean('detail') ? ['detail' => (new VenteResource($vente))->resolve()] : []),
        ]);
    }
}
