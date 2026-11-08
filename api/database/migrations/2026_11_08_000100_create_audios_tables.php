<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cles_audio', function (Blueprint $table) {
            $table->id();
            $table->string('cle', 120)->unique();
            $table->string('ecran', 60);
            $table->string('contexte', 200)->nullable();
            $table->string('texte_fr', 300);
            $table->string('texte_en', 300);
            $table->boolean('essentielle')->default(false);
            $table->unsignedInteger('ordre')->default(0);
            $table->boolean('presente_dans_code')->default(true);
            $table->timestamps();

            $table->index(['ecran', 'ordre']);
        });

        Schema::create('audios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cle_audio_id')->constrained('cles_audio')->cascadeOnDelete();
            $table->string('langue', 5);
            $table->string('chemin', 255);
            $table->char('empreinte', 64);
            $table->unsignedInteger('duree_ms')->default(0);
            $table->unsignedInteger('taille')->default(0);
            $table->string('statut', 20)->default('brouillon');
            $table->foreignId('enregistre_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('publie_at')->nullable();
            $table->timestamps();

            $table->index(['langue', 'statut']);
            $table->index(['cle_audio_id', 'langue']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE audios ADD CONSTRAINT audios_langue_check CHECK (langue IN ('wo', 'srr', 'ff', 'dyo', 'fr'))");
            DB::statement("ALTER TABLE audios ADD CONSTRAINT audios_statut_check CHECK (statut IN ('brouillon', 'publie'))");
            DB::statement("CREATE UNIQUE INDEX audios_publie_unique ON audios (cle_audio_id, langue) WHERE statut = 'publie'");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('audios');
        Schema::dropIfExists('cles_audio');
    }
};
