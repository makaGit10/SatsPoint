<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Articles utilisables sans lire ni écrire (11 novembre) : pictogramme, photo et nom dit à voix haute.
 *
 * - `articles.nom` devient facultatif : un article est identifié par AU MOINS un nom écrit, un pictogramme,
 *   une photo ou un nom vocal (contrainte CHECK, en plus de la validation serveur).
 * - Le contenu des photos (WebP ré-encodé) et des voix (MP3 ré-encodé) est EN BASE (`article_fichiers`, bytea),
 *   comme les audios du studio : le disque de Render est éphémère. Les listes ne lisent jamais le contenu :
 *   l'article porte l'empreinte (version de l'URL) et la durée de la voix.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('articles', function (Blueprint $table) {
            $table->string('nom', 120)->nullable()->change();
            $table->string('pictogramme', 32)->nullable()->after('couleur');
            $table->char('photo_empreinte', 64)->nullable()->after('pictogramme');
            $table->char('voix_empreinte', 64)->nullable()->after('photo_empreinte');
            $table->unsignedInteger('voix_duree_ms')->nullable()->after('voix_empreinte');
        });

        Schema::create('article_fichiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->foreignId('article_id')->constrained('articles')->cascadeOnDelete();
            $table->string('type', 8);                      // photo | voix
            $table->binary('contenu');                      // bytea
            $table->string('mime', 40);
            $table->unsignedInteger('octets');
            $table->char('empreinte', 64);                  // SHA-256 du contenu ré-encodé
            $table->unsignedSmallInteger('largeur')->nullable();
            $table->unsignedSmallInteger('hauteur')->nullable();
            $table->unsignedInteger('duree_ms')->nullable();
            $table->timestamps();

            $table->unique(['article_id', 'type']);
            $table->index('boutique_id');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE article_fichiers ADD CONSTRAINT article_fichiers_type_check CHECK (type IN ('photo', 'voix'))");
            DB::statement('ALTER TABLE article_fichiers ADD CONSTRAINT article_fichiers_octets_check CHECK (octets = octet_length(contenu) AND octets <= 1048576)');
            // WebP et MP3 sont déjà compressés : stockage TOAST hors ligne sans recompression.
            DB::statement('ALTER TABLE article_fichiers ALTER COLUMN contenu SET STORAGE EXTERNAL');
            DB::statement("ALTER TABLE articles ADD CONSTRAINT articles_identite_check CHECK (NULLIF(BTRIM(nom), '') IS NOT NULL OR pictogramme IS NOT NULL OR photo_empreinte IS NOT NULL OR voix_empreinte IS NOT NULL)");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_identite_check');
        }

        Schema::dropIfExists('article_fichiers');

        Schema::table('articles', function (Blueprint $table) {
            $table->dropColumn(['pictogramme', 'photo_empreinte', 'voix_empreinte', 'voix_duree_ms']);
        });

        DB::table('articles')->whereNull('nom')->update(['nom' => 'Article']);

        Schema::table('articles', function (Blueprint $table) {
            $table->string('nom', 120)->nullable(false)->change();
        });
    }
};
