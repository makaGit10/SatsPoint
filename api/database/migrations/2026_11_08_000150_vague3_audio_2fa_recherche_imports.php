<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Vague 3 — aide vocale, 2FA, recherche globale, imports.
 *
 * - `audios` : statuts complets du cycle de vie (en_traitement → brouillon → publie → archive, ou erreur),
 *   chemin du fichier source déposé, message d'erreur générique, index sur le chemin servi.
 * - `users` : activation 2FA (`two_factor_confirmed_at`) et codes de secours hachés.
 * - Recherche : fonction `f_unaccent` immuable (indexable) + index GIN trigramme sur
 *   `ventes.note`, `articles.nom`, `articles.sku`, `users.nom`, insensibles aux accents.
 * - `imports` : résultat de l'analyse (colonnes, aperçu, suggestions) séparé du rapport d'exécution.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audios', function (Blueprint $table) {
            $table->string('chemin_source', 255)->nullable()->after('chemin');
            $table->string('message_erreur', 200)->nullable()->after('statut');
            $table->index('chemin');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_secret');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_confirmed_at');
        });

        Schema::table('imports', function (Blueprint $table) {
            $table->string('nom_fichier', 120)->nullable()->after('fichier');
            $table->jsonb('analyse')->nullable()->after('correspondance');
            $table->string('mode', 30)->nullable()->after('statut');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE audios DROP CONSTRAINT IF EXISTS audios_statut_check');
            DB::statement("ALTER TABLE audios ADD CONSTRAINT audios_statut_check CHECK (statut IN ('en_traitement', 'brouillon', 'publie', 'archive', 'erreur'))");

            // unaccent() n'est pas IMMUTABLE : enveloppe immuable pour pouvoir indexer les expressions.
            DB::statement("CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS \$\$ SELECT public.unaccent('public.unaccent', \$1) \$\$");

            DB::statement('CREATE INDEX IF NOT EXISTS ventes_note_trgm_idx ON ventes USING gin (f_unaccent(note) gin_trgm_ops)');
            DB::statement('CREATE INDEX IF NOT EXISTS articles_nom_unaccent_trgm_idx ON articles USING gin (f_unaccent(nom) gin_trgm_ops)');
            DB::statement('CREATE INDEX IF NOT EXISTS articles_sku_trgm_idx ON articles USING gin (sku gin_trgm_ops)');
            DB::statement('CREATE INDEX IF NOT EXISTS users_nom_trgm_idx ON users USING gin (f_unaccent(nom) gin_trgm_ops)');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS users_nom_trgm_idx');
            DB::statement('DROP INDEX IF EXISTS articles_sku_trgm_idx');
            DB::statement('DROP INDEX IF EXISTS articles_nom_unaccent_trgm_idx');
            DB::statement('DROP INDEX IF EXISTS ventes_note_trgm_idx');
            DB::statement('DROP FUNCTION IF EXISTS f_unaccent(text)');
            DB::statement('ALTER TABLE audios DROP CONSTRAINT IF EXISTS audios_statut_check');
            DB::statement("ALTER TABLE audios ADD CONSTRAINT audios_statut_check CHECK (statut IN ('brouillon', 'publie'))");
        }

        Schema::table('imports', fn (Blueprint $table) => $table->dropColumn(['nom_fichier', 'analyse', 'mode']));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['two_factor_confirmed_at', 'two_factor_recovery_codes']));
        Schema::table('audios', function (Blueprint $table) {
            $table->dropIndex(['chemin']);
            $table->dropColumn(['chemin_source', 'message_erreur']);
        });
    }
};
