<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Caisse\CreerVenteRequest;
use App\Http\Requests\Caisse\ListerVentesRequest;
use App\Http\Requests\Caisse\NouvelleTentativeRequest;
use App\Http\Resources\PaiementResource;
use App\Http\Resources\VenteCourteResource;
use App\Http\Resources\VenteResource;
use App\Models\Boutique;
use App\Models\Vente;
use App\Services\BoutiqueCourante;
use App\Services\Caisse;
use App\Services\ExportVentes;
use App\Services\MachineEtatPaiement;
use App\Services\RequeteVentes;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class VenteController extends Controller
{
    public function __construct(
        private readonly BoutiqueCourante $courante,
        private readonly Caisse $caisse,
        private readonly MachineEtatPaiement $machine,
    ) {}

    /** GET /ventes → { ventes: VenteCourte[], curseur_suivant, totaux } */
    public function index(ListerVentesRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('viewAny', Vente::class);

        $requete = RequeteVentes::construire($this->courante->membre(), $request->user(), $this->fuseau($boutique), $request->filtres());
        $totaux = RequeteVentes::totaux($requete);

        $page = (clone $requete)
            ->with(['caissier:id,ulid,nom', 'paiementReussi:id,methode,operateur,montant_sats'])
            ->orderByDesc('ventes.created_at')->orderByDesc('ventes.id')
            ->cursorPaginate((int) $request->input('limite', 30), ['ventes.*'], 'curseur', $request->input('curseur'));

        return response()->json([
            'ventes' => VenteCourteResource::collection($page->items())->resolve(),
            'curseur_suivant' => $page->nextCursor()?->encode(),
            'totaux' => $totaux,
        ]);
    }

    /** POST /ventes → 201 { vente } (vente + 1re tentative) */
    public function store(CreerVenteRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('create', Vente::class);

        $vente = $this->caisse->creerVente($boutique, $request->user(), $request->validated());

        return (new VenteResource($this->charger($vente)))->response()->setStatusCode(201);
    }

    /** GET /ventes/{vente} → { vente } */
    public function show(Vente $vente): VenteResource
    {
        $this->authorize('view', $vente);

        return new VenteResource($this->charger($vente));
    }

    /** POST /ventes/{vente}/paiements → 201 { paiement } : nouvelle tentative. */
    public function nouvelleTentative(NouvelleTentativeRequest $request, Vente $vente): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('payer', $vente);

        $paiement = $this->caisse->nouvelleTentative($boutique, $vente, $request->input('methode'), $request->input('operateur'));

        return (new PaiementResource($paiement))->response()->setStatusCode(201);
    }

    /** POST /ventes/{vente}/annuler → { vente } */
    public function annuler(Vente $vente): VenteResource
    {
        $this->authorize('annuler', $vente);

        $vente = $this->machine->annulerVente($vente, request()->user());

        return new VenteResource($this->charger($vente));
    }

    /** GET /exports/ventes?format=csv (propriétaire / gérant) */
    public function exporter(ListerVentesRequest $request, ExportVentes $export): StreamedResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('exporter', Vente::class);

        $fuseau = $this->fuseau($boutique);
        $requete = RequeteVentes::construire($this->courante->membre(), $request->user(), $fuseau, $request->filtres());
        $nom = sprintf('ventes-%s-%s.csv', Str::slug($boutique->nom) ?: 'boutique', now($fuseau)->format('Ymd-Hi'));

        return $export->csv($requete, $fuseau, $nom);
    }

    private function charger(Vente $vente): Vente
    {
        return $vente->load(['caissier:id,ulid,nom', 'paiementReussi', 'lignes.article:id,ulid', 'paiements']);
    }

    private function fuseau(Boutique $boutique): string
    {
        return $boutique->fuseau ?: config('satspoint.boutique.fuseau');
    }
}
