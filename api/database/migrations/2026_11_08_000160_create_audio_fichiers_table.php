<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Contenu des fichiers audio EN BASE (CAHIER § 16.2 : disque du conteneur non persistant sur l'offre gratuite).
 *
 * Table séparée de `audios` : les listes (matrice du studio, manifeste, console) ne lisent jamais le contenu.
 * Une ligne par audio traité (brouillon, publié, archivé) ; supprimée avec l'audio (cascade). Le disque
 * (storage/app/cache-audio) n'est plus qu'un cache reconstruit à la demande.
 *
 * Reprise : les MP3 déjà présents sur l'ancien disque public (storage/app/public/audio/…) sont copiés en base.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_fichiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('audio_id')->unique()->constrained('audios')->cascadeOnDelete();
            $table->binary('contenu');                       // bytea
            $table->string('mime', 40)->default('audio/mpeg');
            $table->unsignedInteger('octets');
            $table->char('empreinte', 64);                   // SHA-256 du contenu
            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE audio_fichiers ADD CONSTRAINT audio_fichiers_octets_check CHECK (octets = octet_length(contenu))');
            // MP3 déjà compressé : stockage TOAST hors ligne sans recompression (EXTERNAL).
            DB::statement('ALTER TABLE audio_fichiers ALTER COLUMN contenu SET STORAGE EXTERNAL');
        }

        $this->reprendreAnciensFichiers();
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_fichiers');
    }

    /** Copie en base les fichiers traités encore présents sur l'ancien disque public (développement local). */
    private function reprendreAnciensFichiers(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $disque = Storage::disk('public');
        $pdo = DB::connection()->getPdo();
        $insertion = $pdo->prepare('INSERT INTO audio_fichiers (audio_id, contenu, mime, octets, empreinte, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW()) ON CONFLICT (audio_id) DO NOTHING');

        DB::table('audios')
            ->where('chemin', '!=', '')
            ->whereIn('statut', ['brouillon', 'publie', 'archive'])
            ->orderBy('id')
            ->select(['id', 'chemin'])
            ->lazyById(100)
            ->each(function (object $audio) use ($disque, $insertion) {
                $chemin = (string) $audio->chemin;
                if (str_contains($chemin, '..') || ! $disque->exists($chemin)) {
                    return;
                }

                $local = $disque->path($chemin);
                $flux = fopen($local, 'rb');
                if ($flux === false) {
                    return;
                }

                $insertion->bindValue(1, (int) $audio->id, PDO::PARAM_INT);
                $insertion->bindParam(2, $flux, PDO::PARAM_LOB);
                $insertion->bindValue(3, 'audio/mpeg');
                $insertion->bindValue(4, (int) filesize($local), PDO::PARAM_INT);
                $insertion->bindValue(5, (string) hash_file('sha256', $local));
                $insertion->execute();
                fclose($flux);
            });
    }
};
