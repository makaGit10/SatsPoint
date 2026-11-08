<?php

namespace App\Services\Audio;

use App\Models\Audio;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Stockage des fichiers audio : la BASE est la source de vérité (table `audio_fichiers`, colonne bytea),
 * le disque `cache-audio` (storage/app/cache-audio) n'est qu'un cache reconstruit à la demande
 * (CAHIER § 16.2 : disque non persistant sur l'offre gratuite).
 *
 * - Écriture : paramètre PDO LOB lié (requête préparée, jamais de binaire interpolé dans le SQL).
 * - Lecture : un seul fichier à la fois, copié en flux de la base vers le cache (écriture atomique :
 *   fichier temporaire puis renommage), puis servi par BinaryFileResponse (plages d'octets pour Safari).
 * - Les listes ne passent jamais par ici : le contenu n'est lu que pour servir, exporter ou vérifier un fichier.
 */
class StockageAudio
{
    public const DISQUE_CACHE = 'cache-audio';

    public const MIME = 'audio/mpeg';

    /**
     * Enregistre (ou remplace) le contenu d'un audio depuis un fichier local.
     *
     * @return array{octets: int, empreinte: string}
     */
    public function enregistrer(int $audioId, string $cheminLocal, string $mime = self::MIME): array
    {
        $octets = @filesize($cheminLocal);
        $empreinte = @hash_file('sha256', $cheminLocal);
        $flux = @fopen($cheminLocal, 'rb');

        if ($octets === false || $empreinte === false || $flux === false) {
            throw new \RuntimeException('lecture_impossible');
        }

        try {
            $this->inserer($audioId, $flux, $mime, (int) $octets, $empreinte);
        } finally {
            fclose($flux);
        }

        return ['octets' => (int) $octets, 'empreinte' => $empreinte];
    }

    /**
     * Enregistre un contenu déjà en mémoire (petit fichier : tests, reprise).
     *
     * @return array{octets: int, empreinte: string}
     */
    public function enregistrerContenu(int $audioId, string $contenu, string $mime = self::MIME): array
    {
        $flux = fopen('php://temp', 'r+b');
        fwrite($flux, $contenu);
        rewind($flux);

        try {
            $this->inserer($audioId, $flux, $mime, strlen($contenu), hash('sha256', $contenu));
        } finally {
            fclose($flux);
        }

        return ['octets' => strlen($contenu), 'empreinte' => hash('sha256', $contenu)];
    }

    public function existe(int $audioId): bool
    {
        return DB::table('audio_fichiers')->where('audio_id', $audioId)->exists();
    }

    /** Contenu complet d'UN fichier (repli quand le cache disque est inutilisable), ou null. */
    public function contenu(int $audioId): ?string
    {
        $flux = $this->ouvrir($audioId);

        return $flux === null ? null : (string) stream_get_contents($flux);
    }

    /**
     * Copie le contenu d'un audio dans un flux ouvert en écriture. false si l'audio n'a pas de contenu.
     *
     * @param  resource  $destination
     */
    public function copierVers(int $audioId, $destination): bool
    {
        $flux = $this->ouvrir($audioId);

        if ($flux === null) {
            return false;
        }

        $copie = stream_copy_to_stream($flux, $destination);
        fclose($flux);

        return $copie !== false;
    }

    /**
     * Chemin local du fichier en cache, reconstruit depuis la base s'il manque. null si l'audio n'a pas de
     * contenu en base, ou si le cache n'est pas inscriptible (l'appelant sert alors directement depuis la base).
     */
    public function cheminCache(Audio $audio): ?string
    {
        $temporaire = null;

        try {
            $final = $this->cache()->path(self::nomCache($audio));

            if (is_file($final) && filesize($final) > 0) {
                return $final;
            }

            $temporaire = $final.'.'.bin2hex(random_bytes(4)).'.tmp';

            if (! $this->dossierPret(dirname($final))) {
                return null;
            }

            $sortie = @fopen($temporaire, 'xb');
            if ($sortie === false) {
                return null;
            }

            $copie = $this->copierVers($audio->id, $sortie);
            fclose($sortie);

            if (! $copie || filesize($temporaire) === 0 || ! @rename($temporaire, $final)) {
                @unlink($temporaire);

                return null;
            }

            return $final;
        } catch (\Throwable $e) {
            if ($temporaire !== null) {
                @unlink($temporaire);
            }
            Log::warning('audio: cache disque indisponible', ['audio_id' => $audio->id, 'motif' => $e::class]);

            return null;
        }
    }

    /** Place un fichier local déjà produit (fin du traitement ffmpeg) dans le cache, sinon le supprime. */
    public function placerEnCache(Audio $audio, string $cheminLocal): void
    {
        try {
            $final = $this->cache()->path(self::nomCache($audio));
            $place = $this->dossierPret(dirname($final)) && @rename($cheminLocal, $final);
        } catch (\Throwable) {
            $place = false;
        }

        if (! $place) {
            @unlink($cheminLocal);
        }
    }

    /** Efface la copie de cache (le cache n'étant qu'une copie, un échec est sans conséquence). */
    public function oublierCache(Audio $audio): void
    {
        try {
            $this->cache()->delete(self::nomCache($audio));
        } catch (\Throwable) {
            // cache inutilisable : rien à effacer
        }
    }

    /**
     * Réponse HTTP d'un fichier audio : depuis le cache disque (reconstruit au besoin), sinon directement depuis
     * la base. 404 si aucun contenu. ETag = empreinte SHA-256 ; 304 si le client possède déjà ce fichier.
     *
     * @param  array<string, string>  $entetes
     */
    public function reponse(Request $request, Audio $audio, array $entetes, bool $public): Response
    {
        $chemin = $this->cheminCache($audio);

        if ($chemin !== null) {
            $reponse = new BinaryFileResponse($chemin, 200, $entetes, $public);
        } else {
            $contenu = $this->contenu($audio->id) ?? throw new NotFoundHttpException;
            $reponse = new Response($contenu, 200, $entetes + ['Content-Length' => (string) strlen($contenu)]);
        }

        $reponse->setEtag((string) $audio->empreinte);
        $reponse->isNotModified($request);

        return $reponse;
    }

    /** Nom dans le cache : {id}.{empreinte16}.mp3 (jamais dérivé d'une entrée utilisateur). */
    public static function nomCache(Audio $audio): string
    {
        return sprintf('%d.%s.mp3', $audio->id, substr((string) $audio->empreinte, 0, 16));
    }

    private function cache(): Filesystem
    {
        return Storage::disk(self::DISQUE_CACHE);
    }

    private function dossierPret(string $dossier): bool
    {
        return is_dir($dossier) || @mkdir($dossier, 0775, true) || is_dir($dossier);
    }

    /** @return resource|null flux de lecture du bytea (une seule ligne, une seule colonne). */
    private function ouvrir(int $audioId)
    {
        $ligne = DB::selectOne('SELECT contenu FROM audio_fichiers WHERE audio_id = ?', [$audioId]);

        if ($ligne === null) {
            return null;
        }

        if (is_resource($ligne->contenu)) {
            return $ligne->contenu;
        }

        // Pilote renvoyant une chaîne : même interface.
        $flux = fopen('php://temp', 'r+b');
        fwrite($flux, (string) $ligne->contenu);
        rewind($flux);

        return $flux;
    }

    /** @param  resource  $flux */
    private function inserer(int $audioId, $flux, string $mime, int $octets, string $empreinte): void
    {
        $instruction = DB::connection()->getPdo()->prepare(
            'INSERT INTO audio_fichiers (audio_id, contenu, mime, octets, empreinte, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) '
            .'ON CONFLICT (audio_id) DO UPDATE SET contenu = EXCLUDED.contenu, mime = EXCLUDED.mime, octets = EXCLUDED.octets, '
            .'empreinte = EXCLUDED.empreinte, updated_at = EXCLUDED.updated_at'
        );
        $maintenant = now()->format('Y-m-d H:i:s');

        $instruction->bindValue(1, $audioId, \PDO::PARAM_INT);
        $instruction->bindParam(2, $flux, \PDO::PARAM_LOB);
        $instruction->bindValue(3, $mime);
        $instruction->bindValue(4, $octets, \PDO::PARAM_INT);
        $instruction->bindValue(5, $empreinte);
        $instruction->bindValue(6, $maintenant);
        $instruction->bindValue(7, $maintenant);
        $instruction->execute();
    }
}
