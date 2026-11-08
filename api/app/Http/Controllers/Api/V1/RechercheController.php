<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Recherche\RechercheRequest;
use App\Http\Requests\Recherche\TermeRecentRequest;
use App\Models\Boutique;
use App\Services\BoutiqueCourante;
use App\Services\RechercheGlobale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Recherche globale (CONTRAT_API vague 3 § 4) : 60 requêtes / min / utilisateur. */
class RechercheController extends Controller
{
    public function __construct(
        private readonly BoutiqueCourante $courante,
        private readonly RechercheGlobale $recherche,
    ) {}

    /** GET /recherche?q= → { groupes } */
    public function chercher(RechercheRequest $request): JsonResponse
    {
        $this->courante->exiger(Boutique::class);
        $membre = $this->courante->membre();

        abort_if($membre === null || ! $membre->actif, 403);

        $locale = (string) ($request->user()->preferencesCompletes()['locale'] ?? 'fr');

        return response()->json($this->recherche->chercher($request->input('q'), $membre, $request->user(), $locale));
    }

    /** GET /recherche/recentes → { recentes: string[] } */
    public function recentes(Request $request): JsonResponse
    {
        return response()->json(['recentes' => $this->recherche->recentes($request->user())]);
    }

    /** POST /recherche/recentes { terme } → 204 */
    public function memoriser(TermeRecentRequest $request): Response
    {
        $this->recherche->memoriser($request->user(), $request->input('terme'));

        return response()->noContent();
    }

    /** DELETE /recherche/recentes → 204 */
    public function effacer(Request $request): Response
    {
        $this->recherche->effacerRecentes($request->user());

        return response()->noContent();
    }
}
