<?php

use App\Support\CatalogueInitial;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Pays, langues dynamiques et moyens de paiement par pays (CONTRAT_API § 14).
 *
 * - `pays` : liste fermée de la zone XOF (UEMOA), insérée ici ; aucune création par l'API.
 * - `langues` : remplace la liste figée de config/satspoint.php ; graines wo, srr, ff, dyo (SN) et fr (tous pays).
 * - `moyens_paiement` : catalogue géré par le super-admin ; `moyens_paiement_boutique` : activation par boutique
 *   (numéro ou lien marchand EN CLAIR, comme reglages.wave_lien : donnée publique montrée à chaque client).
 * - `boutiques.pays` (défaut SN : les boutiques existantes passent en SN), `paiements.moyen_paiement_id` + `paiements.moyen`
 *   (photographie du moyen à la création de la tentative), méthode `moyen_pays`.
 * - `audios.langue` : 12 caractères, contrainte de liste remplacée par une clé étrangère vers `langues.code`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pays', function (Blueprint $table) {
            $table->char('code', 2)->primary();
            $table->string('nom_fr', 40);
            $table->string('nom_en', 40);
            $table->string('indicatif', 6);
            $table->char('devise', 3)->default('XOF');
            $table->boolean('actif')->default(true);
            $table->unsignedSmallInteger('ordre')->default(0);
            $table->timestamps();
        });

        Schema::create('langues', function (Blueprint $table) {
            $table->id();
            $table->string('code', 12)->unique();
            $table->string('nom_local', 40);
            $table->string('nom_fr', 40);
            $table->string('nom_en', 40);
            $table->jsonb('pays')->default('[]');
            $table->boolean('actif')->default(true);
            $table->unsignedSmallInteger('ordre')->default(0);
            $table->timestamps();

            $table->index(['actif', 'ordre']);
        });

        Schema::create('moyens_paiement', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->char('pays', 2);
            $table->string('nom', 40);
            $table->string('type', 10);
            $table->string('couleur', 10);
            $table->string('instructions_fr', 160)->nullable();
            $table->string('instructions_en', 160)->nullable();
            $table->boolean('actif')->default(true);
            $table->unsignedSmallInteger('ordre')->default(0);
            $table->timestamps();

            $table->foreign('pays')->references('code')->on('pays')->restrictOnDelete();
            $table->unique(['pays', 'nom']);
            $table->index(['pays', 'actif', 'ordre']);
        });

        Schema::create('moyens_paiement_boutique', function (Blueprint $table) {
            $table->id();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->foreignId('moyen_paiement_id')->constrained('moyens_paiement')->restrictOnDelete();
            $table->string('valeur', 300)->nullable();
            $table->boolean('active')->default(false);
            $table->timestamps();

            $table->unique(['boutique_id', 'moyen_paiement_id']);
            $table->index('moyen_paiement_id');
        });

        $this->insererGraines();

        // Boutiques : pays (les boutiques existantes reçoivent la valeur par défaut SN).
        Schema::table('boutiques', function (Blueprint $table) {
            $table->char('pays', 2)->default('SN')->after('devise');
            $table->foreign('pays')->references('code')->on('pays')->restrictOnDelete();
            $table->index('pays');
        });
        DB::table('boutiques')->whereNull('pays')->update(['pays' => 'SN']);

        // Paiements : moyen du pays utilisé (+ photographie).
        Schema::table('paiements', function (Blueprint $table) {
            $table->foreignId('moyen_paiement_id')->nullable()->after('operateur')->constrained('moyens_paiement')->nullOnDelete();
            $table->jsonb('moyen')->nullable()->after('moyen_paiement_id');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_methode_check');
            DB::statement("ALTER TABLE paiements ADD CONSTRAINT paiements_methode_check CHECK (methode IN ('lightning', 'paytech', 'wave_manuel', 'moyen_pays'))");
            DB::statement("ALTER TABLE moyens_paiement ADD CONSTRAINT moyens_paiement_type_check CHECK (type IN ('lien', 'numero'))");
            DB::statement('ALTER TABLE audios DROP CONSTRAINT IF EXISTS audios_langue_check');
        }

        // Audios : code de langue plus long, rattaché au catalogue.
        Schema::table('audios', function (Blueprint $table) {
            $table->string('langue', 12)->change();
        });
        Schema::table('audios', function (Blueprint $table) {
            $table->foreign('langue')->references('code')->on('langues')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('audios', function (Blueprint $table) {
            $table->dropForeign(['langue']);
        });
        Schema::table('audios', function (Blueprint $table) {
            $table->string('langue', 5)->change();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE audios ADD CONSTRAINT audios_langue_check CHECK (langue IN ('wo', 'srr', 'ff', 'dyo', 'fr'))");
            DB::statement('ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_methode_check');
            DB::statement("UPDATE paiements SET methode = 'wave_manuel' WHERE methode = 'moyen_pays'");
            DB::statement("ALTER TABLE paiements ADD CONSTRAINT paiements_methode_check CHECK (methode IN ('lightning', 'paytech', 'wave_manuel'))");
        }

        Schema::table('paiements', function (Blueprint $table) {
            $table->dropForeign(['moyen_paiement_id']);
            $table->dropColumn(['moyen_paiement_id', 'moyen']);
        });

        Schema::table('boutiques', function (Blueprint $table) {
            $table->dropForeign(['pays']);
            $table->dropIndex(['pays']);
            $table->dropColumn('pays');
        });

        Schema::dropIfExists('moyens_paiement_boutique');
        Schema::dropIfExists('moyens_paiement');
        Schema::dropIfExists('langues');
        Schema::dropIfExists('pays');
    }

    /** Graines idempotentes (une seconde exécution n'écrase rien de ce que le super-admin a modifié). */
    private function insererGraines(): void
    {
        $maintenant = now();

        DB::table('pays')->insertOrIgnore(array_map(fn (array $p) => $p + [
            'devise' => 'XOF', 'actif' => true, 'created_at' => $maintenant, 'updated_at' => $maintenant,
        ], CatalogueInitial::pays()));

        DB::table('langues')->insertOrIgnore(array_map(fn (array $l) => [
            'code' => $l['code'], 'nom_local' => $l['nom_local'], 'nom_fr' => $l['nom_fr'], 'nom_en' => $l['nom_en'],
            'pays' => json_encode($l['pays']), 'actif' => true, 'ordre' => $l['ordre'],
            'created_at' => $maintenant, 'updated_at' => $maintenant,
        ], CatalogueInitial::langues()));

        DB::table('moyens_paiement')->insertOrIgnore(array_map(fn (array $m) => $m + [
            'ulid' => (string) Str::ulid(), 'actif' => true, 'created_at' => $maintenant, 'updated_at' => $maintenant,
        ], CatalogueInitial::moyens()));
    }
};
