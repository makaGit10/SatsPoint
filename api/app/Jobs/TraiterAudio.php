<?php

namespace App\Jobs;

use App\Models\Audio;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\TraitementAudio;
use App\Services\Diffuseur;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Traite un audio déposé (statut en_traitement) : ffmpeg (silences, loudnorm, mono, 48 kHz, MP3 48 kb/s),
 * durée mesurée, empreinte SHA-256, fichier final `audio/{langue}/{cle}.{empreinte8}.mp3` → statut brouillon.
 * En cas d'échec : statut erreur avec un message générique (rien de technique n'est exposé), détail dans les logs (ids seulement).
 */
class TraiterAudio implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Délai du job légèrement supérieur à celui de ffmpeg. */
    public int $timeout = 45;

    public function __construct(public readonly int $audioId)
    {
        $this->onQueue('audio');
    }

    public function handle(TraitementAudio $traitement, InspecteurAudio $inspecteur, Diffuseur $diffuseur): void
    {
        $audio = Audio::query()->with('cle:id,cle')->find($this->audioId);

        if ($audio === null || $audio->statut !== Audio::STATUT_EN_TRAITEMENT || $audio->chemin_source === null) {
            return;
        }

        $prive = Storage::disk('local');
        $public = Storage::disk('public');
        $source = $prive->path($audio->chemin_source);
        $temporaire = $prive->path(sprintf('%s/%d.%s.mp3', config('satspoint.audio.dossier_sources'), $audio->id, bin2hex(random_bytes(4))));

        try {
            if (! is_file($source)) {
                throw new \RuntimeException('source_absente');
            }

            $traitement->convertirEnMp3($source, $temporaire);

            $duree = $inspecteur->duree($temporaire);
            if ($duree === null || $duree <= 0) {
                throw new \RuntimeException('sortie_illisible');
            }

            $empreinte = hash_file('sha256', $temporaire);
            $chemin = Audio::cheminPublic($audio->langue, $audio->cle->cle, $empreinte);

            $public->makeDirectory(dirname($chemin));
            if (! rename($temporaire, $public->path($chemin))) {
                throw new \RuntimeException('deplacement_impossible');
            }

            $audio->forceFill([
                'chemin' => $chemin,
                'empreinte' => $empreinte,
                'duree_ms' => $duree,
                'taille' => (int) $public->size($chemin),
                'statut' => Audio::STATUT_BROUILLON,
                'message_erreur' => null,
            ])->save();
        } catch (\Throwable $e) {
            @unlink($temporaire);

            Log::warning('audio: traitement en échec', ['audio_id' => $audio->id, 'motif' => $e::class.' '.mb_substr($e->getMessage(), 0, 60)]);

            $audio->forceFill([
                'statut' => Audio::STATUT_ERREUR,
                'message_erreur' => 'Le traitement du fichier a échoué. Réessayez avec un autre enregistrement.',
            ])->save();
        } finally {
            // La source déposée ne sert plus : supprimée dans tous les cas (rien ne traîne hors du fichier final).
            if ($audio->chemin_source !== null) {
                $prive->delete($audio->chemin_source);
                $audio->forceFill(['chemin_source' => null])->saveQuietly();
            }
        }

        $diffuseur->admin('audio');
    }
}
