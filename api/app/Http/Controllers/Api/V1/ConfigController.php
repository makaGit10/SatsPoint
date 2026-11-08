<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ConnexionWallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/**
 * GET /api/v1/config — configuration publique du front (aucun secret : la clé Reverb est publique).
 */
class ConfigController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $reverb = config('satspoint.reverb_public');

        return response()->json([
            'app' => [
                'nom' => config('app.name'),
                'env' => config('app.env'),
                'demo' => $this->modeDemo(),
                'version' => config('satspoint.version'),
            ],
            'reverb' => [
                'cle' => $reverb['cle'],
                'hote' => $reverb['hote'],
                'port' => (int) $reverb['port'],
                'schema' => $reverb['schema'],
            ],
            'locales' => config('satspoint.locales'),
            'langues_audio' => config('satspoint.langues_audio'),
        ]);
    }

    /**
     * Mode démonstration = paiements simulés : aucune URI NWC réelle fournie à la plateforme,
     * ou connexion de la boutique démo sur un portefeuille simulé (mock://).
     */
    private function modeDemo(): bool
    {
        return Cache::remember('config.demo', 60, function (): bool {
            if (blank(config('satspoint.demo.nwc_uri'))) {
                return true;
            }

            try {
                $connexions = ConnexionWallet::toutesBoutiques()
                    ->where('statut', ConnexionWallet::STATUT_ACTIVE)
                    ->get(['id', 'boutique_id', 'uri_chiffree', 'statut']);
            } catch (\Throwable) {
                return true;
            }

            if ($connexions->isEmpty()) {
                return true;
            }

            return $connexions->every(fn (ConnexionWallet $c) => $c->estSimulee());
        });
    }
}
