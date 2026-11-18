<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\DeuxFacteurs;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `2fa.obligatoire` — console plateforme (/admin/*) : le super-admin doit avoir ACTIVÉ la 2FA et l'avoir
 * VÉRIFIÉE dans cette session. Sinon 403 `{ code: 'DEUX_FA_REQUISE', etape: 'activer' | 'verifier' }`
 * (CONTRAT_API V3.4 ; `etape` est un ajout pour que le front ouvre directement le bon écran).
 * Les routes /auth/2fa/* ne portent pas ce middleware : on peut toujours activer / vérifier.
 */
class ExigerDeuxFacteurs
{
    public function handle(Request $request, Closure $next): Response
    {
        $utilisateur = $request->user();

        if (! $utilisateur instanceof User) {
            return response()->json(['message' => 'Connexion requise.', 'code' => 'NON_AUTHENTIFIE'], 401);
        }

        // Suspendue temporairement (SUPERADMIN_2FA_OBLIGATOIRE=false) et pas encore activée : accès sans code.
        if (! $utilisateur->deuxFaRequise() && ! $utilisateur->deuxFaActive()) {
            return $next($request);
        }

        if (! $utilisateur->deuxFaActive()) {
            return response()->json([
                'message' => 'La double authentification est obligatoire pour la console plateforme. Activez-la dans votre profil.',
                'code' => 'DEUX_FA_REQUISE',
                'etape' => 'activer',
            ], 403);
        }

        if (! DeuxFacteurs::sessionValidee($request)) {
            return response()->json([
                'message' => 'Saisissez le code de votre application d\'authentification pour continuer.',
                'code' => 'DEUX_FA_REQUISE',
                'etape' => 'verifier',
            ], 403);
        }

        return $next($request);
    }
}
