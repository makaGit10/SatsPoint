<?php

namespace App\Console\Commands;

use App\Jobs\TraiterAudio;
use App\Models\Audio;
use App\Services\Diffuseur;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * audio:nettoyer — reprise après redémarrage (disque non persistant, CAHIER § 16.2).
 *
 * - Un audio « en_traitement » dont la source temporaire a disparu (conteneur redémarré) ou bloqué depuis plus de
 *   `satspoint.audio.traitement_interrompu_min` minutes passe en « erreur » avec le message « renvoyez l'enregistrement »
 *   (jamais bloqué indéfiniment dans le studio).
 * - Les sources temporaires orphelines (> 1 h, sans audio en traitement) sont supprimées.
 * Lancée au démarrage du conteneur et toutes les 5 minutes par le planificateur.
 */
class AudioNettoyer extends Command
{
    protected $signature = 'audio:nettoyer {--sans-signal : N\'émet pas le signal temps réel « audio » (canal admin)}';

    protected $description = 'Marque en erreur les traitements audio interrompus et supprime les sources orphelines';

    public function handle(Diffuseur $diffuseur): int
    {
        $prive = Storage::disk('local');
        $limite = now()->subMinutes((int) config('satspoint.audio.traitement_interrompu_min', 10));
        $interrompus = 0;

        Audio::query()
            ->where('statut', Audio::STATUT_EN_TRAITEMENT)
            ->orderBy('id')
            ->get(['id', 'chemin_source', 'updated_at'])
            ->each(function (Audio $audio) use ($prive, $limite, &$interrompus) {
                $sourcePerdue = $audio->chemin_source === null || ! $prive->exists($audio->chemin_source);

                if (($sourcePerdue || $audio->updated_at === null || $audio->updated_at->lt($limite)) && TraiterAudio::marquerInterrompu($audio->id)) {
                    $interrompus++;
                }
            });

        // Sources orphelines : seulement des noms générés par le serveur ({id}.{ext} ou {id}.{hasard}.mp3).
        $enCours = Audio::query()->where('statut', Audio::STATUT_EN_TRAITEMENT)->pluck('chemin_source')->filter()->flip();
        $orphelines = 0;
        foreach ($prive->files((string) config('satspoint.audio.dossier_sources')) as $fichier) {
            if (! $enCours->has($fichier) && $prive->lastModified($fichier) < now()->subHour()->getTimestamp()) {
                $prive->delete($fichier);
                $orphelines++;
            }
        }

        $this->info(sprintf('[audio] %d traitement(s) interrompu(s) marqué(s) en erreur, %d source(s) orpheline(s) supprimée(s).', $interrompus, $orphelines));

        if ($interrompus > 0 && ! $this->option('sans-signal')) {
            $diffuseur->admin('audio');
        }

        return self::SUCCESS;
    }
}
