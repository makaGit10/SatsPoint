<?php

namespace App\Http\Middleware;

use App\Services\BoutiqueCourante;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `boutique.active` — une boutique SUSPENDUE par la plateforme (CAHIER § 6.16) n'est plus utilisable :
 * ses membres reçoivent 403 BOUTIQUE_SUSPENDUE sur tout l'espace connecté, sauf /moi (le front
 * affiche l'explication) et la déconnexion.
 */
class VerifierBoutiqueActive
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is('api/v1/moi', 'api/v1/auth/*')) {
            return $next($request);
        }

        $boutique = null;

        try {
            $boutique = $this->courante->obtenir();
        } catch (\Throwable) {
            // sans boutique courante : rien à vérifier
        }

        if ($boutique !== null && ! $boutique->estActive()) {
            return response()->json([
                'message' => 'Cette boutique est suspendue. Contactez SatsPoint.',
                'code' => 'BOUTIQUE_SUSPENDUE',
            ], 403);
        }

        return $next($request);
    }
}
