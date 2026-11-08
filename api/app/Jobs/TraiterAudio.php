<?php

namespace App\Jobs;

use App\Models\Audio;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\StockageAudio;
use App\Services\Audio\TraitementAudio;
use App\Services\Diffuseur;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Traite un audio déposé (statut en_traitement) : ffmpeg (silences, loudnorm, mono, 48 kHz, MP3 48 kb/s),
 * durée mesurée, empreinte SHA-256, contenu enregistré EN BASE (audio_fichiers) dans la même transaction que
 * le passage au statut brouillon ; le disque ne garde qu'une copie de cache. URL logique `audio/{langue}/{cle}.{empreinte8}.mp3`.
 *
 * La source déposée reste un fichier temporaire (storage/app/private/audio-sources) : tant qu'elle existe et que
 * l'audio est « en_traitement », le job peut être relancé. Source perdue (redémarrage du conteneur) ou job
 * abandonné → statut erreur « à renvoyer » (voir aussi audio:nettoyer, au démarrage et toutes les 5 min).
 * En cas d'échec : message générique (rien de technique n'est exposé), détail dans les logs (ids seulement).
 */
class TraiterAudio implements ShouldQueue
{
    use Queueable;

    public const MESSAGE_ECHEC = 'Le traitement du fichier a échoué. Réessayez avec un autre enregistrement.';

    public const MESSAGE_INTERROMPU = 'Le traitement a été interrompu (redémarrage du serveur). Renvoyez l\'enregistrement.';

    public int $tries = 1;

    /** Délai du job légèrement supérieur à celui de ffmpeg. */
    public int $timeout = 45;

    public function __construct(public readonly int $audioId)
    {
        $this->onQueue('audio');
    }

    public function handle(TraitementAudio $traitement, InspecteurAudio $inspecteur, Diffuseur $diffuseur, StockageAudio $stockage): void
    {
        $audio = Audio::query()->with('cle:id,cle')->find($this->audioId);

        if ($audio === null || $audio->statut !== Audio::STATUT_EN_TRAITEMENT || $audio->chemin_source === null) {
            return;
        }

        $prive = Storage::disk('local');
        $source = $prive->path($audio->chemin_source);
        $temporaire = $prive->path(sprintf('%s/%d.%s.mp3', config('satspoint.audio.dossier_sources'), $audio->id, bin2hex(random_bytes(4))));
        $message = self::MESSAGE_ECHEC;

        try {
            if (! is_file($source)) {
                $message = self::MESSAGE_INTERROMPU;
                throw new \RuntimeException('source_absente');
            }

            $traitement->convertirEnMp3($source, $temporaire);

            $duree = $inspecteur->duree($temporaire);
            if ($duree === null || $duree <= 0) {
                throw new \RuntimeException('sortie_illisible');
            }

            // Contenu en base + statut dans une seule transaction : un brouillon « prêt » a toujours son fichier.
            DB::transaction(function () use ($audio, $stockage, $temporaire, $duree) {
                $fichier = $stockage->enregistrer($audio->id, $temporaire);

                $audio->forceFill([
                    'chemin' => Audio::cheminPublic($audio->langue, $audio->cle->cle, $fichier['empreinte']),
                    'empreinte' => $fichier['empreinte'],
                    'duree_ms' => $duree,
                    'taille' => $fichier['octets'],
                    'statut' => Audio::STATUT_BROUILLON,
                    'message_erreur' => null,
                ])->save();
            });

            // Copie de cache (écoute immédiate dans le studio) ; perdue sans conséquence au prochain redémarrage.
            $stockage->placerEnCache($audio, $temporaire);
        } catch (\Throwable $e) {
            @unlink($temporaire);

            Log::warning('audio: traitement en échec', ['audio_id' => $audio->id, 'motif' => $e::class.' '.mb_substr($e->getMessage(), 0, 60)]);

            $audio->forceFill(['statut' => Audio::STATUT_ERREUR, 'message_erreur' => $message])->save();
        } finally {
            // La source déposée ne sert plus : supprimée dans tous les cas (rien ne traîne hors de la base).
            $prive->delete($audio->chemin_source);
            $audio->forceFill(['chemin_source' => null])->saveQuietly();
        }

        $diffuseur->admin('audio');
    }

    /** Job abandonné (délai dépassé, worker arrêté puis tentatives épuisées) : jamais bloqué « en_traitement ». */
    public function failed(?\Throwable $e): void
    {
        if (self::marquerInterrompu($this->audioId)) {
            app(Diffuseur::class)->admin('audio');
        }
    }

    /** Passe un audio encore « en_traitement » en erreur « à renvoyer » et supprime sa source. true si modifié. */
    public static function marquerInterrompu(int $audioId): bool
    {
        $audio = Audio::query()->find($audioId);

        if ($audio === null || $audio->statut !== Audio::STATUT_EN_TRAITEMENT) {
            return false;
        }

        if ($audio->chemin_source !== null) {
            Storage::disk('local')->delete($audio->chemin_source);
        }

        $audio->forceFill(['statut' => Audio::STATUT_ERREUR, 'message_erreur' => self::MESSAGE_INTERROMPU, 'chemin_source' => null])->save();

        return true;
    }
}
