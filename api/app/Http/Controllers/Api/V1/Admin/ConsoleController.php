<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\JournalRequest;
use App\Http\Requests\Admin\ListerBoutiquesRequest;
use App\Http\Requests\Admin\StatutBoutiqueRequest;
use App\Models\Boutique;
use App\Services\ConsolePlateforme;
use App\Services\EtatSysteme;
use Illuminate\Http\JsonResponse;

/**
 * Console plateforme (CAHIER § 6.16) — super-admin + 2FA (middleware du groupe /admin).
 * Aucun accès aux ventes, au portefeuille ni aux clés PayTech des boutiques : agrégats uniquement.
 */
class ConsoleController extends Controller
{
    public function __construct(private readonly ConsolePlateforme $console) {}

    /** GET /admin/boutiques?q=&statut=&curseur= */
    public function boutiques(ListerBoutiquesRequest $request): JsonResponse
    {
        return response()->json($this->console->boutiques($request->filtres()));
    }

    /** PATCH /admin/boutiques/{boutique} { statut } → { boutique } */
    public function statutBoutique(StatutBoutiqueRequest $request, Boutique $boutique): JsonResponse
    {
        $boutique = $this->console->changerStatut($boutique, $request->input('statut'), $request->user());

        // Relecture avec les agrégats pour renvoyer la même forme que la liste.
        $liste = $this->console->boutiques(['q' => $boutique->ulid, 'limite' => 1]);

        return response()->json(['boutique' => $liste['boutiques'][0] ?? ['ulid' => $boutique->ulid, 'statut' => $boutique->statut]]);
    }

    /** GET /admin/sante */
    public function sante(EtatSysteme $etat): JsonResponse
    {
        return response()->json($etat->detail())->header('Cache-Control', 'no-store, private');
    }

    /** GET /admin/journal?action=&boutique=&utilisateur=&du=&au=&curseur= */
    public function journal(JournalRequest $request): JsonResponse
    {
        return response()->json($this->console->journal($request->filtres()));
    }

    /** GET /admin/statistiques */
    public function statistiques(): JsonResponse
    {
        return response()->json($this->console->statistiques());
    }
}
