<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PreferencesRequest;
use App\Http\Resources\UtilisateurResource;
use App\Services\BoutiqueCourante;
use Illuminate\Http\Request;

class MoiController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** GET /moi */
    public function show(Request $request): UtilisateurResource
    {
        return new UtilisateurResource($request->user(), $this->membreAvecBoutique());
    }

    /** PATCH /moi/preferences → { utilisateur } */
    public function preferences(PreferencesRequest $request): UtilisateurResource
    {
        $utilisateur = $request->user();

        $utilisateur->preferences = array_merge($utilisateur->preferencesCompletes(), $request->validated());
        $utilisateur->save();

        return new UtilisateurResource($utilisateur, $this->membreAvecBoutique());
    }

    private function membreAvecBoutique()
    {
        $membre = $this->courante->membre();

        if ($membre !== null && $membre->boutique !== null) {
            $membre->boutique->loadMissing(['connexionWallet', 'comptePaytech']);
        }

        return $membre;
    }
}
