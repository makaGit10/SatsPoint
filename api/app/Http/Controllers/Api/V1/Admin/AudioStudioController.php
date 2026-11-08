<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\DeposerAudioRequest;
use App\Http\Requests\Admin\MatriceAudioRequest;
use App\Http\Requests\Admin\PublierAudioRequest;
use App\Http\Resources\AudioResource;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Services\Audio\StockageAudio;
use App\Services\Audio\StudioAudio;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as ReponseVide;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Studio audio (CAHIER § 6.13) — super-admin + 2FA (middleware du groupe /admin).
 * Les journaux ne contiennent que des identifiants.
 */
class AudioStudioController extends Controller
{
    public function __construct(private readonly StudioAudio $studio) {}

    /** GET /admin/audio/matrice */
    public function matrice(MatriceAudioRequest $request): JsonResponse
    {
        return response()->json($this->studio->matrice($request->filtres()));
    }

    /** POST /admin/audio (multipart) → 202 { audio } : brouillon en traitement. */
    public function store(DeposerAudioRequest $request): JsonResponse
    {
        $cle = CleAudio::query()->where('cle', $request->input('cle'))->firstOrFail();

        $audio = $this->studio->deposer($cle, $request->input('langue'), $request->file('fichier'), $request->user());

        return (new AudioResource($audio->setRelation('cle', $cle)))->response()->setStatusCode(202);
    }

    /** GET /admin/audio/{audio} → { audio } (suivi du traitement) */
    public function show(Audio $audio): AudioResource
    {
        return new AudioResource($audio->load('cle:id,cle'));
    }

    /** POST /admin/audio/publier { ids } | { cle, langue } → { publies, audios } */
    public function publier(PublierAudioRequest $request): JsonResponse
    {
        $ids = $request->has('ids')
            ? array_map('intval', (array) $request->input('ids'))
            : [$this->studio->dernierBrouillon($request->input('cle'), $request->input('langue'))->id];

        $publies = $this->studio->publier($ids, $request->user());

        return response()->json([
            'publies' => count($publies),
            'audios' => AudioResource::collection($publies)->resolve(), // ajout au contrat
        ]);
    }

    /** DELETE /admin/audio/{audio} → 204 (brouillon, archive ou erreur seulement). */
    public function destroy(Request $request, Audio $audio): ReponseVide
    {
        $this->studio->supprimer($audio, $request->user());

        return response()->noContent();
    }

    /**
     * GET /admin/audio/{audio}/ecouter — fichier traité (brouillon compris), lu depuis la base (cache disque
     * reconstruit à la demande), jamais mis en cache par le navigateur ni par un intermédiaire.
     */
    public function ecouter(Request $request, Audio $audio, StockageAudio $stockage): Response
    {
        if (! in_array($audio->statut, [Audio::STATUT_BROUILLON, Audio::STATUT_PUBLIE, Audio::STATUT_ARCHIVE], true)) {
            throw new NotFoundHttpException;
        }

        // public = false : jamais « public » dans Cache-Control (brouillon réservé au studio).
        return $stockage->reponse($request, $audio, [
            'Content-Type' => 'audio/mpeg',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
            'Accept-Ranges' => 'bytes',
        ], false);
    }
}
