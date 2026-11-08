<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('imports', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type', 30);
            $table->string('fichier', 255);             // chemin généré par le serveur, hors racine web
            $table->jsonb('correspondance')->nullable();
            $table->string('statut', 20)->default('analyse');
            $table->jsonb('rapport')->nullable();
            $table->timestamps();

            $table->index(['boutique_id', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE imports ADD CONSTRAINT imports_statut_check CHECK (statut IN ('analyse', 'en_cours', 'termine', 'echoue'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('imports');
    }
};
