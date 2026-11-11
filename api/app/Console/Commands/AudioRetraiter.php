<?php

namespace App\Console\Commands;

use App\Facades\Audit;
use App\Http\Controllers\Api\V1\ManifesteAudioController;
use App\Models\Audio;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\StockageAudio;
use App\Services\Audio\TraitementAudio;
use App\Services\Catalogue;
use App\Services\Diffuseur;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * audio:retraiter — repasse les audios déjà stockés dans le traitement actuel (silences, CONTRAT_API V3.12).
 *
 * Les sources déposées ne sont pas conservées : on retraite le MP3 en base (audio_fichiers). Un résultat n'est gardé
 * que s'il est réellement plus court (gain ≥ 80 ms), pour ne pas ré-encoder sans raison.
 * - Brouillon : contenu remplacé en place (empreinte, chemin, durée, taille ; cache disque oublié).
 * - Publié : NOUVELLE version publiée, l'ancienne archivée (toujours servie aux manifestes encore en cache).
 * Une erreur sur un audio n'arrête pas les autres et ne touche jamais la version publiée.
 * Fin : cache du manifeste vidé, signaux `audios` (plateforme) et `audio` (admin), journal `audio.retraite`.
 */
class AudioRetraiter extends Command
{
    protected $signature = 'audio:retraiter
        {--langue= : Code d\'une langue du catalogue (toutes sinon)}
        {--simulation : N\'écrit rien, affiche ce qui serait fait}';

    protected $description = 'Retraite les audios stockés (silences coupés) sans perdre les publications';

    /** Gain minimal (ms) pour remplacer un audio. */
    public const GAIN_MIN_MS = 80;

    public function handle(TraitementAudio $traitement, InspecteurAudio $inspecteur, StockageAudio $stockage, Diffuseur $diffuseur): int
    {
        $langue = $this->option('langue');
        if ($langue !== null && ! in_array($langue, Catalogue::codesLangues(), true)) {
            $this->error('Langue inconnue.');

            return self::INVALID;
        }

        $simulation = (bool) $this->option('simulation');

        // Identifiants figés au départ : les nouvelles versions créées en route ne sont pas retraitées.
        $ids = Audio::query()
            ->whereIn('statut', [Audio::STATUT_PUBLIE, Audio::STATUT_BROUILLON])
            ->when($langue !== null, fn ($q) => $q->where('langue', $langue))
            ->orderBy('id')
            ->pluck('id');

        $stats = ['traites' => 0, 'raccourcis' => 0, 'inchanges' => 0, 'erreurs' => 0];

        foreach ($ids as $id) {
            $stats['traites']++;
            $resultat = $this->retraiter((int) $id, $simulation, $traitement, $inspecteur, $stockage);
            $stats[$resultat]++;
        }

        if (! $simulation && $stats['raccourcis'] > 0) {
            ManifesteAudioController::invaliderCache();
            $diffuseur->plateforme('audios');
            $diffuseur->admin('audio');
        }

        $this->info(sprintf(
            '[audio] %s%d audio(s) examiné(s) : %d raccourci(s), %d inchangé(s), %d erreur(s).',
            $simulation ? 'SIMULATION — ' : '', $stats['traites'], $stats['raccourcis'], $stats['inchanges'], $stats['erreurs'],
        ));

        return self::SUCCESS;
    }

    /** @return 'raccourcis'|'inchanges'|'erreurs' */
    private function retraiter(int $id, bool $simulation, TraitementAudio $traitement, InspecteurAudio $inspecteur, StockageAudio $stockage): string
    {
        $audio = Audio::query()->with('cle:id,cle')->find($id);
        if ($audio === null || ! in_array($audio->statut, [Audio::STATUT_PUBLIE, Audio::STATUT_BROUILLON], true) || $audio->cle === null) {
            return 'inchanges';
        }

        $prive = Storage::disk('local');
        $base = sprintf('%s/retraiter-%d-%s', config('satspoint.audio.dossier_sources'), $audio->id, bin2hex(random_bytes(4)));
        $prive->makeDirectory((string) config('satspoint.audio.dossier_sources'));
        $entree = $prive->path($base.'.mp3');
        $sortie = $prive->path($base.'.sortie.mp3');

        try {
            $flux = fopen($entree, 'wb');
            $copie = $flux !== false && $stockage->copierVers($audio->id, $flux);
            if ($flux !== false) {
                fclose($flux);
            }
            if (! $copie) {
                throw new \RuntimeException('contenu_absent');
            }

            $avant = $inspecteur->duree($entree) ?? (int) $audio->duree_ms;
            $traitement->convertirEnMp3($entree, $sortie);
            $apres = $inspecteur->duree($sortie) ?? throw new \RuntimeException('sortie_illisible');

            $libelle = sprintf('#%d %s [%s] %s : %d ms → %d ms', $audio->id, $audio->cle->cle, $audio->langue, $audio->statut, $avant, $apres);

            if ($avant - $apres < self::GAIN_MIN_MS) {
                $this->line("  = {$libelle} (inchangé)");

                return 'inchanges';
            }

            if ($simulation) {
                $this->line("  ~ {$libelle} (serait raccourci)");

                return 'raccourcis';
            }

            $nouveau = $audio->statut === Audio::STATUT_PUBLIE
                ? $this->nouvelleVersionPubliee($audio, $sortie, $apres, $stockage)
                : $this->remplacerBrouillon($audio, $sortie, $apres, $stockage);

            if ($nouveau === null) {
                return 'inchanges'; // statut changé entre-temps (publication, suppression) : on n'y touche pas
            }

            Audit::enregistrer('audio.retraite', $nouveau, [
                'audio_id' => $audio->id, 'nouvel_audio_id' => $nouveau->id, 'cle' => $audio->cle->cle, 'langue' => $audio->langue,
                'statut' => $audio->statut, 'duree_avant_ms' => $avant, 'duree_apres_ms' => $apres,
            ]);
            $this->line("  ✓ {$libelle}");

            return 'raccourcis';
        } catch (\Throwable $e) {
            Log::warning('audio: retraitement en échec', ['audio_id' => $audio->id, 'motif' => $e::class.' '.mb_substr($e->getMessage(), 0, 60)]);
            $this->warn(sprintf('  ! #%d %s [%s] : échec, version actuelle conservée', $audio->id, $audio->cle->cle, $audio->langue));

            return 'erreurs';
        } finally {
            @unlink($entree);
            @unlink($sortie);
        }
    }

    private function remplacerBrouillon(Audio $audio, string $sortie, int $dureeMs, StockageAudio $stockage): ?Audio
    {
        $ancien = clone $audio;

        $resultat = DB::transaction(function () use ($audio, $sortie, $dureeMs, $stockage) {
            $verrou = Audio::query()->whereKey($audio->id)->lockForUpdate()->first();
            if ($verrou === null || $verrou->statut !== Audio::STATUT_BROUILLON) {
                return null;
            }

            $fichier = $stockage->enregistrer($audio->id, $sortie);
            $verrou->forceFill([
                'chemin' => Audio::cheminPublic($audio->langue, $audio->cle->cle, $fichier['empreinte']),
                'empreinte' => $fichier['empreinte'],
                'duree_ms' => $dureeMs,
                'taille' => $fichier['octets'],
            ])->save();

            return $verrou;
        });

        if ($resultat !== null) {
            $stockage->oublierCache($ancien);
        }

        return $resultat;
    }

    private function nouvelleVersionPubliee(Audio $audio, string $sortie, int $dureeMs, StockageAudio $stockage): ?Audio
    {
        return DB::transaction(function () use ($audio, $sortie, $dureeMs, $stockage) {
            $verrou = Audio::query()->whereKey($audio->id)->lockForUpdate()->first();
            if ($verrou === null || $verrou->statut !== Audio::STATUT_PUBLIE) {
                return null;
            }

            // Archiver d'abord : une seule version « publie » par clé et par langue (index partiel unique).
            $verrou->forceFill(['statut' => Audio::STATUT_ARCHIVE])->save();

            $empreinte = (string) hash_file('sha256', $sortie);
            $nouveau = Audio::create([
                'cle_audio_id' => $audio->cle_audio_id,
                'langue' => $audio->langue,
                'chemin' => Audio::cheminPublic($audio->langue, $audio->cle->cle, $empreinte),
                'empreinte' => $empreinte,
                'duree_ms' => $dureeMs,
                'taille' => (int) filesize($sortie),
                'statut' => Audio::STATUT_PUBLIE,
                'enregistre_par' => $audio->enregistre_par,
                'publie_at' => now(),
            ]);
            $stockage->enregistrer($nouveau->id, $sortie);

            return $nouveau;
        });
    }
}
