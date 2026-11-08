<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('articles', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->string('nom', 120);
            $table->unsignedBigInteger('prix_xof');
            $table->string('categorie', 60)->nullable();
            $table->string('couleur', 20)->nullable();
            $table->string('sku', 40)->nullable();
            $table->boolean('actif')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['boutique_id', 'actif', 'position']);
            $table->index(['boutique_id', 'categorie']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX articles_nom_trgm_idx ON articles USING gin (nom gin_trgm_ops)');
            DB::statement('CREATE UNIQUE INDEX articles_boutique_sku_unique ON articles (boutique_id, sku) WHERE sku IS NOT NULL');
            DB::statement('ALTER TABLE articles ADD CONSTRAINT articles_prix_check CHECK (prix_xof >= 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('articles');
    }
};
