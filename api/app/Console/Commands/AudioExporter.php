<?php

namespace App\Console\Commands;

use App\Facades\Audit;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Services\Audio\StockageAudio;
use App\Services\Audio\StudioAudio;
use Illuminate\Console\Command;

/**
 * audio:exporter {dossier} — sauvegarde des audios PUBLIÉS (travail d'enregistrement de la propriétaire).
 *
 * Écrit `{dossier}/{langue}/{cle}.mp3` (lus un par un depuis la base) et `{dossier}/manifeste.json` :
 * `{ format: "satspoint-audio", version: 1, exporte_le, audios: [{ cle, langue, fichier, empreinte, duree_ms, octets, publie_le }] }`.
 * Restauration : `audio:importer {dossier}`. Les noms de fichiers ne viennent que de clés au format validé.
 */
class AudioExporter extends Command
{
    public const FORMAT = 'satspoint-audio';

    protected $signature = 'audio:exporter {dossier : Dossier de destination (créé si absent)} {--langue=* : Limiter à ces langues}';

    protected $description = 'Exporte les audios publiés en fichiers {langue}/{cle}.mp3 + manifeste.json';

    public function handle(StockageAudio $stockage): int
    {
        $dossier = rtrim((string) $this->argument('dossier'), '/\\');
        $langues = array_values(array_intersect((array) $this->option('langue') ?: StudioAudio::langues(), StudioAudio::langues()));

        if ($dossier === '' || (! is_dir($dossier) && ! @mkdir($dossier, 0775, true) && ! is_dir($dossier)) || ! is_writable($dossier)) {
            $this->error('[audio] dossier de destination inutilisable.');

            return self::FAILURE;
        }

        $entrees = [];
        $ignores = 0;

        // Métadonnées seulement (aucun contenu) ; le contenu est copié fichier par fichier.
        $audios = Audio::query()
            ->join('cles_audio', 'cles_audio.id', '=', 'audios.cle_audio_id')
            ->where('audios.statut', Audio::STATUT_PUBLIE)
            ->whereIn('audios.langue', $langues)
            ->orderBy('audios.langue')->orderBy('cles_audio.cle')
            ->get(['audios.id', 'audios.langue', 'audios.empreinte', 'audios.duree_ms', 'audios.publie_at', 'cles_audio.cle']);

        foreach ($audios as $audio) {
            if (! CleAudio::estValide((string) $audio->cle)) {
                $ignores++;

                continue;
            }

            $relatif = $audio->langue.'/'.$audio->cle.'.mp3';
            $cible = $dossier.DIRECTORY_SEPARATOR.$audio->langue.DIRECTORY_SEPARATOR.$audio->cle.'.mp3';
            if (! is_dir(dirname($cible))) {
                mkdir(dirname($cible), 0775, true);
            }

            $temporaire = $cible.'.tmp';
            $sortie = fopen($temporaire, 'wb');
            $copie = $sortie !== false && $stockage->copierVers($audio->id, $sortie);
            if ($sortie !== false) {
                fclose($sortie);
            }

            if (! $copie || ! rename($temporaire, $cible)) {
                @unlink($temporaire);
                $this->warn("[audio] contenu absent en base : {$relatif} (ignoré).");
                $ignores++;

                continue;
            }

            $entrees[] = [
                'cle' => $audio->cle,
                'langue' => $audio->langue,
                'fichier' => $relatif,
                'empreinte' => hash_file('sha256', $cible),
                'duree_ms' => (int) $audio->duree_ms,
                'octets' => (int) filesize($cible),
                'publie_le' => $audio->publie_at?->toIso8601String(),
            ];
        }

        $manifeste = ['format' => self::FORMAT, 'version' => 1, 'exporte_le' => now()->toIso8601String(), 'audios' => $entrees];
        file_put_contents($dossier.DIRECTORY_SEPARATOR.'manifeste.json', json_encode($manifeste, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");

        Audit::enregistrer('audio.exporte', null, ['exportes' => count($entrees), 'ignores' => $ignores, 'langues' => $langues]);

        $this->info(sprintf('[audio] %d audio(s) publié(s) exporté(s) vers %s (%d ignoré(s)).', count($entrees), $dossier, $ignores));

        return self::SUCCESS;
    }
}
