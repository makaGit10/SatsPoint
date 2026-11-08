<?php

namespace App\Http\Middleware;

use App\Services\SignatureHmac;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authentification HMAC des requêtes de la passerelle (CONTRAT_PASSERELLE § 1) :
 * signature à temps constant, fenêtre d'horodatage ±30 s, nonce à usage unique (5 min, Redis).
 */
class VerifierSignaturePasserelle
{
    public function __construct(private readonly SignatureHmac $signature) {}

    public function handle(Request $request, Closure $next): Response
    {
        $horodatage = (string) $request->header(SignatureHmac::EN_TETE_HORODATAGE, '');
        $nonce = (string) $request->header(SignatureHmac::EN_TETE_NONCE, '');
        $signature = (string) $request->header(SignatureHmac::EN_TETE_SIGNATURE, '');

        if (! $this->signature->secretConfigure()) {
            Log::critical('passerelle: GATEWAY_HMAC_SECRET absent, routes internes fermées');

            return $this->refus('SIGNATURE_INVALIDE');
        }

        if ($horodatage === '' || $nonce === '' || $signature === '' || ! ctype_digit($horodatage) || ! SignatureHmac::nonceValide($nonce)) {
            return $this->refus('SIGNATURE_INVALIDE');
        }

        $fenetre = (int) config('satspoint.passerelle.fenetre_s', 30);

        if (abs(time() - (int) $horodatage) > $fenetre) {
            return $this->refus('HORODATAGE_HORS_FENETRE');
        }

        $valide = $this->signature->verifier(
            $signature,
            $horodatage,
            $nonce,
            $request->getMethod(),
            $request->getRequestUri(),
            (string) $request->getContent(),
        );

        if (! $valide) {
            Log::warning('passerelle: signature HMAC invalide', ['ip' => $request->ip(), 'chemin' => $request->path()]);

            return $this->refus('SIGNATURE_INVALIDE');
        }

        // Anti-rejeu : le nonce n'est accepté qu'une seule fois pendant la durée de la mémoire.
        $ttl = (int) config('satspoint.passerelle.nonce_ttl_s', 300);

        if (! Cache::add('hmac:nonce:'.strtolower($nonce), 1, $ttl)) {
            Log::warning('passerelle: rejeu détecté', ['ip' => $request->ip(), 'chemin' => $request->path()]);

            return $this->refus('REJEU');
        }

        return $next($request);
    }

    private function refus(string $code): Response
    {
        return response()->json(['message' => 'Requête non authentifiée.', 'code' => $code], 401);
    }
}
