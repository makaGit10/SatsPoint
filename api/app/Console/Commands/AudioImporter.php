<?php

namespace App\Console\Commands;

use App\Facades\Audit;
use App\Http\Controllers\Api\V1\ManifesteAudioController;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\StockageAudio;
use App\Services\Catalogue;
use App\Services\Diffuseur;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * audio:importer {dossier} — restauration d'une sauvegarde produite par audio:exporter.
 *
 * Pour chaque entrée de `manifeste.json` : langue connue, clé au format valide ET présente dans le registre,
 * fichier exactement `{langue}/{cle}.mp3` (aucun autre chemin accepté, aucune traversée), ≤ 2 Mo, signature MP3,
 * empreinte SHA-256 identique au manifeste, durée lisible par ffprobe. Le contenu est enregistré en base ;
 * l'audio est publié (l'ancien publié passe en archive), ou laissé en brouillon avec --brouillon.
 * Idempotent : un fichier déjà publié avec la même empreinte est ignoré.
 */
class AudioImporter extends Command
{
    protected $signature = 'audio:importer {dossier : Dossier produit par audio:exporter} {--brouillon : Importer en brouillon au lieu de publier}';

    protected $description = 'Restaure des audios depuis {langue}/{cle}.mp3 + manifeste.json (contenu enregistré en base)';

    public function handle(StockageAudio $stockage, InspecteurAudio $inspecteur, Diffuseur $diffuseur): int
    {
        $dossier = rtrim((string) $this->argument('dossier'), '/\\');
        $racine = realpath($dossier);
        $manifeste = $racine === false ? null : json_decode((string) @file_get_contents($racine.DIRECTORY_SEPARATOR.'manifeste.json'), true);

        if (! is_array($manifeste) || ($manifeste['format'] ?? null) !== AudioExporter::FORMAT || ! is_array($manifeste['audios'] ?? null)) {
            $this->error('[audio] manifeste.json absent ou invalide : rien n\'a été importé.');

            return self::FAILURE;
        }

        $publier = ! $this->option('brouillon');
        $tailleMax = (int) config('satspoint.audio.taille_max_ko') * 1024;
        $stats = ['importes' => 0, 'deja_presents' => 0, 'refuses' => 0];

        foreach ($manifeste['audios'] as $entree) {
            $motif = $this->importer(is_array($entree) ? $entree : [], $racine, $tailleMax, $publier, $stockage, $inspecteur);

            if ($motif === null) {
                $stats['importes']++;
            } elseif ($motif === 'deja_present') {
                $stats['deja_presents']++;
            } else {
                $stats['refuses']++;
                $this->warn(sprintf('[audio] entrée refusée (%s) : %s', $motif, mb_substr((string) json_encode($entree['fichier'] ?? null), 0, 80)));
            }
        }

        if ($stats['importes'] > 0) {
            ManifesteAudioController::invaliderCache();
            $diffuseur->admin('audio');
            if ($publier) {
                $diffuseur->plateforme('audios');
            }
        }

        Audit::enregistrer('audio.importe', null, $stats + ['publies' => $publier]);

        $this->info(sprintf('[audio] %d importé(s)%s, %d déjà présent(s), %d refusé(s).', $stats['importes'], $publier ? ' et publié(s)' : ' en brouillon', $stats['deja_presents'], $stats['refuses']));

        return $stats['refuses'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    /** @return string|null motif du refus, 'deja_present', ou null si importé */
    private function importer(array $entree, string $racine, int $tailleMax, bool $publier, StockageAudio $stockage, InspecteurAudio $inspecteur): ?string
    {
        $cle = (string) ($entree['cle'] ?? '');
        $langue = (string) ($entree['langue'] ?? '');

        // Toute langue existante (même désactivée : la sauvegarde doit pouvoir être restaurée intégralement).
        if (! in_array($langue, Catalogue::codesLangues(), true) || ! CleAudio::estValide($cle)) {
            return 'cle_ou_langue_invalide';
        }

        // Le chemin n'est jamais pris du manifeste : il est reconstruit et doit lui être identique.
        if (($entree['fichier'] ?? null) !== $langue.'/'.$cle.'.mp3') {
            return 'chemin_invalide';
        }

        $cleAudio = CleAudio::query()->where('cle', $cle)->first(['id', 'cle']);
        if ($cleAudio === null) {
            return 'cle_inconnue';
        }

        $chemin = $racine.DIRECTORY_SEPARATOR.$langue.DIRECTORY_SEPARATOR.$cle.'.mp3';
        $reel = realpath($chemin);
        if ($reel === false || ! str_starts_with($reel, $racine.DIRECTORY_SEPARATOR) || ! is_file($reel) || is_link($chemin)) {
            return 'fichier_absent';
        }

        $octets = (int) filesize($reel);
        if ($octets === 0 || $octets > $tailleMax || $inspecteur->formatParSignature($reel) !== 'mp3') {
            return 'type_ou_taille_invalide';
        }

        $empreinte = (string) hash_file('sha256', $reel);
        if (isset($entree['empreinte']) && ! hash_equals((string) $entree['empreinte'], $empreinte)) {
            return 'empreinte_differente';
        }

        if (Audio::query()->where('cle_audio_id', $cleAudio->id)->where('langue', $langue)->where('empreinte', $empreinte)->where('statut', Audio::STATUT_PUBLIE)->exists()) {
            return 'deja_present';
        }

        $duree = $inspecteur->duree($reel);
        if ($duree === null || $duree <= 0 || $duree > (int) config('satspoint.audio.duree_max_ms') + 1000) {
            return 'audio_illisible';
        }

        DB::transaction(function () use ($cleAudio, $langue, $empreinte, $duree, $octets, $reel, $publier, $stockage) {
            if ($publier) {
                Audio::query()->where('cle_audio_id', $cleAudio->id)->where('langue', $langue)->where('statut', Audio::STATUT_PUBLIE)
                    ->lockForUpdate()->get(['id'])
                    ->each(fn (Audio $a) => $a->forceFill(['statut' => Audio::STATUT_ARCHIVE])->save());
            }

            $audio = Audio::create([
                'cle_audio_id' => $cleAudio->id,
                'langue' => $langue,
                'chemin' => Audio::cheminPublic($langue, $cleAudio->cle, $empreinte),
                'empreinte' => $empreinte,
                'duree_ms' => $duree,
                'taille' => $octets,
                'statut' => $publier ? Audio::STATUT_PUBLIE : Audio::STATUT_BROUILLON,
                'publie_at' => $publier ? now() : null,
            ]);

            $stockage->enregistrer($audio->id, $reel);
        });

        return null;
    }
}
