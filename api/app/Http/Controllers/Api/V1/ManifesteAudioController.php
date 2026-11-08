<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Audio;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * GET /api/v1/audio/manifeste/{langue} → { langue, version, audios: { cle: url } }
 * Lit les audios PUBLIÉS ; cache 60 s ; ETag (304 si inchangé).
 */
class ManifesteAudioController extends Controller
{
    public const CLE_CACHE = 'audio.manifeste.';

    public function __invoke(Request $request, string $langue): Response
    {
        $langues = array_column(config('satspoint.langues_audio'), 'code');

        abort_unless(in_array($langue, $langues, true), 404);

        $manifeste = Cache::remember(self::CLE_CACHE.$langue, 60, fn () => $this->construire($langue));

        $etag = '"'.hash('sha256', $manifeste['version'].'|'.$langue).'"';

        $reponse = response()->json($manifeste)
            ->setEtag($etag)
            ->setPublic()
            ->setMaxAge(60)
            ->header('Vary', 'Accept-Encoding');

        if ($reponse->isNotModified($request)) {
            return $reponse; // 304, corps vide
        }

        return $reponse;
    }

    public static function invaliderCache(): void
    {
        foreach (array_column(config('satspoint.langues_audio'), 'code') as $langue) {
            Cache::forget(self::CLE_CACHE.$langue);
        }
    }

    private function construire(string $langue): array
    {
        $audios = Audio::query()
            ->join('cles_audio', 'cles_audio.id', '=', 'audios.cle_audio_id')
            ->where('audios.langue', $langue)
            ->where('audios.statut', Audio::STATUT_PUBLIE)
            ->orderBy('cles_audio.cle')
            ->get(['cles_audio.cle', 'audios.empreinte', 'audios.publie_at']);

        $liste = [];
        $dernier = null;

        foreach ($audios as $audio) {
            $liste[$audio->cle] = url(sprintf('/audio/%s/%s.%s.mp3', $langue, $audio->cle, substr($audio->empreinte, 0, 16)));
            $dernier = max($dernier ?? '', (string) $audio->publie_at);
        }

        return [
            'langue' => $langue,
            'version' => substr(hash('sha256', $langue.'|'.count($liste).'|'.($dernier ?? '0').'|'.implode(',', array_keys($liste))), 0, 16),
            'audios' => (object) $liste,
        ];
    }
}
