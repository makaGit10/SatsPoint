<?php

namespace App\Services;

use App\Models\Audio;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/**
 * État des dépendances (base, Redis, Reverb, passerelle, cours) et, pour la console, des files et de l'espace audio.
 * Aucune information sensible : des booléens, des compteurs, des âges.
 */
class EtatSysteme
{
    /** Files traitées par le conteneur `queue` (docker-compose : --queue=paiements,audio,imports,default). */
    public const FILES = ['paiements', 'audio', 'imports', 'default'];

    public function __construct(
        private readonly PasserelleLightning $passerelle,
        private readonly CoursChange $cours,
    ) {}

    /** Vérifications de base (GET /sante). */
    public function base(): array
    {
        $coursActuel = null;
        try {
            $coursActuel = $this->cours->actuel();
        } catch (\Throwable) {
            // base indisponible : signalé par `base`
        }

        $base = $this->verifier(fn () => DB::select('select 1') !== []);
        $redis = $this->verifier(function () {
            $cle = 'sante:'.bin2hex(random_bytes(4));
            $temoin = 'ok-'.bin2hex(random_bytes(4));
            Cache::store(config('cache.default'))->put($cle, $temoin, 10);

            return Cache::store(config('cache.default'))->pull($cle) === $temoin;
        });
        $reverb = $this->verifier(fn () => Http::timeout(2)->connectTimeout(2)->get(sprintf(
            '%s://%s:%d/up',
            config('broadcasting.connections.reverb.options.scheme', 'http'),
            config('broadcasting.connections.reverb.options.host', 'reverb'),
            (int) config('broadcasting.connections.reverb.options.port', 8080),
        ))->successful());
        $passerelleOk = $this->verifier(fn () => $this->passerelle->joignable());

        return [
            'statut' => $base ? ($redis && $reverb ? 'ok' : 'degrade') : 'indisponible',
            'base' => $base,
            'redis' => $redis,
            'reverb' => $reverb,
            'passerelle' => $passerelleOk,
            'cours' => ['age_s' => $coursActuel['age_s'] ?? null, 'disponible' => (bool) ($coursActuel['disponible'] ?? false)],
        ];
    }

    /** Détail pour la console plateforme : files d'attente, espace audio, version. */
    public function detail(): array
    {
        $etat = $this->base();

        $etat['cours']['sources'] = null;
        $etat['cours']['recupere_le'] = null;
        try {
            $actuel = $this->cours->actuel();
            $etat['cours']['sources'] = $actuel['sources'];
            $etat['cours']['recupere_le'] = $actuel['recupere_le'];
        } catch (\Throwable) {
            // déjà signalé
        }

        $parFile = [];
        foreach (self::FILES as $file) {
            $parFile[$file] = $this->compter(fn () => Queue::size($file));
        }
        $connues = array_filter($parFile, fn ($n) => $n !== null);

        $etat['files'] = [
            // CONTRAT_API V3.5 : `en_attente` = total ; le détail par file est un ajout.
            'en_attente' => $connues === [] ? null : array_sum($connues),
            'par_file' => $parFile,
            'connexion' => (string) config('queue.default'),
            'echouees' => $this->compter(fn () => DB::table('failed_jobs')->count()),
            'echouees_24h' => $this->compter(fn () => DB::table('failed_jobs')->where('failed_at', '>=', now()->subDay())->count()),
        ];

        $etat['audio'] = $this->espaceAudio();
        $etat['version'] = config('satspoint.version');
        $etat['horodatage'] = now()->toIso8601String();

        return $etat;
    }

    private function espaceAudio(): array
    {
        try {
            $ligne = Audio::query()
                ->whereIn('statut', [Audio::STATUT_PUBLIE, Audio::STATUT_BROUILLON, Audio::STATUT_ARCHIVE])
                ->selectRaw('COUNT(*) AS fichiers, COALESCE(SUM(taille), 0) AS octets, SUM(CASE WHEN statut = ? THEN 1 ELSE 0 END) AS publies', [Audio::STATUT_PUBLIE])
                ->first();

            $disque = storage_path('app'); // cache audio + sources temporaires (le contenu est en base)
            $libre = @disk_free_space($disque);

            return [
                'fichiers' => (int) ($ligne->fichiers ?? 0),
                'publies' => (int) ($ligne->publies ?? 0),
                'octets' => (int) ($ligne->octets ?? 0),
                'disque_libre_octets' => $libre === false ? null : (int) $libre,
            ];
        } catch (\Throwable) {
            return ['fichiers' => null, 'publies' => null, 'octets' => null, 'disque_libre_octets' => null];
        }
    }

    private function verifier(callable $test): bool
    {
        try {
            return (bool) $test();
        } catch (\Throwable) {
            return false;
        }
    }

    private function compter(callable $test): ?int
    {
        try {
            return (int) $test();
        } catch (\Throwable) {
            return null;
        }
    }
}
