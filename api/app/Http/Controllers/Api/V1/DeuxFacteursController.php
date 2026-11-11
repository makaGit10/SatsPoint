<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\CodeDeuxFacteursRequest;
use App\Http\Requests\Auth\DesactiverDeuxFacteursRequest;
use App\Http\Resources\UtilisateurResource;
use App\Models\User;
use App\Services\BoutiqueCourante;
use App\Services\DeuxFacteurs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * /auth/2fa/* — initialiser, activer, vérifier, désactiver (CONTRAT_API vague 3 § 2). 5 requêtes / min.
 */
class DeuxFacteursController extends Controller
{
    public function __construct(
        private readonly DeuxFacteurs $deuxFa,
        private readonly BoutiqueCourante $courante,
    ) {}

    /** POST /auth/2fa/initialiser → { secret, otpauth_url, qr_svg } */
    public function initialiser(Request $request): JsonResponse
    {
        /** @var User $utilisateur */
        $utilisateur = $request->user();

        $resultat = $this->deuxFa->initialiser($utilisateur);

        Audit::enregistrer('auth.2fa_initialisee', $utilisateur, [], $utilisateur);

        return response()->json($resultat)->header('Cache-Control', 'no-store, private');
    }

    /** POST /auth/2fa/activer { code } → { codes_secours: string[8], deux_fa } */
    public function activer(CodeDeuxFacteursRequest $request): JsonResponse
    {
        /** @var User $utilisateur */
        $utilisateur = $request->user();

        try {
            $codes = $this->deuxFa->activer($utilisateur, $request->input('code'));
        } catch (ErreurMetier $e) {
            if ($e->codeErreur === 'CODE_INVALIDE') {
                Audit::enregistrer('auth.2fa_echec', $utilisateur, ['etape' => 'activation'], $utilisateur);
            }
            throw $e;
        }

        // Celui qui vient d'activer a prouvé la possession du téléphone : la session est validée.
        $request->session()->put(DeuxFacteurs::CLE_SESSION, now()->toIso8601String());

        Audit::enregistrer('auth.2fa_activee', $utilisateur, [], $utilisateur);

        return response()->json([
            'codes_secours' => $codes,
            'deux_fa' => DeuxFacteurs::etat($utilisateur, $request),
        ])->header('Cache-Control', 'no-store, private');
    }

    /** POST /auth/2fa/verifier { code } → { utilisateur, methode: 'totp'|'secours', codes_secours_restants } */
    public function verifier(CodeDeuxFacteursRequest $request): JsonResponse
    {
        /** @var User $utilisateur */
        $utilisateur = $request->user();

        try {
            $methode = $this->deuxFa->verifier($utilisateur, $request->input('code'), $request);
        } catch (ErreurMetier $e) {
            if ($e->codeErreur === 'CODE_INVALIDE') {
                Audit::enregistrer('auth.2fa_echec', $utilisateur, [], $utilisateur);
            }
            throw $e;
        }

        Audit::enregistrer('auth.2fa_verifiee', $utilisateur, ['methode' => $methode], $utilisateur);

        return response()->json([
            'utilisateur' => (new UtilisateurResource($utilisateur->fresh(), $this->courante->membre()))->resolve($request),
            // Ajouts au contrat : méthode utilisée, codes de secours restants (alerte quand il en reste peu).
            'methode' => $methode,
            'codes_secours_restants' => DeuxFacteurs::codesSecoursRestants($utilisateur->fresh()),
        ]);
    }

    /**
     * GET /auth/2fa/code-local → { code } — développement LOCAL uniquement (route déclarée seulement si
     * satspoint.deux_fa_code_local) : le code du moment pour le secret de la personne connectée.
     */
    public function codeLocal(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local') && config('satspoint.deux_fa_code_local'), 404);

        /** @var User $utilisateur */
        $utilisateur = $request->user();
        $code = $this->deuxFa->codeCourant($utilisateur);
        abort_if($code === null, 404);

        return response()->json(['code' => $code])->header('Cache-Control', 'no-store, private');
    }

    /** DELETE /auth/2fa { password } → 204 */
    public function desactiver(DesactiverDeuxFacteursRequest $request): Response
    {
        /** @var User $utilisateur */
        $utilisateur = $request->user();

        if (! Hash::check((string) $request->input('password'), $utilisateur->password)) {
            Audit::enregistrer('auth.2fa_desactivation_refusee', $utilisateur, [], $utilisateur);

            throw ValidationException::withMessages(['password' => 'Mot de passe incorrect.']);
        }

        $this->deuxFa->desactiver($utilisateur);
        $request->session()->forget(DeuxFacteurs::CLE_SESSION);

        Audit::enregistrer('auth.2fa_desactivee', $utilisateur, [], $utilisateur);

        return response()->noContent();
    }
}
