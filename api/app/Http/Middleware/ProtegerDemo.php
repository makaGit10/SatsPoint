<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\V1\AuthController;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `demo.protege` — pendant l'accès rapide du jury (DEMO_CONNEXION_RAPIDE=true), la boutique de démonstration est
 * partagée par tous les visiteurs : les actions qui la casseraient pour les suivants (portefeuille, clés de paiement,
 * équipe, réglages, suppression d'articles, double authentification…) sont refusées aux comptes de démonstration.
 */
class ProtegerDemo
{
    public function handle(Request $request, Closure $next): Response
    {
        $utilisateur = $request->user();
        if (config('satspoint.demo.connexion_rapide') && $utilisateur !== null
            && in_array(mb_strtolower((string) $utilisateur->email), array_map('mb_strtolower', AuthController::profilsDemoConfigures()), true)) {
            return response()->json([
                'message' => 'Action désactivée sur la boutique de démonstration partagée.',
                'code' => 'DEMO_PROTEGE',
            ], 403);
        }

        return $next($request);
    }
}
