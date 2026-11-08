<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * En-têtes de sécurité (règle n° 10) sur toutes les réponses de l'API.
 * L'API ne sert aucune page : la CSP interdit tout chargement et tout encadrement.
 */
class EnTetesSecurite
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $headers = $response->headers;

        $headers->set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
        $headers->set('Cross-Origin-Opener-Policy', 'same-origin');
        $headers->set('Cross-Origin-Resource-Policy', 'same-site');
        $headers->remove('X-Powered-By');
        $headers->remove('Server');

        if ($request->isSecure()) {
            $headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        // Réponses de l'espace connecté : jamais mises en cache par le navigateur ou un proxy,
        // sauf si le contrôleur a fixé sa propre politique (manifeste audio, par exemple).
        if ($request->is('api/*') && ! $headers->has('ETag') && $headers->get('Cache-Control') === 'no-cache, private') {
            $headers->set('Cache-Control', 'no-store, private');
        }

        return $response;
    }
}
