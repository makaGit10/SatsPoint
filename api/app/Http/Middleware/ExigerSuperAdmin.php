<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `super.admin` — console plateforme (/admin/*) réservée au rôle plateforme `super_admin`.
 *
 * Middleware dédié (plutôt que `can:plateforme`) pour s'exécuter AVANT la résolution des paramètres de route
 * (SubstituteBindings, voir bootstrap/app.php) : un non-admin reçoit toujours 403, jamais un 404 qui dirait
 * si un identifiant existe.
 */
class ExigerSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $utilisateur = $request->user();

        if (! $utilisateur instanceof User) {
            return response()->json(['message' => 'Connexion requise.', 'code' => 'NON_AUTHENTIFIE'], 401);
        }

        if (! $utilisateur->estSuperAdmin()) {
            return response()->json(['message' => 'Action non autorisée.', 'code' => 'INTERDIT'], 403);
        }

        return $next($request);
    }
}
