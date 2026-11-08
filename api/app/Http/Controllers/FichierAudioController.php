<?php

namespace App\Http\Controllers;

use App\Models\Audio;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * GET /audio/{langue}/{fichier} — fichier audio publié (CAHIER § 6.12).
 *
 * Le nom est contraint par la route ({cle}.{empreinte8}.mp3, sans « / » ni « .. ») et doit correspondre à un
 * enregistrement publié ou archivé en base : aucun listing, aucun parcours du disque, brouillons inaccessibles.
 * URL versionnée par l'empreinte → cache immuable d'un an.
 */
class FichierAudioController extends Controller
{
    public function __invoke(Request $request, string $langue, string $fichier): BinaryFileResponse
    {
        $chemin = sprintf('%s/%s/%s', config('satspoint.audio.dossier_public', 'audio'), $langue, $fichier);

        $audio = Audio::query()
            ->where('chemin', $chemin)
            ->whereIn('statut', [Audio::STATUT_PUBLIE, Audio::STATUT_ARCHIVE])
            ->first(['id', 'chemin', 'statut']);

        $disque = Storage::disk('public');

        if ($audio === null || ! $disque->exists($chemin)) {
            throw new NotFoundHttpException;
        }

        $reponse = response()->file($disque->path($chemin), [
            'Content-Type' => 'audio/mpeg',
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
            'Accept-Ranges' => 'bytes',
            'Cross-Origin-Resource-Policy' => 'cross-origin',
        ]);

        $reponse->setEtag('"'.substr($fichier, -12, 8).'"');
        $reponse->isNotModified($request);

        return $reponse;
    }
}
