<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Audio;
use App\Services\Catalogue;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * GET /api/v1/audio/manifeste/{langue} → { langue, version, audios: { cle: url } }
 *
 * Lit les audios PUBLIÉS ; URL versionnées immuables (/audio/{langue}/{cle}.{empreinte8}.mp3) ;
 * `version` = empreinte du contenu du manifeste ; cache (invalidé à chaque publication) ; ETag / 304.
 */
class ManifesteAudioController extends Controller
{
    public const CLE_CACHE = 'audio.manifeste.';

    /** Durée du cache applicatif : la publication l'invalide, c'est une simple sécurité. */
    private const CACHE_S = 3600;

    public function __invoke(Request $request, string $langue): Response
    {
        abort_unless(in_array($langue, self::langues(), true), 404);

        $manifeste = Cache::remember(self::CLE_CACHE.$langue, self::CACHE_S, fn () => $this->construire($langue));

        $reponse = response()->json($manifeste)
            ->setEtag('"'.$manifeste['version'].'"')
            ->setPublic()
            ->setMaxAge(60)
            ->header('Vary', 'Accept-Encoding');

        // 304 (corps vide) si le client possède déjà cette version.
        $reponse->isNotModified($request);

        return $reponse;
    }

    public static function invaliderCache(): void
    {
        foreach (self::langues() as $langue) {
            Cache::forget(self::CLE_CACHE.$langue);
        }
    }

    /** @return list<string> langues existantes (actives ou désactivées : les appareils qui l'avaient choisie gardent leurs audios) */
    public static function langues(): array
    {
        return Catalogue::codesLangues();
    }

    private function construire(string $langue): array
    {
        $audios = Audio::query()
            ->join('cles_audio', 'cles_audio.id', '=', 'audios.cle_audio_id')
            ->where('audios.langue', $langue)
            ->where('audios.statut', Audio::STATUT_PUBLIE)
            ->orderBy('cles_audio.cle')
            ->get(['cles_audio.cle', 'audios.chemin']);

        $liste = [];

        foreach ($audios as $audio) {
            $liste[$audio->cle] = url('/'.ltrim($audio->chemin, '/'));
        }

        return [
            'langue' => $langue,
            // Empreinte du contenu : change dès qu'une clé est ajoutée, retirée ou remplacée (URL différente).
            'version' => substr(hash('sha256', $langue.'|'.json_encode($liste)), 0, 16),
            'audios' => (object) $liste,
        ];
    }
}
