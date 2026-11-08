<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comptes_paytech', function (Blueprint $table) {
            $table->id();
            $table->foreignId('boutique_id')->unique()->constrained('boutiques')->cascadeOnDelete();
            $table->text('api_key_chiffree');
            $table->text('api_secret_chiffree');
            $table->string('environnement', 10)->default('test');
            $table->string('statut', 20)->default('actif');
            $table->timestamp('verifie_at')->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE comptes_paytech ADD CONSTRAINT comptes_paytech_env_check CHECK (environnement IN ('test', 'prod'))");
            DB::statement("ALTER TABLE comptes_paytech ADD CONSTRAINT comptes_paytech_statut_check CHECK (statut IN ('actif', 'erreur', 'revoque'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('comptes_paytech');
    }
};
