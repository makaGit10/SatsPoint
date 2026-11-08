<?php

namespace App\Http\Controllers;

use App\Services\CoursChange;
use App\Services\PasserelleLightning;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * GET /sante — état des dépendances (surveillance externe). Aucune information sensible.
 */
class SanteController extends Controller
{
    public function __invoke(PasserelleLightning $passerelle, CoursChange $cours): JsonResponse
    {
        $coursActuel = null;
        try {
            $coursActuel = $cours->actuel();
        } catch (\Throwable) {
            // base indisponible : signalé plus bas
        }
        $base = $this->verifier(fn () => DB::select('select 1') !== []);
        $redis = $this->verifier(function () {
            $cle = 'sante:'.bin2hex(random_bytes(4));
            $temoin = 'ok-'.bin2hex(random_bytes(4));
            Cache::store(config('cache.default'))->put($cle, $temoin, 10);

            return Cache::store(config('cache.default'))->pull($cle) === $temoin;
        });
        $reverb = $this->verifier(fn () => Http::timeout(2)->connectTimeout(2)->get(sprintf(
            '%s://%s:%d/up',
            config('broadcasting.connections.reverb.options.scheme', 'http'),
            config('broadcasting.connections.reverb.options.host', 'reverb'),
            (int) config('broadcasting.connections.reverb.options.port', 8080),
        ))->successful());
        $passerelleOk = $this->verifier(fn () => $passerelle->joignable());

        $statut = $base ? ($redis && $reverb ? 'ok' : 'degrade') : 'indisponible';

        return response()->json([
            'statut' => $statut,
            'base' => $base,
            'redis' => $redis,
            'reverb' => $reverb,
            'passerelle' => $passerelleOk,
            'cours' => ['age_s' => $coursActuel['age_s'] ?? null, 'disponible' => (bool) ($coursActuel['disponible'] ?? false)],
            'version' => config('satspoint.version'),
            'horodatage' => now()->toIso8601String(),
        ], $base ? 200 : 503)->header('Cache-Control', 'no-store');
    }

    private function verifier(callable $test): bool
    {
        try {
            return (bool) $test();
        } catch (\Throwable) {
            return false;
        }
    }
}
