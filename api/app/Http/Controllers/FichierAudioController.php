<?php

namespace App\Http\Controllers;

use App\Models\Audio;
use App\Services\Audio\StockageAudio;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * GET /audio/{langue}/{fichier} — fichier audio publié (CAHIER § 6.12).
 *
 * Le nom est contraint par la route ({cle}.{empreinte8}.mp3, sans « / » ni « .. ») et doit correspondre à un
 * enregistrement publié ou archivé en base : aucun listing, aucun parcours du disque, brouillons inaccessibles.
 * Le contenu vient de la base (audio_fichiers), via un cache disque reconstruit à la demande (StockageAudio).
 * URL versionnée par l'empreinte → cache immuable d'un an ; ETag = empreinte SHA-256.
 */
class FichierAudioController extends Controller
{
    public function __construct(private readonly StockageAudio $stockage) {}

    public function __invoke(Request $request, string $langue, string $fichier): Response
    {
        $chemin = sprintf('%s/%s/%s', config('satspoint.audio.dossier_public', 'audio'), $langue, $fichier);

        $audio = Audio::query()
            ->where('chemin', $chemin)
            ->whereIn('statut', [Audio::STATUT_PUBLIE, Audio::STATUT_ARCHIVE])
            ->first(['id', 'chemin', 'empreinte', 'statut']);

        if ($audio === null) {
            throw new NotFoundHttpException;
        }

        return $this->stockage->reponse($request, $audio, [
            'Content-Type' => 'audio/mpeg',
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
            'Accept-Ranges' => 'bytes',
            'Cross-Origin-Resource-Policy' => 'cross-origin',
        ], true);
    }
}
